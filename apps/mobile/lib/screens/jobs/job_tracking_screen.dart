import 'dart:async';
import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
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

class _JobTrackingScreenState extends State<JobTrackingScreen> {
  final MapController _mapController = MapController();

  StreamSubscription<Position>? _positionSubscription;

  final List<LatLng> _routePoints = [];

  List<LatLng> _serviceArea = [];

  Position? _currentPosition;

  LatLng? _simulatedPosition;

  late DocumentReference<Map<String, dynamic>> _routeReference;

  bool _tracking = false;

  bool _loading = true;

  bool _saving = false;

  bool _simulating = false;

  bool _routeIsSimulated = false;

  String? _errorMessage;

  int _pointsSinceLastSave = 0;

  @override
  void initState() {
    super.initState();

    final zoneData = widget.zone.data() as Map<String, dynamic>;

    final existingRouteId = zoneData['routeId']?.toString();

    if (existingRouteId != null && existingRouteId.isNotEmpty) {
      _routeReference = FirebaseFirestore.instance
          .collection('campaignRoutes')
          .doc(existingRouteId);
    } else {
      _routeReference = FirebaseFirestore.instance
          .collection('campaignRoutes')
          .doc();
    }

    _initialize();
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();

    _mapController.dispose();

    super.dispose();
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

      final serviceArea = _parsePoints(zoneData['serviceArea']);

      final routeSnapshot = await _routeReference.get();

      final existingRoute = routeSnapshot.exists
          ? _parsePoints(routeSnapshot.data()?['points'])
          : <LatLng>[];

      final simulated = routeSnapshot.data()?['simulated'] == true;

      final tracking = routeSnapshot.data()?['tracking'] == true;

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
      if (item is! Map) {
        continue;
      }

      final latitude = item['latitude'];

      final longitude = item['longitude'];

      if (latitude is num && longitude is num) {
        points.add(LatLng(latitude.toDouble(), longitude.toDouble()));
      }
    }

    return points;
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

      setState(() {
        _currentPosition = position;

        _simulatedPosition = null;

        _tracking = true;

        _routeIsSimulated = false;

        _errorMessage = null;
      });

      _addRoutePoint(point);

      await _routeReference.set({
        'campaignId': widget.campaign.id,

        'zoneId': widget.zone.id,

        'zoneName': zoneData['zoneName'],

        'scalerId': user.uid,

        'scalerEmail': user.email,

        'tracking': true,

        'simulated': false,

        'startedAt': FieldValue.serverTimestamp(),

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

        _errorMessage = e.toString();
      });
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

    if (_pointsSinceLastSave >= 5) {
      _pointsSinceLastSave = 0;

      _saveRouteProgress();
    }
  }

  Future<void> _saveRouteProgress() async {
    try {
      await _routeReference.set({
        'points': _serializePoints(),

        'pointCount': _routePoints.length,

        'tracking': _tracking,

        'simulated': _routeIsSimulated,

        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (e) {
      debugPrint('Route save failed: $e');
    }
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

    final longitudes = _serviceArea.map((p) => p.longitude).toList();

    final minLat = latitudes.reduce(math.min);

    final maxLat = latitudes.reduce(math.max);

    final centerLat = (minLat + maxLat) / 2;

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
                ElevatedButton(
                  onPressed: _tracking ? null : _startTracking,

                  child: const Text('Start GPS Tracking'),
                ),

                ElevatedButton(
                  onPressed: _tracking ? _simulateMovement : null,

                  child: Text(
                    _simulating
                        ? 'Generating Route...'
                        : 'Simulate Walking Route',
                  ),
                ),

                ElevatedButton(
                  onPressed: _tracking ? _stopTracking : null,

                  child: const Text('Stop & Save'),
                ),

                ElevatedButton.icon(
                  icon: const Icon(Icons.assignment_turned_in),

                  label: const Text('Submit Completion'),

                  onPressed: !_tracking
                      ? () {
                          final campaignData =
                              widget.campaign.data() as Map<String, dynamic>;

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
