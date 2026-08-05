import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

class JobTrackingScreen extends StatefulWidget {
  final DocumentSnapshot campaign;

  const JobTrackingScreen({
    super.key,
    required this.campaign,
  });

  @override
  State<JobTrackingScreen> createState() =>
      _JobTrackingScreenState();
}

class _JobTrackingScreenState
    extends State<JobTrackingScreen> {
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

  late final DocumentReference<Map<String, dynamic>>
      _routeReference;

  @override
  void initState() {
    super.initState();

    _routeReference = FirebaseFirestore.instance
        .collection('campaignRoutes')
        .doc(widget.campaign.id);

    _initialize();
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    super.dispose();
  }

  Future<void> _initialize() async {
    try {
      final campaignSnapshot =
          await widget.campaign.reference.get();

      if (!campaignSnapshot.exists) {
        throw Exception(
          "This campaign no longer exists.",
        );
      }

      final campaignData =
          campaignSnapshot.data() as Map<String, dynamic>;

      final serviceArea = _parsePoints(
        campaignData['serviceArea'],
      );

      final routeSnapshot =
          await _routeReference.get();

      final existingRoute = routeSnapshot.exists
          ? _parsePoints(
              routeSnapshot.data()?['points'],
            )
          : <LatLng>[];

      final routeIsSimulated =
          routeSnapshot.data()?['simulated'] == true;

      if (!mounted) return;

      setState(() {
        _serviceArea = serviceArea;

        _routePoints
          ..clear()
          ..addAll(existingRoute);

        _routeIsSimulated =
            routeIsSimulated;

        if (_routeIsSimulated &&
            _routePoints.isNotEmpty) {
          _simulatedPosition =
              _routePoints.last;
        }

        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _errorMessage =
            "Unable to load tracking data: $e";

        _loading = false;
      });
    }
  }

  List<LatLng> _parsePoints(
    dynamic rawPoints,
  ) {
    if (rawPoints is! List) {
      return [];
    }

    final points = <LatLng>[];

    for (final item in rawPoints) {
      if (item is! Map) {
        continue;
      }

      final latitude =
          item['latitude'];

      final longitude =
          item['longitude'];

      if (latitude is num &&
          longitude is num) {
        points.add(
          LatLng(
            latitude.toDouble(),
            longitude.toDouble(),
          ),
        );
      }
    }

    return points;
  }

  LatLng _calculateCenter(
    List<LatLng> points,
  ) {
    if (points.isEmpty) {
      return const LatLng(
        39.2904,
        -76.6122,
      );
    }

    double totalLatitude = 0;
    double totalLongitude = 0;

    for (final point in points) {
      totalLatitude +=
          point.latitude;

      totalLongitude +=
          point.longitude;
    }

    return LatLng(
      totalLatitude / points.length,
      totalLongitude / points.length,
    );
  }

  Future<bool> _checkLocationPermission() async {
    final serviceEnabled =
        await Geolocator.isLocationServiceEnabled();

    if (!serviceEnabled) {
      if (!mounted) return false;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Location services are disabled. Turn on location services and try again.",
          ),
        ),
      );

      return false;
    }

    var permission =
        await Geolocator.checkPermission();

    if (permission ==
        LocationPermission.denied) {
      permission =
          await Geolocator.requestPermission();
    }

    if (permission ==
        LocationPermission.denied) {
      if (!mounted) return false;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Location permission was denied.",
          ),
        ),
      );

      return false;
    }

    if (permission ==
        LocationPermission.deniedForever) {
      if (!mounted) return false;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Location permission is permanently denied. Enable it in your device settings.",
          ),
        ),
      );

      return false;
    }

    return true;
  }

  Future<void> _startTracking() async {
    if (_tracking) return;

    final allowed =
        await _checkLocationPermission();

    if (!allowed) return;

    try {
      final user =
          FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception(
          "You must be logged in to track a job.",
        );
      }

      final currentPosition =
          await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      if (!mounted) return;

      final currentPoint =
          LatLng(
        currentPosition.latitude,
        currentPosition.longitude,
      );

      setState(() {
        _currentPosition =
            currentPosition;

        _simulatedPosition =
            null;

        _tracking = true;
        _routeIsSimulated = false;
        _errorMessage = null;
      });

      _addRoutePoint(
        currentPoint,
      );

      try {
        _mapController.move(
          currentPoint,
          17,
        );
      } catch (_) {
        // Map may not yet be attached.
      }

      await _routeReference.set(
        {
          'campaignId':
              widget.campaign.id,
          'scalerId':
              user.uid,
          'scalerEmail':
              user.email,
          'tracking':
              true,
          'simulated':
              false,
          'startedAt':
              FieldValue.serverTimestamp(),
          'updatedAt':
              FieldValue.serverTimestamp(),
          'points':
              _serializePoints(),
          'pointCount':
              _routePoints.length,
        },
        SetOptions(
          merge: true,
        ),
      );

      const settings =
          LocationSettings(
        accuracy:
            LocationAccuracy.high,
        distanceFilter: 5,
      );

      _positionSubscription =
          Geolocator.getPositionStream(
        locationSettings: settings,
      ).listen(
        (position) {
          if (!mounted) return;

          final point =
              LatLng(
            position.latitude,
            position.longitude,
          );

          setState(() {
            _currentPosition =
                position;
          });

          _addRoutePoint(
            point,
          );
        },
        onError: (error) {
          if (!mounted) return;

          setState(() {
            _errorMessage =
                "GPS error: $error";
          });
        },
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _tracking = false;

        _errorMessage =
            "Unable to start GPS tracking: $e";
      });
    }
  }

  void _addRoutePoint(
    LatLng point,
  ) {
    if (_routePoints.isNotEmpty) {
      final lastPoint =
          _routePoints.last;

      final distance =
          Geolocator.distanceBetween(
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
      _routePoints.add(
        point,
      );
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
          content: Text(
            "Start GPS tracking before simulating movement.",
          ),
        ),
      );

      return;
    }

    if (_simulating) return;

    setState(() {
      _simulating = true;
    });

    try {
      await _positionSubscription?.cancel();

      _positionSubscription = null;

      final user =
          FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception(
          "You must be logged in.",
        );
      }

      final simulatedRoute =
          _buildSimulatedRoute();

      if (simulatedRoute.length < 2) {
        throw Exception(
          "Unable to create a simulated route.",
        );
      }

      setState(() {
        _routePoints
          ..clear()
          ..addAll(
            simulatedRoute,
          );

        _simulatedPosition =
            simulatedRoute.last;

        _routeIsSimulated =
            true;

        _currentPosition =
            null;

        _pointsSinceLastSave =
            0;
      });

      await _routeReference.set(
        {
          'campaignId':
              widget.campaign.id,
          'scalerId':
              user.uid,
          'scalerEmail':
              user.email,
          'tracking':
              true,
          'simulated':
              true,
          'points':
              _serializePoints(),
          'pointCount':
              _routePoints.length,
          'updatedAt':
              FieldValue.serverTimestamp(),
        },
        SetOptions(
          merge: true,
        ),
      );

      try {
        _mapController.move(
          _calculateCenter(
            simulatedRoute,
          ),
          16,
        );
      } catch (_) {
        // Ignore if map is not ready.
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Simulated ${_routePoints.length} GPS route points.",
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to simulate movement: $e",
          ),
        ),
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
      final center =
          _calculateCenter(
        _serviceArea,
      );

      final innerPoints =
          _serviceArea.map(
        (boundaryPoint) {
          return LatLng(
            center.latitude +
                (
                  boundaryPoint.latitude -
                      center.latitude
                ) *
                    0.65,
            center.longitude +
                (
                  boundaryPoint.longitude -
                      center.longitude
                ) *
                    0.65,
          );
        },
      ).toList();

      final route =
          <LatLng>[];

      for (int i = 0;
          i < innerPoints.length;
          i++) {
        final start =
            innerPoints[i];

        final end =
            innerPoints[
              (i + 1) %
                  innerPoints.length
            ];

        const steps = 4;

        for (int step = 0;
            step < steps;
            step++) {
          final fraction =
              step / steps;

          route.add(
            LatLng(
              start.latitude +
                  (
                    end.latitude -
                        start.latitude
                  ) *
                      fraction,
              start.longitude +
                  (
                    end.longitude -
                        start.longitude
                  ) *
                      fraction,
            ),
          );
        }
      }

      route.add(
        innerPoints.first,
      );

      return route;
    }

    LatLng center;

    if (_currentPosition != null) {
      center =
          LatLng(
        _currentPosition!.latitude,
        _currentPosition!.longitude,
      );
    } else {
      center =
          const LatLng(
        39.2904,
        -76.6122,
      );
    }

    return [
      LatLng(
        center.latitude,
        center.longitude,
      ),
      LatLng(
        center.latitude + 0.00010,
        center.longitude,
      ),
      LatLng(
        center.latitude + 0.00015,
        center.longitude + 0.00010,
      ),
      LatLng(
        center.latitude + 0.00010,
        center.longitude + 0.00020,
      ),
      LatLng(
        center.latitude,
        center.longitude + 0.00020,
      ),
      LatLng(
        center.latitude - 0.00005,
        center.longitude + 0.00010,
      ),
      LatLng(
        center.latitude,
        center.longitude,
      ),
    ];
  }

  Future<void> _saveRouteProgress() async {
    try {
      await _routeReference.set(
        {
          'campaignId':
              widget.campaign.id,
          'tracking':
              true,
          'simulated':
              _routeIsSimulated,
          'points':
              _serializePoints(),
          'pointCount':
              _routePoints.length,
          'updatedAt':
              FieldValue.serverTimestamp(),
        },
        SetOptions(
          merge: true,
        ),
      );
    } catch (e) {
      debugPrint(
        "Unable to save route progress: $e",
      );
    }
  }

  List<Map<String, dynamic>>
      _serializePoints() {
    return _routePoints
        .map(
          (point) => {
            'latitude':
                point.latitude,
            'longitude':
                point.longitude,
          },
        )
        .toList();
  }

  Future<void> _stopTracking() async {
    if (!_tracking) return;

    setState(() {
      _saving = true;
    });

    try {
      await _positionSubscription?.cancel();

      _positionSubscription = null;

      await _routeReference.set(
        {
          'campaignId':
              widget.campaign.id,
          'tracking':
              false,
          'simulated':
              _routeIsSimulated,
          'points':
              _serializePoints(),
          'pointCount':
              _routePoints.length,
          'endedAt':
              FieldValue.serverTimestamp(),
          'updatedAt':
              FieldValue.serverTimestamp(),
        },
        SetOptions(
          merge: true,
        ),
      );

      if (!mounted) return;

      setState(() {
        _tracking = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Route saved with ${_routePoints.length} GPS points.",
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to save route: $e",
          ),
        ),
      );
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
          content: Text(
            "Stop tracking before clearing the route.",
          ),
        ),
      );

      return;
    }

    final confirmed =
        await showDialog<bool>(
      context: context,
      builder: (
        dialogContext,
      ) {
        return AlertDialog(
          title: const Text(
            "Clear Test Route",
          ),
          content: const Text(
            "Delete the currently recorded GPS route for this campaign?",
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  false,
                );
              },
              child:
                  const Text(
                "Cancel",
              ),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  true,
                );
              },
              child:
                  const Text(
                "Clear",
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      await _routeReference.delete();

      if (!mounted) return;

      setState(() {
        _routePoints.clear();

        _currentPosition =
            null;

        _simulatedPosition =
            null;

        _routeIsSimulated =
            false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Test route cleared.",
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to clear route: $e",
          ),
        ),
      );
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    if (_loading) {
      return const Scaffold(
        body: Center(
          child:
              CircularProgressIndicator(),
        ),
      );
    }

    if (_errorMessage != null &&
        _serviceArea.isEmpty) {
      return Scaffold(
        appBar: AppBar(
          title: const Text(
            "GPS Tracking",
          ),
        ),
        body: Center(
          child: Padding(
            padding:
                const EdgeInsets.all(
              20,
            ),
            child: Text(
              _errorMessage!,
              textAlign:
                  TextAlign.center,
            ),
          ),
        ),
      );
    }

    final mapPoints =
        _serviceArea.isNotEmpty
            ? _serviceArea
            : _routePoints;

    LatLng center;

    if (_simulatedPosition != null) {
      center =
          _simulatedPosition!;
    } else if (_currentPosition != null) {
      center =
          LatLng(
        _currentPosition!.latitude,
        _currentPosition!.longitude,
      );
    } else {
      center =
          _calculateCenter(
        mapPoints,
      );
    }

    final currentMapPoint =
        _simulatedPosition ??
            (
              _currentPosition != null
                  ? LatLng(
                      _currentPosition!.latitude,
                      _currentPosition!.longitude,
                    )
                  : null
            );

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Campaign GPS Tracking",
        ),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Container(
            width:
                double.infinity,
            padding:
                const EdgeInsets.all(
              14,
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment:
                      MainAxisAlignment.center,
                  children: [
                    Icon(
                      _tracking
                          ? Icons.gps_fixed
                          : Icons.gps_not_fixed,
                    ),

                    const SizedBox(
                      width: 8,
                    ),

                    Text(
                      _tracking
                          ? "GPS Tracking Active"
                          : "GPS Tracking Stopped",
                      style:
                          const TextStyle(
                        fontWeight:
                            FontWeight.bold,
                        fontSize: 17,
                      ),
                    ),
                  ],
                ),

                const SizedBox(
                  height: 6,
                ),

                Text(
                  "${_routePoints.length} route point${_routePoints.length == 1 ? '' : 's'} recorded",
                ),

                if (_routeIsSimulated) ...[
                  const SizedBox(
                    height: 6,
                  ),

                  const Text(
                    "Development simulation route",
                    style: TextStyle(
                      fontWeight:
                          FontWeight.w600,
                    ),
                  ),
                ],

                if (_errorMessage != null) ...[
                  const SizedBox(
                    height: 6,
                  ),

                  Text(
                    _errorMessage!,
                    textAlign:
                        TextAlign.center,
                  ),
                ],
              ],
            ),
          ),

          Expanded(
            child: FlutterMap(
              mapController:
                  _mapController,
              options:
                  MapOptions(
                initialCenter:
                    center,
                initialZoom: 16,
              ),
              children: [
                TileLayer(
                  urlTemplate:
                      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  userAgentPackageName:
                      "com.scaledcircle.app",
                ),

                if (_serviceArea.length >= 3)
                  PolygonLayer(
                    polygons: [
                      Polygon(
                        points:
                            _serviceArea,
                        borderStrokeWidth:
                            3,
                        color: Colors.blue.withValues(
                          alpha: 0.15,
                        ),
                        borderColor:
                            Colors.blue,
                      ),
                    ],
                  ),

                if (_routePoints.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points:
                            _routePoints,
                        strokeWidth:
                            5,
                        color:
                            Colors.green,
                      ),
                    ],
                  ),

                MarkerLayer(
                  markers: [
                    if (currentMapPoint != null)
                      Marker(
                        point:
                            currentMapPoint,
                        width: 48,
                        height: 48,
                        child:
                            Icon(
                          _routeIsSimulated
                              ? Icons.location_on
                              : Icons.my_location,
                          size: 38,
                          color:
                              Colors.red,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),

          Container(
            padding:
                const EdgeInsets.all(
              16,
            ),
            child: Column(
              children: [
                if (!_tracking)
                  SizedBox(
                    width:
                        double.infinity,
                    height: 55,
                    child:
                        ElevatedButton.icon(
                      onPressed:
                          _saving
                              ? null
                              : _startTracking,
                      icon: const Icon(
                        Icons.play_arrow,
                      ),
                      label:
                          const Text(
                        "Start GPS Tracking",
                      ),
                    ),
                  ),

                if (_tracking) ...[
                  SizedBox(
                    width:
                        double.infinity,
                    height: 55,
                    child:
                        ElevatedButton.icon(
                      onPressed:
                          _simulating ||
                                  _saving
                              ? null
                              : _simulateMovement,
                      icon: _simulating
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child:
                                  CircularProgressIndicator(
                                strokeWidth:
                                    2,
                              ),
                            )
                          : const Icon(
                              Icons
                                  .directions_walk,
                            ),
                      label: Text(
                        _simulating
                            ? "Simulating..."
                            : "Simulate Movement",
                      ),
                    ),
                  ),

                  const SizedBox(
                    height: 10,
                  ),

                  SizedBox(
                    width:
                        double.infinity,
                    height: 55,
                    child:
                        OutlinedButton.icon(
                      onPressed:
                          _saving
                              ? null
                              : _stopTracking,
                      icon: _saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child:
                                  CircularProgressIndicator(
                                strokeWidth:
                                    2,
                              ),
                            )
                          : const Icon(
                              Icons.stop,
                            ),
                      label: Text(
                        _saving
                            ? "Saving Route..."
                            : "Stop & Save Route",
                      ),
                    ),
                  ),
                ],

                if (!_tracking &&
                    _routePoints.isNotEmpty) ...[
                  const SizedBox(
                    height: 10,
                  ),

                  SizedBox(
                    width:
                        double.infinity,
                    child:
                        OutlinedButton.icon(
                      onPressed:
                          _clearTestRoute,
                      icon: const Icon(
                        Icons.delete_outline,
                      ),
                      label:
                          const Text(
                        "Clear Test Route",
                      ),
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