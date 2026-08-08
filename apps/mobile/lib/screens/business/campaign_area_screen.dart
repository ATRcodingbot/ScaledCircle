import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

enum CampaignAreaShape { polygon, rectangle, circle, triangle }

class CampaignAreaScreen extends StatefulWidget {
  final DocumentReference campaignReference;

  const CampaignAreaScreen({super.key, required this.campaignReference});

  @override
  State<CampaignAreaScreen> createState() => _CampaignAreaScreenState();
}

class _CampaignAreaScreenState extends State<CampaignAreaScreen> {
  final MapController _mapController = MapController();

  final List<LatLng> _inputPoints = [];

  List<LatLng> _generatedArea = [];

  CampaignAreaShape _selectedShape = CampaignAreaShape.polygon;

  bool _saving = false;
  bool _loadingExistingArea = true;
  bool _hasLoadedExistingArea = false;

  static const LatLng _defaultCenter = LatLng(39.2904, -76.6122);

  static const double _metersPerMile = 1609.344;

  static const double _squareMetersPerAcre = 4046.8564224;

  static const double _squareMetersPerSquareMile = 2589988.110336;

  static const double _estimatedSweepSpacingMeters = 30;

  static const double _walkingMetersPerMinute = 75;

  static const int _productiveMinutesPerScaler = 240;

  static const double _preliminaryHourlyRate = 18;

  @override
  void initState() {
    super.initState();

    _loadExistingArea();
  }

