import 'dart:async';
import 'dart:math' as math;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

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

  bool _tracking = false;
  bool _loading = true;
  bool _saving = false;
  bool _simulating = false;
  bool _routeIsSimulated = false;

  String? _errorMessage;

  int _pointsSinceLastSave = 0;

  late final DocumentReference<Map<String, dynamic>> _routeReference;

  @override
  void initState() {
    super.initState();

    _routeReference = FirebaseFirestore.instance
        .collection('campaignRoutes')
        .doc(widget.zone.id);

    _initialize();
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
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

      final routeIsSimulated = routeSnapshot.data()?['simulated'] == true;

      final routeTracking = routeSnapshot.data()?['tracking'] == true;

      if (!mounted) {
        return;
      }

      setState(() {
        _serviceArea = serviceArea;

        _routePoints
          ..clear()
          ..addAll(existingRoute);

        _routeIsSimulated = routeIsSimulated;

        _tracking = routeTracking;

        if (_routeIsSimulated && _routePoints.isNotEmpty) {
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
          } catch (_) {
            // Map may not yet be attached.
          }
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

    double totalLatitude = 0;
    double totalLongitude = 0;

    for (final point in points) {
      totalLatitude += point.latitude;

      totalLongitude += point.longitude;
    }

    return LatLng(
      totalLatitude / points.length,
      totalLongitude / points.length,
    );
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
        const SnackBar(
          content: Text(
            'Location services are disabled. Turn on location services and try again.',
          ),
        ),
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
        const SnackBar(content: Text('Location permission was denied.')),
      );

      return false;
    }

    if (permission == LocationPermission.deniedForever) {
      if (!mounted) {
        return false;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Location permission is permanently denied. Enable it in your device settings.',
          ),
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
        throw Exception('You must be logged in to track a zone.');
      }

      final zoneSnapshot = await widget.zone.reference.get();

      if (!zoneSnapshot.exists) {
        throw Exception('This zone no longer exists.');
      }

      final zoneData = zoneSnapshot.data() as Map<String, dynamic>;

      if (zoneData['assignedScalerId']?.toString() != user.uid) {
        throw Exception('This zone is not assigned to you.');
      }

      final zoneStatus = zoneData['status']?.toString() ?? 'assigned';

      if (zoneStatus != 'in_progress') {
        throw Exception('Start the zone before starting GPS tracking.');
      }

      final currentPosition = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      if (!mounted) {
        return;
      }

      final currentPoint = LatLng(
        currentPosition.latitude,
        currentPosition.longitude,
      );

      setState(() {
        _currentPosition = currentPosition;

        _simulatedPosition = null;

        _tracking = true;

        _routeIsSimulated = false;

        _errorMessage = null;
      });

      _addRoutePoint(currentPoint);

      try {
        _mapController.move(currentPoint, 17);
      } catch (_) {
        // Map may not yet be attached.
      }

      final batch = FirebaseFirestore.instance.batch();

      batch.set(_routeReference, {
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

      batch.update(widget.zone.reference, {
        'routeId': _routeReference.id,
        'gpsTracking': true,
        'gpsTrackingStartedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      await batch.commit();

      const settings = LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
      );

      _positionSubscription =
          Geolocator.getPositionStream(locationSettings: settings).listen(
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
                _errorMessage = 'GPS error: $error';
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
    }
  }

  void _addRoutePoint(LatLng point) {
    if (_routePoints.isNotEmpty) {
      final lastPoint = _routePoints.last;

      final distance = Geolocator.distanceBetween(
        lastPoint.latitude,
        lastPoint.longitude,
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

  Future<void> _simulateMovement() async {
    if (!_tracking) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Start GPS tracking before simulating movement.'),
        ),
      );

      return;
    }

    if (_simulating) {
      return;
    }

    setState(() {
      _simulating = true;
    });

    try {
      await _positionSubscription?.cancel();

      _positionSubscription = null;

      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception('You must be logged in.');
      }

      final simulatedRoute = _buildSimulatedRoute();

      if (simulatedRoute.length < 2) {
        throw Exception('Unable to create a simulated route.');
      }

      setState(() {
        _routePoints
          ..clear()
          ..addAll(simulatedRoute);

        _simulatedPosition = simulatedRoute.last;

        _routeIsSimulated = true;

        _currentPosition = null;

        _pointsSinceLastSave = 0;
      });

      await _routeReference.set({
        'campaignId': widget.campaign.id,
        'zoneId': widget.zone.id,
        'zoneName': _zoneName(),
        'scalerId': user.uid,
        'scalerEmail': user.email,
        'tracking': true,
        'simulated': true,
        'points': _serializePoints(),
        'pointCount': _routePoints.length,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      try {
        _mapController.move(_calculateCenter(simulatedRoute), 16);
      } catch (_) {
        // Map may not yet be attached.
      }

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Simulated ${_routePoints.length} GPS route points for ${_zoneName()}.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to simulate movement: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _simulating = false;
        });
      }
    }
  }

  List<LatLng> _buildSimulatedRoute() {
    if (_serviceArea.length >= 3) {
      final latitudes = _serviceArea.map((point) => point.latitude).toList();

      final minLat = latitudes.reduce((a, b) => a < b ? a : b);

      final maxLat = latitudes.reduce((a, b) => a > b ? a : b);

      /*
     * Sweep spacing for simulation.
     *
     * Around 20 meters between passes gives us
     * a more realistic canvassing-style path
     * than simply walking around the perimeter.
     */
      const targetSweepSpacingMeters = 20.0;

      const metersPerDegreeLatitude = 111320.0;

      final centerLatitude = (minLat + maxLat) / 2.0;

      final metersPerDegreeLongitude =
          111320.0 * math.cos(centerLatitude * math.pi / 180.0);

      final sweepSpacingLatitude =
          targetSweepSpacingMeters / metersPerDegreeLatitude;

      final route = <LatLng>[];

      int rowIndex = 0;

      /*
     * Sweep horizontally across the mapped polygon.
     *
     * Each latitude row is intersected with the
     * polygon boundary. The resulting inside
     * sections become simulated walking paths.
     */
      for (
        double latitude = minLat;
        latitude <= maxLat;
        latitude += sweepSpacingLatitude
      ) {
        final intersections = <double>[];

        /*
       * Find every place this latitude row crosses
       * the service-area polygon.
       */
        for (int i = 0; i < _serviceArea.length; i++) {
          final current = _serviceArea[i];

          final next = _serviceArea[(i + 1) % _serviceArea.length];

          final minEdgeLat = math.min(current.latitude, next.latitude);

          final maxEdgeLat = math.max(current.latitude, next.latitude);

          /*
         * Horizontal polygon edges do not produce
         * a useful scan-line intersection.
         */
          if (current.latitude == next.latitude) {
            continue;
          }

          /*
         * Skip polygon edges that this latitude
         * row does not cross.
         */
          if (latitude < minEdgeLat || latitude >= maxEdgeLat) {
            continue;
          }

          final fraction =
              (latitude - current.latitude) /
              (next.latitude - current.latitude);

          final longitude =
              current.longitude +
              (next.longitude - current.longitude) * fraction;

          intersections.add(longitude);
        }

        intersections.sort();

        if (intersections.length < 2) {
          continue;
        }

        /*
       * Irregular polygons can produce more than
       * two intersections on a single scan line.
       *
       * Every pair represents a section that is
       * inside the service area.
       */
        for (int i = 0; i + 1 < intersections.length; i += 2) {
          var startLongitude = intersections[i];

          var endLongitude = intersections[i + 1];

          /*
         * Pull both ends about 2 meters inward.
         *
         * This prevents floating-point rounding
         * near the polygon boundary from causing
         * route segments to be considered outside
         * the assigned zone.
         */
          final edgePaddingDegrees = metersPerDegreeLongitude <= 0.0
              ? 0.0
              : 2.0 / metersPerDegreeLongitude;

          startLongitude += edgePaddingDegrees;

          endLongitude -= edgePaddingDegrees;

          if (endLongitude <= startLongitude) {
            continue;
          }

          final left = LatLng(latitude, startLongitude);

          final right = LatLng(latitude, endLongitude);

          /*
         * Alternate direction on each row so the
         * simulated route moves back and forth
         * through the neighborhood instead of
         * repeatedly jumping to the same side.
         */
          final start = rowIndex.isEven ? left : right;

          final end = rowIndex.isEven ? right : left;

          /*
         * Add GPS samples approximately every
         * 10 meters along this sweep.
         */
          final segmentDistanceMeters = Distance().as(
            LengthUnit.Meter,
            start,
            end,
          );

          final steps = math.max(1, (segmentDistanceMeters / 10.0).ceil());

          for (int step = 0; step <= steps; step++) {
            final fraction = step / steps;

            route.add(
              LatLng(
                start.latitude + (end.latitude - start.latitude) * fraction,
                start.longitude + (end.longitude - start.longitude) * fraction,
              ),
            );
          }

          rowIndex++;
        }
      }

      /*
     * If the polygon sweep produced a usable
     * simulated route, use it.
     */
      if (route.length >= 2) {
        return route;
      }
    }

    /*
   * Development fallback.
   *
   * This should normally only be reached when
   * the zone does not contain a valid mapped
   * service area.
   */
    LatLng center;

    if (_currentPosition != null) {
      center = LatLng(_currentPosition!.latitude, _currentPosition!.longitude);
    } else {
      center = const LatLng(39.2904, -76.6122);
    }

    return [
      LatLng(center.latitude, center.longitude),
      LatLng(center.latitude + 0.00010, center.longitude),
      LatLng(center.latitude + 0.00015, center.longitude + 0.00010),
      LatLng(center.latitude + 0.00010, center.longitude + 0.00020),
      LatLng(center.latitude, center.longitude + 0.00020),
      LatLng(center.latitude - 0.00005, center.longitude + 0.00010),
      LatLng(center.latitude, center.longitude),
    ];
  }

  Future<void> _saveRouteProgress() async {
    try {
      await _routeReference.set({
        'campaignId': widget.campaign.id,
        'zoneId': widget.zone.id,
        'zoneName': _zoneName(),
        'tracking': true,
        'simulated': _routeIsSimulated,
        'points': _serializePoints(),
        'pointCount': _routePoints.length,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (e) {
      debugPrint('Unable to save route progress: $e');
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

      final batch = FirebaseFirestore.instance.batch();

      batch.set(_routeReference, {
        'campaignId': widget.campaign.id,
        'zoneId': widget.zone.id,
        'zoneName': _zoneName(),
        'tracking': false,
        'simulated': _routeIsSimulated,
        'points': _serializePoints(),
        'pointCount': _routePoints.length,
        'endedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
        'completedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      batch.update(widget.zone.reference, {
        'routeId': _routeReference.id,
        'gpsTracking': false,
        'gpsRoutePointCount': _routePoints.length,
        'gpsRouteSimulated': _routeIsSimulated,
        'gpsTrackingEndedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      await batch.commit();

      if (!mounted) {
        return;
      }

      setState(() {
        _tracking = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${_zoneName()} route saved with ${_routePoints.length} GPS points.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to save route: $e')));
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _clearTestRoute() async {
    if (_tracking) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Stop tracking before clearing the route.'),
        ),
      );

      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Clear Test Route'),
          content: Text(
            'Delete the currently recorded GPS route for ${_zoneName()}?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Clear'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      final batch = FirebaseFirestore.instance.batch();

      batch.delete(_routeReference);

      batch.update(widget.zone.reference, {
        'routeId': FieldValue.delete(),
        'gpsTracking': false,
        'gpsRoutePointCount': 0,
        'gpsRouteSimulated': FieldValue.delete(),
        'gpsTrackingStartedAt': FieldValue.delete(),
        'gpsTrackingEndedAt': FieldValue.delete(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      await batch.commit();

      if (!mounted) {
        return;
      }

      setState(() {
        _routePoints.clear();

        _currentPosition = null;

        _simulatedPosition = null;

        _routeIsSimulated = false;
      });

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Test route cleared.')));
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to clear route: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_errorMessage != null && _serviceArea.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Zone GPS Tracking')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Text(_errorMessage!, textAlign: TextAlign.center),
          ),
        ),
      );
    }

    final mapPoints = _serviceArea.isNotEmpty ? _serviceArea : _routePoints;

    LatLng center;

    if (_simulatedPosition != null) {
      center = _simulatedPosition!;
    } else if (_currentPosition != null) {
      center = LatLng(_currentPosition!.latitude, _currentPosition!.longitude);
    } else {
      center = _calculateCenter(mapPoints);
    }

    final currentMapPoint =
        _simulatedPosition ??
        (_currentPosition != null
            ? LatLng(_currentPosition!.latitude, _currentPosition!.longitude)
            : null);

    return Scaffold(
      appBar: AppBar(
        title: Text('${_zoneName()} GPS Tracking'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Text(
                  _zoneName(),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 8),

                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(_tracking ? Icons.gps_fixed : Icons.gps_not_fixed),

                    const SizedBox(width: 8),

                    Text(
                      _tracking
                          ? 'GPS Tracking Active'
                          : 'GPS Tracking Stopped',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 17,
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 6),

                Text(
                  '${_routePoints.length} route point${_routePoints.length == 1 ? '' : 's'} recorded',
                ),

                if (_routeIsSimulated) ...[
                  const SizedBox(height: 6),

                  const Text(
                    'Development simulation route',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],

                if (_errorMessage != null) ...[
                  const SizedBox(height: 6),

                  Text(_errorMessage!, textAlign: TextAlign.center),
                ],
              ],
            ),
          ),

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
                      Polygon(
                        points: _serviceArea,
                        borderStrokeWidth: 3,
                        color: Colors.blue.withValues(alpha: 0.15),
                        borderColor: Colors.blue,
                      ),
                    ],
                  ),

                if (_routePoints.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _routePoints,
                        strokeWidth: 5,
                        color: Colors.green,
                      ),
                    ],
                  ),

                MarkerLayer(
                  markers: [
                    if (currentMapPoint != null)
                      Marker(
                        point: currentMapPoint,
                        width: 48,
                        height: 48,
                        child: Icon(
                          _routeIsSimulated
                              ? Icons.location_on
                              : Icons.my_location,
                          size: 38,
                          color: Colors.red,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),

          Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                if (!_tracking)
                  SizedBox(
                    width: double.infinity,
                    height: 55,
                    child: ElevatedButton.icon(
                      onPressed: _saving ? null : _startTracking,
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('Start GPS Tracking'),
                    ),
                  ),

                if (_tracking) ...[
                  SizedBox(
                    width: double.infinity,
                    height: 55,
                    child: ElevatedButton.icon(
                      onPressed: _simulating || _saving
                          ? null
                          : _simulateMovement,
                      icon: _simulating
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.directions_walk),
                      label: Text(
                        _simulating ? 'Simulating...' : 'Simulate Movement',
                      ),
                    ),
                  ),

                  const SizedBox(height: 10),

                  SizedBox(
                    width: double.infinity,
                    height: 55,
                    child: OutlinedButton.icon(
                      onPressed: _saving ? null : _stopTracking,
                      icon: _saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.stop),
                      label: Text(
                        _saving ? 'Saving Route...' : 'Stop & Save Route',
                      ),
                    ),
                  ),
                ],

                if (!_tracking && _routePoints.isNotEmpty) ...[
                  const SizedBox(height: 10),

                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _clearTestRoute,
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Clear Test Route'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
