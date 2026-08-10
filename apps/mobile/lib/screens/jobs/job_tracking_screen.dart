import 'dart:async';
import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../../services/campaign/campaign_proof_policy.dart';
import '../scaler/completion/submit_completion_screen.dart';

class JobTrackingScreen extends StatefulWidget {
  final DocumentSnapshot campaign;
  final DocumentSnapshot zone;

  const JobTrackingScreen({
    super.key,
    required this.campaign,
    required this.zone,
  });

  @override
  State<JobTrackingScreen> createState() => _JobTrackingScreenState();
}

class _JobTrackingScreenState extends State<JobTrackingScreen>
    with WidgetsBindingObserver {
  static const bool _allowGpsSimulation = !kReleaseMode;

  final MapController _mapController = MapController();

  StreamSubscription<Position>? _positionSubscription;

  final List<LatLng> _routePoints = [];

  List<LatLng> _serviceArea = [];

  Position? _currentPosition;

  LatLng? _simulatedPosition;

  late DocumentReference<Map<String, dynamic>> _routeReference;

  bool _existingRouteExpected = false;

  bool _tracking = false;

  bool _loading = true;

  bool _saving = false;

  bool _simulating = false;

  bool _routeIsSimulated = false;

  String? _errorMessage;

  int _pointsSinceLastSave = 0;

  Future<void> _routeSaveChain = Future<void>.value();

  double? _lastAccuracyMeters;

  DateTime? _lastSavedAt;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addObserver(this);

    final zoneData = widget.zone.data() as Map<String, dynamic>;

    final existingRouteId = zoneData['routeId']?.toString();

    if (existingRouteId != null && existingRouteId.isNotEmpty) {
      _routeReference = FirebaseFirestore.instance
          .collection('campaignRoutes')
          .doc(existingRouteId);

      _existingRouteExpected = true;
    } else {
      _routeReference = FirebaseFirestore.instance
          .collection('campaignRoutes')
          .doc();
    }

    _initialize();
  }

  @override
  void dispose() {
    if (_tracking) {
      _queueRouteSave();
    }

    WidgetsBinding.instance.removeObserver(this);

    _positionSubscription?.cancel();

    _mapController.dispose();

    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_tracking && state != AppLifecycleState.resumed) {
      _queueRouteSave();
    }
  }

  Future<void> _initialize() async {
    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception('You must be logged in.');
      }

      final zoneSnapshot = await widget.zone.reference.get();

      if (!zoneSnapshot.exists) {
        throw Exception('This zone no longer exists.');
      }

      final zoneData = zoneSnapshot.data() as Map<String, dynamic>;

      final assignedScalerId = zoneData['assignedScalerId']?.toString();

      if (assignedScalerId != user.uid) {
        throw Exception('This zone is not assigned to you.');
      }

      var serviceArea = _serviceAreaFromData(zoneData);

      if (serviceArea.length < 3) {
        final campaignData = widget.campaign.data();

        if (campaignData is Map<String, dynamic>) {
          serviceArea = _serviceAreaFromData(campaignData);
        }
      }

      Map<String, dynamic>? routeData;

      if (_existingRouteExpected) {
        try {
          final routeSnapshot = await _routeReference.get();

          routeData = routeSnapshot.data();
        } on FirebaseException catch (error) {
          if (error.code != 'permission-denied') {
            rethrow;
          }

          // The zone may have been reassigned while still referencing the
          // previous Scaler's protected route. Preserve that evidence and
          // start a fresh route for the current assignment.
          _routeReference = FirebaseFirestore.instance
              .collection('campaignRoutes')
              .doc();

          _existingRouteExpected = false;
        }
      }

      final existingRoute = _parsePoints(routeData?['points']);

      final simulated = routeData?['simulated'] == true;

      var tracking = routeData?['tracking'] == true;

      if (tracking) {
        // Mobile browsers can terminate a page without letting the GPS stream
        // finish. Preserve the recorded points and make the route resumable
        // instead of leaving the assignment permanently stuck "tracking".
        await _routeReference.set({
          'tracking': false,
          'interruptedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        await widget.zone.reference.update({
          'gpsTracking': false,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        tracking = false;
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _serviceArea = serviceArea;

        _routePoints
          ..clear()
          ..addAll(existingRoute);

        _routeIsSimulated = simulated;

        _tracking = tracking;

        if (_routePoints.isNotEmpty && simulated) {
          _simulatedPosition = _routePoints.last;
        }

        _loading = false;
      });

      if (_serviceArea.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) {
            return;
          }

          try {
            _mapController.move(_calculateCenter(_serviceArea), 16);
          } catch (_) {}
        });
      }
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = 'Unable to load tracking data: $e';

        _loading = false;
      });
    }
  }

  List<LatLng> _parsePoints(dynamic rawPoints) {
    if (rawPoints is! List) {
      return [];
    }

    final points = <LatLng>[];

    for (final item in rawPoints) {
      if (item is GeoPoint) {
        points.add(LatLng(item.latitude, item.longitude));

        continue;
      }

      if (item is! Map) {
        continue;
      }

      final latitude = item['latitude'] ?? item['lat'];

      final longitude = item['longitude'] ?? item['lng'];

      if (latitude is num && longitude is num) {
        points.add(LatLng(latitude.toDouble(), longitude.toDouble()));
      }
    }

    return points;
  }

  List<LatLng> _serviceAreaFromData(Map<String, dynamic> data) {
    final points = _parsePoints(data['serviceArea']);

    if (points.length >= 3) {
      return points;
    }

    final rawCenter = data['serviceAreaCenter'];

    final radius = (data['serviceAreaRadiusMeters'] as num?)?.toDouble();

    LatLng? center;

    if (rawCenter is GeoPoint) {
      center = LatLng(rawCenter.latitude, rawCenter.longitude);
    } else if (rawCenter is Map) {
      final latitude = rawCenter['latitude'] ?? rawCenter['lat'];

      final longitude = rawCenter['longitude'] ?? rawCenter['lng'];

      if (latitude is num && longitude is num) {
        center = LatLng(latitude.toDouble(), longitude.toDouble());
      }
    }

    if (center == null || radius == null || radius <= 0) {
      return [];
    }

    const pointCount = 48;

    const metersPerDegreeLatitude = 111320.0;

    final metersPerDegreeLongitude =
        metersPerDegreeLatitude * math.cos(center.latitude * math.pi / 180);

    return List.generate(pointCount, (index) {
      final angle = (2 * math.pi * index) / pointCount;

      return LatLng(
        center!.latitude +
            (math.sin(angle) * radius / metersPerDegreeLatitude),
        center.longitude +
            (math.cos(angle) * radius / metersPerDegreeLongitude),
      );
    });
  }

  LatLng _calculateCenter(List<LatLng> points) {
    if (points.isEmpty) {
      return const LatLng(39.2904, -76.6122);
    }

    double lat = 0;

    double lng = 0;

    for (final point in points) {
      lat += point.latitude;

      lng += point.longitude;
    }

    return LatLng(lat / points.length, lng / points.length);
  }

  String _zoneName() {
    final data = widget.zone.data();

    if (data is Map<String, dynamic>) {
      return data['zoneName']?.toString() ?? 'Assigned Zone';
    }

    return 'Assigned Zone';
  }

  Future<bool> _checkLocationPermission() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();

    if (!serviceEnabled) {
      if (!mounted) {
        return false;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Location services are disabled.')),
      );

      return false;
    }

    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      if (!mounted) {
        return false;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Location permission denied.')),
      );

      return false;
    }

    if (permission == LocationPermission.deniedForever) {
      if (!mounted) {
        return false;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enable location permission in settings.'),
        ),
      );

      return false;
    }

    return true;
  }

  Future<void> _startTracking() async {
    if (_tracking) {
      return;
    }

    final allowed = await _checkLocationPermission();

    if (!allowed) {
      return;
    }

    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception('You must be logged in.');
      }

      final zoneSnapshot = await widget.zone.reference.get();

      if (!zoneSnapshot.exists) {
        throw Exception('Zone no longer exists.');
      }

      final zoneData = zoneSnapshot.data() as Map<String, dynamic>;

      if (zoneData['assignedScalerId']?.toString() != user.uid) {
        throw Exception('Zone is not assigned to you.');
      }

      final status = zoneData['status']?.toString() ?? 'assigned';

      if (status != 'in_progress') {
        throw Exception('Start the job before GPS tracking.');
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      final point = LatLng(position.latitude, position.longitude);

      _lastAccuracyMeters = position.accuracy;

      _addRoutePoint(point);

      await _routeReference.set({
        'campaignId': widget.campaign.id,

        'zoneId': widget.zone.id,

        'zoneName': zoneData['zoneName'],

        'scalerId': user.uid,

        'scalerEmail': user.email,

        'tracking': true,

        'simulated': false,

        if (_routePoints.length <= 1)
          'startedAt': FieldValue.serverTimestamp()
        else
          'resumedAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),

        'points': _serializePoints(),

        'pointCount': _routePoints.length,
      }, SetOptions(merge: true));

      await widget.zone.reference.update({
        'routeId': _routeReference.id,

        'gpsTracking': true,

        'gpsTrackingStartedAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) {
        return;
      }

      setState(() {
        _currentPosition = position;

        _simulatedPosition = null;

        _tracking = true;

        _routeIsSimulated = false;

        _errorMessage = null;
      });

      _positionSubscription =
          Geolocator.getPositionStream(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,

              distanceFilter: 5,
            ),
          ).listen(
            (position) {
              if (!mounted) {
                return;
              }

              final point = LatLng(position.latitude, position.longitude);

              setState(() {
                _currentPosition = position;

                _lastAccuracyMeters = position.accuracy;
              });

              _addRoutePoint(point);
            },

            onError: (error) {
              if (!mounted) {
                return;
              }

              setState(() {
                _errorMessage = 'GPS Error: $error';
              });
            },
          );
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _tracking = false;

        _errorMessage = 'Unable to start GPS tracking: $e';
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_errorMessage!)),
      );
    }
  }

  void _addRoutePoint(LatLng point) {
    if (_routePoints.isNotEmpty) {
      final last = _routePoints.last;

      final distance = Geolocator.distanceBetween(
        last.latitude,

        last.longitude,

        point.latitude,

        point.longitude,
      );

      if (distance < 3) {
        return;
      }
    }

    setState(() {
      _routePoints.add(point);
    });

    _pointsSinceLastSave++;

    if (_pointsSinceLastSave >= 3) {
      _pointsSinceLastSave = 0;

      _queueRouteSave();
    }
  }

  void _queueRouteSave() {
    final points = _serializePoints();
    final tracking = _tracking;
    final simulated = _routeIsSimulated;
    final accuracy = _lastAccuracyMeters;

    _routeSaveChain = _routeSaveChain.then((_) async {
      try {
        await _routeReference.set({
          'points': points,
          'pointCount': points.length,
          'tracking': tracking,
          'simulated': simulated,
          'lastAccuracyMeters': ?accuracy,
          'lastPositionAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        if (mounted) {
          setState(() => _lastSavedAt = DateTime.now());
        }
      } catch (error) {
        debugPrint('Route save failed: $error');
        if (mounted) {
          setState(() {
            _errorMessage =
                'GPS is still recording, but the latest autosave failed. '
                'Keep this page open and tap Stop & Save when connected.';
          });
        }
      }
    });
  }

  Future<void> _flushRouteSaves() async {
    _queueRouteSave();
    await _routeSaveChain;
  }

  List<Map<String, dynamic>> _serializePoints() {
    return _routePoints
        .map(
          (point) => {'latitude': point.latitude, 'longitude': point.longitude},
        )
        .toList();
  }

  Future<void> _stopTracking() async {
    if (!_tracking) {
      return;
    }

    setState(() {
      _saving = true;
    });

    try {
      await _positionSubscription?.cancel();

      _positionSubscription = null;

      await _flushRouteSaves();

      await _routeReference.set({
        'tracking': false,

        'simulated': _routeIsSimulated,

        'points': _serializePoints(),

        'pointCount': _routePoints.length,

        'endedAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      await widget.zone.reference.update({
        'gpsTracking': false,

        'gpsRoutePointCount': _routePoints.length,

        'gpsRouteSimulated': _routeIsSimulated,

        'gpsTrackingEndedAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) {
        return;
      }

      setState(() {
        _tracking = false;
      });

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('${_zoneName()} route saved.')));
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Save failed: $e')));
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  List<LatLng> _buildSimulatedRoute() {
    if (_serviceArea.length < 3) {
      return [];
    }

    final latitudes = _serviceArea.map((p) => p.latitude).toList();

    final minLat = latitudes.reduce(math.min);

    final maxLat = latitudes.reduce(math.max);

    const metersPerDegreeLatitude = 111320.0;

    final spacing = 20 / metersPerDegreeLatitude;

    final route = <LatLng>[];

    int row = 0;

    for (double lat = minLat; lat <= maxLat; lat += spacing) {
      final intersections = <double>[];

      for (int i = 0; i < _serviceArea.length; i++) {
        final current = _serviceArea[i];

        final next = _serviceArea[(i + 1) % _serviceArea.length];

        if (current.latitude == next.latitude) {
          continue;
        }

        if (lat < math.min(current.latitude, next.latitude) ||
            lat >= math.max(current.latitude, next.latitude)) {
          continue;
        }

        final ratio =
            (lat - current.latitude) / (next.latitude - current.latitude);

        final lng =
            current.longitude + (next.longitude - current.longitude) * ratio;

        intersections.add(lng);
      }

      intersections.sort();

      for (int i = 0; i + 1 < intersections.length; i += 2) {
        var startLng = intersections[i];

        var endLng = intersections[i + 1];

        final left = LatLng(lat, startLng);

        final right = LatLng(lat, endLng);

        final start = row.isEven ? left : right;

        final end = row.isEven ? right : left;

        final distance = Distance().as(LengthUnit.Meter, start, end);

        final steps = math.max(1, (distance / 10).ceil());

        for (int step = 0; step <= steps; step++) {
          final percent = step / steps;

          route.add(
            LatLng(
              start.latitude,

              start.longitude + (end.longitude - start.longitude) * percent,
            ),
          );
        }

        row++;
      }
    }

    if (route.length >= 2) {
      return route;
    }

    return _buildSimulatedPerimeterRoute();
  }

  List<LatLng> _buildSimulatedPerimeterRoute() {
    final route = <LatLng>[];

    for (int i = 0; i < _serviceArea.length; i++) {
      final start = _serviceArea[i];

      final end = _serviceArea[(i + 1) % _serviceArea.length];

      final distance = const Distance().as(LengthUnit.Meter, start, end);

      final steps = math.max(1, (distance / 10).ceil());

      for (int step = 0; step <= steps; step++) {
        final percent = step / steps;

        route.add(
          LatLng(
            start.latitude + (end.latitude - start.latitude) * percent,
            start.longitude + (end.longitude - start.longitude) * percent,
          ),
        );
      }
    }

    return route;
  }

  Future<void> _simulateMovement() async {
    if (!_tracking || _simulating) {
      return;
    }

    setState(() {
      _simulating = true;
    });

    try {
      if (_serviceArea.length < 3) {
        throw Exception(
          'The assigned zone does not contain a usable mapped service area.',
        );
      }

      final simulatedRoute = _buildSimulatedRoute();

      if (simulatedRoute.length < 2) {
        throw Exception('Could not generate walking route.');
      }

      setState(() {
        _routePoints
          ..clear()
          ..addAll(simulatedRoute);

        _simulatedPosition = simulatedRoute.last;

        _routeIsSimulated = true;

        _currentPosition = null;
      });

      await _routeReference.set({
        'points': _serializePoints(),

        'pointCount': _routePoints.length,

        'tracking': true,

        'simulated': true,

        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      _mapController.move(_calculateCenter(simulatedRoute), 16);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Generated ${_routePoints.length} GPS coverage points.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Route generation failed: $e')));
      }
    } finally {
      if (mounted) {
        setState(() {
          _simulating = false;
        });
      }
    }
  }

  Future<void> _clearRoute() async {
    if (_tracking) {
      return;
    }

    await _routeReference.delete();

    await widget.zone.reference.update({
      'routeId': FieldValue.delete(),

      'gpsRoutePointCount': 0,

      'gpsRouteSimulated': false,
    });

    setState(() {
      _routePoints.clear();

      _simulatedPosition = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final center =
        _simulatedPosition ??
        (_currentPosition != null
            ? LatLng(_currentPosition!.latitude, _currentPosition!.longitude)
            : _calculateCenter(_serviceArea));

    final rawCampaignData = widget.campaign.data();
    final campaignData = rawCampaignData is Map
        ? Map<String, dynamic>.from(rawCampaignData)
        : <String, dynamic>{};
    final campaignType = campaignData['campaignType']?.toString();
    final requiresPhotoProof = CampaignProofPolicy.requiresPhotos(
      campaignType,
    );

    return Scaffold(
      appBar: AppBar(title: Text('${_zoneName()} GPS')),

      body: Column(
        children: [
          Expanded(
            child: FlutterMap(
              mapController: _mapController,

              options: MapOptions(initialCenter: center, initialZoom: 16),

              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

                  userAgentPackageName: 'com.scaledcircle.app',
                ),

                if (_serviceArea.length >= 3)
                  PolygonLayer(
                    polygons: [
                      Polygon(points: _serviceArea, borderStrokeWidth: 3),
                    ],
                  ),

                if (_routePoints.length >= 2)
                  PolylineLayer(
                    polylines: [Polyline(points: _routePoints, strokeWidth: 5)],
                  ),

                MarkerLayer(
                  markers: [
                    if (_currentPosition != null &&
                        _simulatedPosition == null)
                      Marker(
                        point: LatLng(
                          _currentPosition!.latitude,
                          _currentPosition!.longitude,
                        ),
                        width: 48,
                        height: 48,
                        child: const Icon(
                          Icons.my_location,
                          size: 38,
                          color: Colors.blue,
                        ),
                      ),
                    if (_simulatedPosition != null)
                      Marker(
                        point: _simulatedPosition!,

                        width: 45,

                        height: 45,

                        child: const Icon(Icons.location_on, size: 40),
                      ),
                  ],
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16),

            child: Column(
              children: [
                if (_errorMessage != null) ...[
                  Text(
                    _errorMessage!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),

                  const SizedBox(height: 12),
                ],

                Card(
                  child: ListTile(
                    leading: Icon(
                      _tracking ? Icons.gps_fixed : Icons.route_outlined,
                      color: _tracking ? Colors.green : null,
                    ),
                    title: Text(
                      _tracking
                          ? 'Live device GPS is recording'
                          : _routePoints.isEmpty
                          ? 'Device GPS is ready'
                          : 'GPS route saved and ready',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Text(
                      '${_routePoints.length} recorded points'
                      '${_lastAccuracyMeters == null ? '' : ' • ±${_lastAccuracyMeters!.round()} m accuracy'}'
                      '${_lastSavedAt == null ? '' : ' • autosaved'}\n'
                      '${kIsWeb ? 'Keep this page open and your screen awake while working. Mobile browsers may pause GPS when the screen locks or the tab is backgrounded.' : 'Your route autosaves as you move.'}',
                    ),
                  ),
                ),

                const SizedBox(height: 8),

                ElevatedButton(
                  onPressed: _tracking ? null : _startTracking,

                  child: const Text('Start GPS Tracking'),
                ),

                if (_allowGpsSimulation)
                  ElevatedButton(
                    onPressed: _tracking ? _simulateMovement : null,

                    child: Text(
                      _simulating
                          ? 'Generating Test Route...'
                          : 'Simulate Walking Route (Test Only)',
                    ),
                  ),

                ElevatedButton(
                  onPressed: _tracking && !_saving ? _stopTracking : null,

                  child: Text(_saving ? 'Saving Route...' : 'Stop & Save'),
                ),

                if (requiresPhotoProof)
                  const Card(
                    child: ListTile(
                      leading: Icon(Icons.photo_camera_outlined),
                      title: Text('Photo Proof Required'),
                      subtitle: Text(
                        'Save this GPS evidence, then use the field-service '
                        'job screen to add the required photos.',
                      ),
                    ),
                  )
                else
                  ElevatedButton.icon(
                    icon: const Icon(Icons.assignment_turned_in),

                    label: const Text('Submit GPS Completion'),

                    onPressed: !_tracking && _routePoints.length >= 2
                        ? () {
                            final businessId =
                                campaignData['businessId']?.toString() ?? '';

                            if (businessId.isEmpty) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Business information unavailable.',
                                  ),
                                ),
                              );

                              return;
                            }

                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => SubmitCompletionScreen(
                                  campaignId: widget.campaign.id,
                                  businessId: businessId,
                                  zoneId: widget.zone.id,
                                  zoneName: _zoneName(),
                                  routeId: _routeReference.id,
                                  gpsPointCount: _routePoints.length,
                                  routeSimulated: _routeIsSimulated,
                                ),
                              ),
                            );
                          }
                        : null,
                  ),

                OutlinedButton(
                  onPressed: _clearRoute,

                  child: const Text('Clear Route'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