  Future<void> _loadExistingArea() async {
    try {
      final snapshot = await widget.campaignReference.get();

      if (!snapshot.exists) {
        if (!mounted) {
          return;
        }

        setState(() {
          _loadingExistingArea = false;
        });

        return;
      }

      final rawData = snapshot.data();

      if (rawData is! Map<String, dynamic>) {
        if (!mounted) {
          return;
        }

        setState(() {
          _loadingExistingArea = false;
        });

        return;
      }

      final existingPoints = _parsePoints(rawData['serviceArea']);

      final existingShape = _shapeFromValue(
        rawData['serviceAreaType']?.toString() ??
            rawData['shapeType']?.toString(),
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _selectedShape = existingShape;

        if (existingPoints.isNotEmpty) {
          _generatedArea = List<LatLng>.from(existingPoints);

          _inputPoints
            ..clear()
            ..addAll(
              _inputPointsForExistingShape(
                existingShape,
                existingPoints,
                rawData,
              ),
            );

          _hasLoadedExistingArea = true;
        }

        _loadingExistingArea = false;
      });

      if (existingPoints.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) {
            return;
          }

          try {
            _mapController.move(_calculateCenter(existingPoints), 15);
          } catch (_) {
            // Map may not yet be fully attached.
          }
        });
      }
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadingExistingArea = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to load the existing zone area: $e')),
      );
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

  List<LatLng> _inputPointsForExistingShape(
    CampaignAreaShape shape,
    List<LatLng> existingPoints,
    Map<String, dynamic> data,
  ) {
    switch (shape) {
      case CampaignAreaShape.circle:
        final rawCenter = data['serviceAreaCenter'];

        final radius = data['serviceAreaRadiusMeters'];

        if (rawCenter is Map &&
            rawCenter['latitude'] is num &&
            rawCenter['longitude'] is num &&
            radius is num &&
            radius > 0) {
          final center = LatLng(
            (rawCenter['latitude'] as num).toDouble(),
            (rawCenter['longitude'] as num).toDouble(),
          );

          final edge = const Distance().offset(center, radius.toDouble(), 90);

          return [center, edge];
        }

        return [];

      case CampaignAreaShape.rectangle:
        if (existingPoints.length >= 3) {
          return [existingPoints.first, existingPoints[2]];
        }

        return [];

      case CampaignAreaShape.triangle:
        return existingPoints.take(3).toList();

      case CampaignAreaShape.polygon:
        return List<LatLng>.from(existingPoints);
    }
  }

  void _selectShape(CampaignAreaShape shape) {
    setState(() {
      _selectedShape = shape;

      _inputPoints.clear();
      _generatedArea.clear();

      _hasLoadedExistingArea = false;
    });
  }

  void _prepareForNewDrawing() {
    if (!_hasLoadedExistingArea) {
      return;
    }

    _inputPoints.clear();
    _generatedArea.clear();

    _hasLoadedExistingArea = false;
  }

  void _handleMapTap(TapPosition tapPosition, LatLng point) {
    debugPrint('CAMPAIGN AREA TAP: ${point.latitude}, ${point.longitude}');

    setState(() {
      _prepareForNewDrawing();

      switch (_selectedShape) {
        case CampaignAreaShape.polygon:
          _inputPoints.add(point);

          _generatedArea = _autoOrderPolygon(_inputPoints);
          break;

        case CampaignAreaShape.triangle:
          if (_inputPoints.length >= 3) {
            return;
          }

          _inputPoints.add(point);

          if (_inputPoints.length == 3) {
            _generatedArea = _autoOrderPolygon(_inputPoints);
          }
          break;

        case CampaignAreaShape.rectangle:
          if (_inputPoints.length >= 2) {
            return;
          }

          _inputPoints.add(point);

          if (_inputPoints.length == 2) {
            _generatedArea = _buildRectangle(_inputPoints[0], _inputPoints[1]);
          }
          break;

        case CampaignAreaShape.circle:
          if (_inputPoints.length >= 2) {
            return;
          }

          _inputPoints.add(point);

          if (_inputPoints.length == 2) {
            _generatedArea = _buildCirclePolygon(
              _inputPoints[0],
              _inputPoints[1],
            );
          }
          break;
      }
    });
  }

  List<LatLng> _autoOrderPolygon(List<LatLng> points) {
    if (points.length < 3) {
      return List<LatLng>.from(points);
    }

    double centerLatitude = 0;
    double centerLongitude = 0;

    for (final point in points) {
      centerLatitude += point.latitude;

      centerLongitude += point.longitude;
    }

    centerLatitude /= points.length;

    centerLongitude /= points.length;

    final ordered = List<LatLng>.from(points);

    ordered.sort((a, b) {
      final angleA = math.atan2(
        a.latitude - centerLatitude,
        a.longitude - centerLongitude,
      );

      final angleB = math.atan2(
        b.latitude - centerLatitude,
        b.longitude - centerLongitude,
      );

      return angleA.compareTo(angleB);
    });

    return ordered;
  }

  List<LatLng> _buildRectangle(LatLng first, LatLng second) {
    return [
      LatLng(first.latitude, first.longitude),
      LatLng(first.latitude, second.longitude),
      LatLng(second.latitude, second.longitude),
      LatLng(second.latitude, first.longitude),
    ];
  }

  List<LatLng> _buildCirclePolygon(LatLng center, LatLng edge) {
    final distance = const Distance();

    final radiusMeters = distance.as(LengthUnit.Meter, center, edge);

    const pointCount = 48;

    final points = <LatLng>[];

    for (int index = 0; index < pointCount; index++) {
      final bearing = (360 / pointCount) * index;

      points.add(distance.offset(center, radiusMeters, bearing));
    }

    return points;
  }

  double? _circleRadiusMeters() {
    if (_selectedShape != CampaignAreaShape.circle || _inputPoints.length < 2) {
      return null;
    }

    return const Distance().as(
      LengthUnit.Meter,
      _inputPoints[0],
      _inputPoints[1],
    );
  }

  void _undoLastPoint() {
    if (_inputPoints.isEmpty) {
      return;
    }

    setState(() {
      _hasLoadedExistingArea = false;

      _inputPoints.removeLast();

      switch (_selectedShape) {
        case CampaignAreaShape.polygon:
          _generatedArea = _autoOrderPolygon(_inputPoints);
          break;

        case CampaignAreaShape.triangle:
          _generatedArea = _inputPoints.length == 3
              ? _autoOrderPolygon(_inputPoints)
              : [];
          break;

        case CampaignAreaShape.rectangle:
          _generatedArea = _inputPoints.length == 2
              ? _buildRectangle(_inputPoints[0], _inputPoints[1])
              : [];
          break;

        case CampaignAreaShape.circle:
          _generatedArea = _inputPoints.length == 2
              ? _buildCirclePolygon(_inputPoints[0], _inputPoints[1])
              : [];
          break;
      }
    });
  }

  void _clearArea() {
    setState(() {
      _inputPoints.clear();
      _generatedArea.clear();

      _hasLoadedExistingArea = false;
    });
  }

  bool _isAreaValid() {
    switch (_selectedShape) {
      case CampaignAreaShape.polygon:
        return _generatedArea.length >= 3;

      case CampaignAreaShape.triangle:
        return _generatedArea.length == 3;

      case CampaignAreaShape.rectangle:
        return _generatedArea.length == 4;

      case CampaignAreaShape.circle:
        final radius = _circleRadiusMeters();

        if (_hasLoadedExistingArea && _generatedArea.length >= 12) {
          return true;
        }

        return _generatedArea.length >= 12 && radius != null && radius > 0;
    }
  }

  ZoneMetrics? _calculateZoneMetrics() {
    if (_generatedArea.length < 3) {
      return null;
    }

    final areaSquareMeters = _calculatePolygonAreaSquareMeters(_generatedArea);

    final perimeterMeters = _calculatePerimeterMeters(_generatedArea);

    final interiorTraversalMeters =
        areaSquareMeters / _estimatedSweepSpacingMeters;

    final estimatedWalkingMeters = perimeterMeters + interiorTraversalMeters;

    final estimatedMinutes = math.max(
      1,
      (estimatedWalkingMeters / _walkingMetersPerMinute).ceil(),
    );

    final recommendedScalerCount = math.max(
      1,
      (estimatedMinutes / _productiveMinutesPerScaler).ceil(),
    );

    final totalHours = estimatedMinutes / 60;

    final rawSuggestedPay = totalHours * _preliminaryHourlyRate;

    final suggestedBasePay = math
        .max(25, _roundToNearestFive(rawSuggestedPay))
        .toDouble();

    return ZoneMetrics(
      areaSquareMeters: areaSquareMeters,
      areaAcres: areaSquareMeters / _squareMetersPerAcre,
      areaSquareMiles: areaSquareMeters / _squareMetersPerSquareMile,
      perimeterMeters: perimeterMeters,
      perimeterMiles: perimeterMeters / _metersPerMile,
      estimatedWalkingMeters: estimatedWalkingMeters,
      estimatedWalkingMiles: estimatedWalkingMeters / _metersPerMile,
      estimatedMinutes: estimatedMinutes,
      recommendedScalerCount: recommendedScalerCount,
      suggestedBasePay: suggestedBasePay,
    );
  }

  double _calculatePolygonAreaSquareMeters(List<LatLng> points) {
    if (points.length < 3) {
      return 0;
    }

    final center = _calculateCenter(points);

    final centerLatitudeRadians = _degreesToRadians(center.latitude);

    final centerLongitudeRadians = _degreesToRadians(center.longitude);

    const earthRadiusMeters = 6371008.8;

    final projectedPoints = points.map((point) {
      final pointLatitudeRadians = _degreesToRadians(point.latitude);

      final pointLongitudeRadians = _degreesToRadians(point.longitude);

      final x =
          earthRadiusMeters *
          (pointLongitudeRadians - centerLongitudeRadians) *
          math.cos(centerLatitudeRadians);

      final y =
          earthRadiusMeters * (pointLatitudeRadians - centerLatitudeRadians);

      return _ProjectedPoint(x, y);
    }).toList();

    double signedArea = 0;

    for (int index = 0; index < projectedPoints.length; index++) {
      final current = projectedPoints[index];

      final next = projectedPoints[(index + 1) % projectedPoints.length];

      signedArea += current.x * next.y - next.x * current.y;
    }

    return signedArea.abs() / 2;
  }

  double _calculatePerimeterMeters(List<LatLng> points) {
    if (points.length < 2) {
      return 0;
    }

    const distance = Distance();

    double perimeter = 0;

    for (int index = 0; index < points.length; index++) {
      perimeter += distance.as(
        LengthUnit.Meter,
        points[index],
        points[(index + 1) % points.length],
      );
    }

    return perimeter;
  }

  LatLng _calculateCenter(List<LatLng> points) {
    if (points.isEmpty) {
      return _defaultCenter;
    }

    double latitude = 0;

    double longitude = 0;

    for (final point in points) {
      latitude += point.latitude;

      longitude += point.longitude;
    }

    return LatLng(latitude / points.length, longitude / points.length);
  }

  double _degreesToRadians(double degrees) {
    return degrees * math.pi / 180;
  }

  int _roundToNearestFive(double value) {
    return (value / 5).round() * 5;
  }

  Future<bool> _analyzeSavedZone() async {
    try {
      final callable = FirebaseFunctions.instanceFor(
        region: 'us-east1',
      ).httpsCallable('analyzeCampaignZone');

      await callable.call({'zoneId': widget.campaignReference.id});

      return true;
    } on FirebaseFunctionsException catch (e) {
      debugPrint(
        'Zone analysis failed: '
        '${e.code} ${e.message}',
      );

      return _runDevelopmentHomeEstimateFallback();
    } catch (e) {
      debugPrint('Zone analysis failed: $e');

      return _runDevelopmentHomeEstimateFallback();
    }
  }

  Future<bool> _runDevelopmentHomeEstimateFallback() async {
    try {
      final snapshot = await widget.campaignReference.get();

      if (!snapshot.exists) {
        return false;
      }

      final data = snapshot.data();

      if (data is! Map<String, dynamic>) {
        return false;
      }

      final areaAcres = (data['zoneAreaAcres'] as num?)?.toDouble() ?? 0.0;

      if (areaAcres <= 0.0) {
        await widget.campaignReference.update({
          'analysisStatus': 'geometry_complete',
          'homeCountStatus': 'unavailable',
          'homeCountMethod': 'development_area_density_fallback_v1',
          'homeCountConfidence': 'low',
          'homeCountConfidenceScore': 0.0,
          'estimatedHomes': 0,
          'updatedAt': FieldValue.serverTimestamp(),
        });

        return true;
      }

      const homesPerAcre = 2.5;

      final estimatedHomes = math.max(1, (areaAcres * homesPerAcre).round());

      await widget.campaignReference.update({
        'estimatedHomes': estimatedHomes,
        'homeCountStatus': 'estimated',
        'homeCountMethod': 'development_area_density_fallback_v1',
        'homeCountConfidence': 'low',
        'homeCountConfidenceScore': 0.35,
        'analysisStatus': 'complete',
        'analysisUpdatedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      debugPrint(
        'Development fallback estimated '
        '$estimatedHomes homes from '
        '${areaAcres.toStringAsFixed(2)} acres.',
      );

      return true;
    } catch (e) {
      debugPrint('Development home estimate fallback failed: $e');

      return false;
    }
  }

  Future<void> _saveArea() async {
    if (!_isAreaValid()) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_instructionText())));

      return;
    }

    final metrics = _calculateZoneMetrics();

    if (metrics == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to calculate zone metrics.')),
      );

      return;
    }

    setState(() {
      _saving = true;
    });

    try {
      final polygonPoints = _generatedArea
          .map(
            (point) => {
              'latitude': point.latitude,
              'longitude': point.longitude,
            },
          )
          .toList();

      final updateData = <String, dynamic>{
        'serviceArea': polygonPoints,

        'serviceAreaType': _shapeValue(_selectedShape),

        'shapeType': _shapeValue(_selectedShape),

        'serviceAreaPointCount': polygonPoints.length,

        'zoneAreaSquareMeters': metrics.areaSquareMeters,

        'zoneAreaAcres': metrics.areaAcres,

        'zoneAreaSquareMiles': metrics.areaSquareMiles,

        'zonePerimeterMeters': metrics.perimeterMeters,

        'zonePerimeterMiles': metrics.perimeterMiles,

        'estimatedWalkingMeters': metrics.estimatedWalkingMeters,

        'estimatedWalkingMiles': metrics.estimatedWalkingMiles,

        'estimatedMinutes': metrics.estimatedMinutes,

        'recommendedScalerCount': metrics.recommendedScalerCount,

        'suggestedBasePay': metrics.suggestedBasePay,

        'zoneMetricsMethod': 'geometry_v1',

        'zoneMetricsDescription':
            'Preliminary estimate based on zone area, perimeter, '
            '30-meter sweep spacing, 75 walking meters per minute, '
            'and 240 productive minutes per Scaler.',

        'analysisStatus': 'waiting',

        'homeCountStatus': 'pending',

        'estimatedHomes': 0,

        'updatedAt': FieldValue.serverTimestamp(),

        'serviceAreaUpdatedAt': FieldValue.serverTimestamp(),
      };

      if (_selectedShape == CampaignAreaShape.circle &&
          _inputPoints.length >= 2) {
        final center = _inputPoints[0];

        updateData['serviceAreaCenter'] = {
          'latitude': center.latitude,
          'longitude': center.longitude,
        };

        updateData['serviceAreaRadiusMeters'] = _circleRadiusMeters();
      } else {
        updateData['serviceAreaCenter'] = FieldValue.delete();

        updateData['serviceAreaRadiusMeters'] = FieldValue.delete();
      }

      await widget.campaignReference.update(updateData);

      final analysisCompleted = await _analyzeSavedZone();

      if (!mounted) {
        return;
      }

      if (analysisCompleted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${_shapeLabel(_selectedShape)} zone saved and analyzed. '
              '${metrics.areaAcres.toStringAsFixed(1)} acres and '
              '${metrics.estimatedWalkingMiles.toStringAsFixed(1)} estimated walking miles.',
            ),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Zone saved, but backend analysis could not be completed.',
            ),
          ),
        );
      }

      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to save campaign zone: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  String _instructionText() {
    switch (_selectedShape) {
      case CampaignAreaShape.polygon:
        return 'Tap at least 3 points around the zone. '
            'Scaled Circle will automatically organize them into a clean boundary.';

      case CampaignAreaShape.rectangle:
        return 'Tap two opposite corners of the rectangle.';

      case CampaignAreaShape.circle:
        return 'Tap once for the center, then tap again to set the radius.';

      case CampaignAreaShape.triangle:
        return 'Tap the 3 corners of the triangle.';
    }
  }

  String _shapeLabel(CampaignAreaShape shape) {
    switch (shape) {
      case CampaignAreaShape.polygon:
        return 'Polygon';

      case CampaignAreaShape.rectangle:
        return 'Rectangle';

      case CampaignAreaShape.circle:
        return 'Circle';

      case CampaignAreaShape.triangle:
        return 'Triangle';
    }
  }

  String _shapeValue(CampaignAreaShape shape) {
    switch (shape) {
      case CampaignAreaShape.polygon:
        return 'polygon';

      case CampaignAreaShape.rectangle:
        return 'rectangle';

      case CampaignAreaShape.circle:
        return 'circle';

      case CampaignAreaShape.triangle:
        return 'triangle';
    }
  }

  CampaignAreaShape _shapeFromValue(String? value) {
    switch (value) {
      case 'rectangle':
        return CampaignAreaShape.rectangle;

      case 'circle':
        return CampaignAreaShape.circle;

      case 'triangle':
        return CampaignAreaShape.triangle;

      case 'polygon':
      default:
        return CampaignAreaShape.polygon;
    }
  }

  IconData _shapeIcon(CampaignAreaShape shape) {
    switch (shape) {
      case CampaignAreaShape.polygon:
        return Icons.polyline;

      case CampaignAreaShape.rectangle:
        return Icons.crop_square;

      case CampaignAreaShape.circle:
        return Icons.circle_outlined;

      case CampaignAreaShape.triangle:
        return Icons.change_history;
    }
  }

  String _formatDuration(int minutes) {
    if (minutes < 60) {
      return '$minutes min';
    }

    final hours = minutes ~/ 60;

    final remainingMinutes = minutes % 60;

    if (remainingMinutes == 0) {
      return '$hours hr';
    }

    return '$hours hr $remainingMinutes min';
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingExistingArea) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final polygons = _generatedArea.length >= 3
        ? [
            Polygon(
              points: _generatedArea,
              borderStrokeWidth: 3,
              color: Colors.blue.withValues(alpha: 0.18),
              borderColor: Colors.blue,
            ),
          ]
        : <Polygon>[];

    final markers = _inputPoints
        .asMap()
        .entries
        .map(
          (entry) => Marker(
            point: entry.value,
            width: 42,
            height: 42,
            child: Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.blue,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
              ),
              child: Text(
                '${entry.key + 1}',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        )
        .toList();

    final radius = _circleRadiusMeters();

    final metrics = _calculateZoneMetrics();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Define Campaign Zone'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
            child: SegmentedButton<CampaignAreaShape>(
              segments: CampaignAreaShape.values
                  .map(
                    (shape) => ButtonSegment<CampaignAreaShape>(
                      value: shape,
                      icon: Icon(_shapeIcon(shape)),
                      label: Text(_shapeLabel(shape)),
                    ),
                  )
                  .toList(),
              selected: {_selectedShape},
              onSelectionChanged: (selection) {
                _selectShape(selection.first);
              },
              showSelectedIcon: false,
            ),
          ),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              children: [
                Text(_instructionText(), textAlign: TextAlign.center),

                if (radius != null) ...[
                  const SizedBox(height: 6),

                  Text(
                    'Radius: ${radius.toStringAsFixed(0)} meters',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),

          Expanded(
            child: FlutterMap(
              mapController: _mapController,

              options: MapOptions(
                initialCenter: _generatedArea.isEmpty
                    ? _defaultCenter
                    : _calculateCenter(_generatedArea),
                initialZoom: _generatedArea.isEmpty ? 13 : 15,

                onTap: _handleMapTap,
              ),

              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.scaledcircle.app',
                ),

                PolygonLayer(polygons: polygons),

                MarkerLayer(markers: markers),
              ],
            ),
          ),

          Container(
            constraints: const BoxConstraints(maxHeight: 285),
            padding: const EdgeInsets.all(16),
            child: SingleChildScrollView(
              child: Column(
                children: [
                  if (metrics != null)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.analytics_outlined),
                                SizedBox(width: 8),
                                Text(
                                  'Preliminary Zone Intelligence',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 17,
                                  ),
                                ),
                              ],
                            ),

                            const SizedBox(height: 12),

                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                Chip(
                                  avatar: const Icon(
                                    Icons.square_foot,
                                    size: 18,
                                  ),
                                  label: Text(
                                    '${metrics.areaAcres.toStringAsFixed(1)} acres',
                                  ),
                                ),

                                Chip(
                                  avatar: const Icon(
                                    Icons.directions_walk,
                                    size: 18,
                                  ),
                                  label: Text(
                                    '${metrics.estimatedWalkingMiles.toStringAsFixed(1)} mi estimated',
                                  ),
                                ),

                                Chip(
                                  avatar: const Icon(Icons.schedule, size: 18),
                                  label: Text(
                                    _formatDuration(metrics.estimatedMinutes),
                                  ),
                                ),

                                Chip(
                                  avatar: const Icon(
                                    Icons.groups_outlined,
                                    size: 18,
                                  ),
                                  label: Text(
                                    '${metrics.recommendedScalerCount} recommended',
                                  ),
                                ),

                                Chip(
                                  avatar: const Icon(
                                    Icons.attach_money,
                                    size: 18,
                                  ),
                                  label: Text(
                                    '\$${metrics.suggestedBasePay.toStringAsFixed(0)} preliminary pay',
                                  ),
                                ),
                              ],
                            ),

                            const SizedBox(height: 8),

                            const Text(
                              'These estimates use zone geometry only. '
                              'Home counts, actual streets, access conditions, '
                              'and route optimization will improve them later.',
                              style: TextStyle(fontSize: 12),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),

                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed:
                              _inputPoints.isEmpty && _generatedArea.isEmpty
                              ? null
                              : _undoLastPoint,
                          icon: const Icon(Icons.undo),
                          label: const Text('Undo'),
                        ),
                      ),

                      const SizedBox(width: 12),

                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed:
                              _inputPoints.isEmpty && _generatedArea.isEmpty
                              ? null
                              : _clearArea,
                          icon: const Icon(Icons.clear),
                          label: const Text('Clear'),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 10),

                  Text(
                    '${_shapeLabel(_selectedShape)} • '
                    '${_generatedArea.length} verification '
                    'point${_generatedArea.length == 1 ? '' : 's'}',
                  ),

                  const SizedBox(height: 10),

                  SizedBox(
                    width: double.infinity,
                    height: 55,
                    child: ElevatedButton.icon(
                      onPressed: _saving ? null : _saveArea,
                      icon: _saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save),
                      label: Text(
                        _saving
                            ? 'Saving & Analyzing...'
                            : 'Save Campaign Zone',
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ZoneMetrics {
  final double areaSquareMeters;
  final double areaAcres;
  final double areaSquareMiles;
  final double perimeterMeters;
  final double perimeterMiles;
  final double estimatedWalkingMeters;
  final double estimatedWalkingMiles;
  final int estimatedMinutes;
  final int recommendedScalerCount;
  final double suggestedBasePay;

  const ZoneMetrics({
    required this.areaSquareMeters,
    required this.areaAcres,
    required this.areaSquareMiles,
    required this.perimeterMeters,
    required this.perimeterMiles,
    required this.estimatedWalkingMeters,
    required this.estimatedWalkingMiles,
    required this.estimatedMinutes,
    required this.recommendedScalerCount,
    required this.suggestedBasePay,
  });
}

class _ProjectedPoint {
  final double x;
  final double y;

  const _ProjectedPoint(this.x, this.y);
}
