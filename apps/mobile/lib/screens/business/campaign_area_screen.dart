import 'package:flutter_app/widgets/map_source_credit.dart';
import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import '../../services/business_workspace_service.dart';
import 'weather_alerts_screen.dart';
import 'dart:math' as math;
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import '../../widgets/production_route_review.dart';
import '../../config/app_environment.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../models/campaign_area_geometry.dart';
import '../../models/campaign_freehand_geometry.dart';
import '../../services/property_intelligence_service.dart';
import '../../services/scaled_circle_intelligence_service.dart';
import '../../widgets/property_intelligence_panel.dart';
import '../../widgets/zone_intelligence_summary.dart';

class CampaignAreaRecommendationResult {
  const CampaignAreaRecommendationResult.adjust(this.adjustedBoundary)
    : applied = false,
      drawOwn = false;
  const CampaignAreaRecommendationResult.applied()
    : adjustedBoundary = null,
      applied = true,
      drawOwn = false;
  const CampaignAreaRecommendationResult.drawOwn()
    : adjustedBoundary = null,
      applied = false,
      drawOwn = true;

  final List<Map<String, dynamic>>? adjustedBoundary;
  final bool applied;
  final bool drawOwn;
}

class CampaignAreaScreen extends StatefulWidget {
  final DocumentReference campaignReference;
  final Map<String, dynamic>? pendingZoneData;
  final List<Map<String, dynamic>> searchBoundary;
  // A reviewed analysis selection is a proposed zone, not just a search bound.
  // It remains unsaved until the owner explicitly chooses Save Zone.
  final List<Map<String, dynamic>> initialArea;
  final int? materialQuantity;
  final LatLng? initialCenter;
  final Map<String, double>? initialBounds;
  final String? searchContextLabel;
  final TileProvider? tileProvider;
  final ZoneEvidenceLoader? zoneEvidenceLoader;
  final String Function()? zoneEvidenceIdentity;
  final MapController? mapController;
  final Future<bool> Function()? analyzePersistedZone;
  final Future<PropertyIntelligenceAnalysis> Function(
    List<Map<String, double>> geometry,
  )?
  analyzeGeometry;
  final Future<CampaignAreaRecommendationResult?> Function(
    BuildContext context,
    List<Map<String, double>> boundary,
  )?
  recommendWithinArea;

  const CampaignAreaScreen({
    super.key,
    required this.campaignReference,
    this.pendingZoneData,
    this.searchBoundary = const [],
    this.initialArea = const [],
    this.materialQuantity,
    this.initialCenter,
    this.initialBounds,
    this.searchContextLabel,
    this.tileProvider,
    this.zoneEvidenceLoader,
    this.zoneEvidenceIdentity,
    this.mapController,
    this.analyzePersistedZone,
    this.analyzeGeometry,
    this.recommendWithinArea,
  });

  @override
  State<CampaignAreaScreen> createState() => _CampaignAreaScreenState();
}

class _CampaignAreaScreenState extends State<CampaignAreaScreen> {
  late final MapController _mapController =
      widget.mapController ?? MapController();
  final GlobalKey _mapViewportKey = GlobalKey();

  final List<LatLng> _inputPoints = [];

  List<LatLng> _generatedArea = [];
  List<LatLng> _searchBoundary = [];

  CampaignAreaShape _selectedShape = CampaignAreaShape.polygon;

  bool _saving = false;
  bool _recommending = false;
  bool _loadingExistingArea = true;
  bool _hasLoadedExistingArea = false;
  bool _mappingLocked = false;
  bool _propertyLayerEnabled = false;
  bool _loadingPropertyIntelligence = false;
  PropertyIntelligenceAnalysis? _propertyIntelligence;
  LatLng? _circlePreviewEdge;
  Timer? _propertyAnalysisDebounce;
  int _geometryRevision = 0;
  bool _replacementPromptOpen = false;
  bool _advancedDrawing = false;
  bool _drawingFreehand = false;
  int? _drawingPointer;
  int? _advancedTapPointer;
  Offset? _advancedTapStart;
  final List<LatLng> _freehandStroke = [];
  String? _freehandError;
  String? _freehandNotice;
  List<LatLng> _originalRepairStroke = [];
  bool _compareRepairStroke = false;
  bool _traceInvalid = false;
  _AreaDrawingSnapshot? _beforeFreehand;
  _AreaDrawingSnapshot? _freehandUndo;
  late String _zoneName;
  String _evidenceCampaignId = "";

  static const LatLng _defaultCenter = LatLng(39.2904, -76.6122);

  static const double _squareMetersPerAcre = 4046.8564224;

  @override
  void initState() {
    super.initState();

    _zoneName = widget.pendingZoneData?['zoneName']?.toString() ?? 'Zone 1';
    _evidenceCampaignId =
        widget.pendingZoneData?['campaignId']?.toString() ?? '';

    _loadExistingArea();
  }

  @override
  void dispose() {
    _propertyAnalysisDebounce?.cancel();
    if (widget.mapController == null) _mapController.dispose();
    super.dispose();
  }

  void _geometryChanged() {
    _geometryRevision++;
    _circlePreviewEdge = null;
    _propertyIntelligence = null;
    _loadingPropertyIntelligence = false;
    _propertyAnalysisDebounce?.cancel();
    if (_propertyLayerEnabled && !_drawingFreehand && _isAreaValid()) {
      _propertyAnalysisDebounce = Timer(
        const Duration(milliseconds: 300),
        _loadPropertyIntelligence,
      );
    }
  }

  Future<void> _loadExistingArea() async {
    // New zones have no Firestore document yet. Reading one would require
    // ownership fields which do not exist; keep the proposal local until Save.
    if (widget.pendingZoneData != null) {
      _searchBoundary = _parsePoints(widget.searchBoundary);
      final initial = _parsePoints(widget.initialArea);
      if (initial.length >= 3) {
        _inputPoints.addAll(initial);
        _generatedArea = List<LatLng>.from(initial);
      }
      _loadingExistingArea = false;
      return;
    }
    try {
      final snapshot = await widget.campaignReference.get();

      if (!snapshot.exists) {
        if (!mounted) {
          return;
        }

        setState(() {
          _searchBoundary = _parsePoints(widget.searchBoundary);
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

      final assignedScalerId = rawData['assignedScalerId']?.toString();

      if (!mounted) {
        return;
      }

      setState(() {
        _zoneName = rawData['zoneName']?.toString() ?? _zoneName;
        _evidenceCampaignId = rawData['campaignId']?.toString() ?? '';

        _selectedShape = existingShape;

        _mappingLocked =
            rawData['mapLocked'] == true ||
            (assignedScalerId != null && assignedScalerId.isNotEmpty);

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
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadingExistingArea = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'The saved area could not be loaded. Please retry before making changes.',
          ),
        ),
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
      _advancedDrawing = true;
      _drawingFreehand = false;
      _drawingPointer = null;
      _advancedTapPointer = null;
      _freehandStroke.clear();
      _freehandError = null;
      _freehandNotice = null;
      _originalRepairStroke = [];
      _compareRepairStroke = false;
      _traceInvalid = false;
      _selectedShape = shape;

      _inputPoints.clear();
      _generatedArea = [];

      _hasLoadedExistingArea = false;
      _geometryChanged();
    });
  }

  Future<bool> _confirmReplaceExistingArea({bool clear = true}) async {
    if (!_hasLoadedExistingArea) return true;
    if (_replacementPromptOpen) return false;
    _replacementPromptOpen = true;
    bool? replace;
    try {
      replace = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text('$_zoneName already has an area'),
          content: const Text(
            'A Zone is one practical Scaler work area. Replace the current '
            'boundary to redraw this Zone.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text('Replace $_zoneName'),
            ),
          ],
        ),
      );
    } finally {
      _replacementPromptOpen = false;
    }
    if (replace != true || !mounted) return false;
    if (clear) {
      _beginReplacement();
    } else {
      setState(() => _hasLoadedExistingArea = false);
    }
    return true;
  }

  void _beginReplacement() {
    setState(() {
      _inputPoints.clear();
      _generatedArea = [];
      _hasLoadedExistingArea = false;
      _geometryChanged();
    });
  }

  Future<void> _changeShape(CampaignAreaShape shape) async {
    if (shape == _selectedShape && _advancedDrawing) return;
    if (_hasLoadedExistingArea && !await _confirmReplaceExistingArea()) return;
    if (!mounted) return;
    _selectShape(shape);
  }

  void _handleMapTap(TapPosition tapPosition, LatLng point) {
    if (_mappingLocked || _saving || !_advancedDrawing) return;
    if (_hasLoadedExistingArea) {
      unawaited(_replaceThenPlacePoint(tapPosition, point));
      return;
    }
    if (_inputPoints.length >=
        CampaignAreaGeometry.maximumInputPoints(_selectedShape)) {
      return;
    }
    if (_selectedShape == CampaignAreaShape.polygon &&
        _inputPoints.isNotEmpty &&
        const Distance().as(LengthUnit.Meter, _inputPoints.last, point) < .5) {
      return;
    }
    // A double-click on the center is not a meaningful radius. Keep the center
    // ready for the next actual edge; never finalize a zero-area circle.
    if (_selectedShape == CampaignAreaShape.circle &&
        _inputPoints.length == 1 &&
        const Distance().as(LengthUnit.Meter, _inputPoints.first, point) < 1) {
      return;
    }
    setState(() {
      switch (_selectedShape) {
        case CampaignAreaShape.polygon:
          _inputPoints.add(point);
          _generatedArea = List.of(_inputPoints);
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
      _geometryChanged();
    });
  }

  Future<void> _replaceThenPlacePoint(
    TapPosition tapPosition,
    LatLng point,
  ) async {
    final shape = _selectedShape;
    if (!await _confirmReplaceExistingArea() ||
        !mounted ||
        shape != _selectedShape) {
      return;
    }
    _handleMapTap(tapPosition, point);
  }

  void _previewCircle(LatLng point) {
    if (_mappingLocked ||
        _saving ||
        !_advancedDrawing ||
        _selectedShape != CampaignAreaShape.circle ||
        _inputPoints.length != 1) {
      return;
    }
    setState(() => _circlePreviewEdge = point);
  }

  List<LatLng> _autoOrderPolygon(List<LatLng> points) {
    return CampaignAreaGeometry.fromInput(CampaignAreaShape.polygon, points);
  }

  List<LatLng> _buildRectangle(LatLng first, LatLng second) {
    return CampaignAreaGeometry.fromInput(CampaignAreaShape.rectangle, [
      first,
      second,
    ]);
  }

  List<LatLng> _buildCirclePolygon(LatLng center, LatLng edge) {
    return CampaignAreaGeometry.fromInput(CampaignAreaShape.circle, [
      center,
      edge,
    ]);
  }

  double? _circleRadiusMeters() {
    if (_selectedShape != CampaignAreaShape.circle ||
        _inputPoints.isEmpty ||
        (_inputPoints.length < 2 && _circlePreviewEdge == null)) {
      return null;
    }

    return const Distance().as(
      LengthUnit.Meter,
      _inputPoints[0],
      _inputPoints.length >= 2 ? _inputPoints[1] : _circlePreviewEdge!,
    );
  }

  void _undoLastPoint() {
    if (!_advancedDrawing) {
      final previous = _freehandUndo;
      setState(() {
        if (previous == null) {
          _inputPoints.clear();
          _generatedArea = [];
          _hasLoadedExistingArea = false;
        } else {
          _restoreDrawing(previous);
        }
        _freehandUndo = null;
        _drawingFreehand = false;
        _drawingPointer = null;
        _freehandStroke.clear();
        _freehandError = null;
        _freehandNotice = null;
        _originalRepairStroke = [];
        _compareRepairStroke = false;
        _traceInvalid = false;
        _geometryChanged();
      });
      return;
    }
    if (_inputPoints.isEmpty) {
      return;
    }

    setState(() {
      _hasLoadedExistingArea = false;

      _inputPoints.removeLast();

      switch (_selectedShape) {
        case CampaignAreaShape.polygon:
          _generatedArea = List.of(_inputPoints);
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
      _geometryChanged();
    });
  }

  void _clearArea() {
    setState(() {
      if (_generatedArea.isNotEmpty) _freehandUndo = _captureDrawing();
      _inputPoints.clear();
      _generatedArea = [];

      _hasLoadedExistingArea = false;
      _drawingFreehand = false;
      _drawingPointer = null;
      _freehandStroke.clear();
      _freehandError = null;
      _freehandNotice = null;
      _originalRepairStroke = [];
      _compareRepairStroke = false;
      _traceInvalid = false;
      _advancedTapPointer = null;
      _beforeFreehand = null;
      _geometryChanged();
    });
  }

  _AreaDrawingSnapshot _captureDrawing() => _AreaDrawingSnapshot(
    _selectedShape,
    List.of(_inputPoints),
    List.of(_generatedArea),
    _hasLoadedExistingArea,
  );

  void _restoreDrawing(_AreaDrawingSnapshot previous) {
    _selectedShape = previous.shape;
    _inputPoints
      ..clear()
      ..addAll(previous.input);
    _generatedArea = List.of(previous.area);
    _hasLoadedExistingArea = previous.loaded;
  }

  Future<void> _recommendWithinArea() async {
    final recommend = widget.recommendWithinArea;
    if (recommend == null || _recommending || !_isAreaValid()) return;
    final revision = _geometryRevision;
    final geometry = _generatedArea
        .map((p) => <String, double>{'lat': p.latitude, 'lng': p.longitude})
        .toList();
    setState(() => _recommending = true);
    try {
      final result = await recommend(context, geometry);
      if (!mounted) return;
      if (result?.applied == true) {
        // Apply owns persistence. This pending Zone must never enter the
        // caller's separate Save Zone path.
        Navigator.pop(context, false);
        return;
      }
      if (result?.drawOwn == true) {
        await _beginFreehand();
        return;
      }
      if (revision != _geometryRevision) return;
      final adjusted = _parsePoints(result?.adjustedBoundary);
      if (adjusted.length < 3 ||
          !CampaignFreehandGeometry.finish(
            adjusted,
            repairMinorDefects: false,
          ).isValid) {
        return;
      }
      final previous = _captureDrawing();
      setState(() {
        _freehandUndo = previous;
        _selectedShape = CampaignAreaShape.polygon;
        _advancedDrawing = false;
        _inputPoints
          ..clear()
          ..addAll(adjusted);
        _generatedArea = List.of(adjusted);
        _hasLoadedExistingArea = false;
        _freehandError = null;
        _freehandNotice = null;
        _originalRepairStroke = [];
        _compareRepairStroke = false;
        _geometryChanged();
      });
    } finally {
      if (mounted) setState(() => _recommending = false);
    }
  }

  Future<void> _beginFreehand({bool retry = false}) async {
    final before = _captureDrawing();
    if (!retry &&
        _hasLoadedExistingArea &&
        !await _confirmReplaceExistingArea(clear: false)) {
      return;
    }
    if (!mounted) return;
    setState(() {
      _beforeFreehand = before;
      _advancedDrawing = false;
      _drawingFreehand = true;
      _drawingPointer = null;
      _freehandStroke.clear();
      _freehandError = null;
      _freehandNotice = null;
      _originalRepairStroke = [];
      _compareRepairStroke = false;
      _traceInvalid = false;
      _circlePreviewEdge = null;
      // Editing starts a new geometry request generation. An analysis started
      // for the prior boundary must not arrive as this drawing's result.
      _geometryRevision++;
      _propertyAnalysisDebounce?.cancel();
      _propertyIntelligence = null;
      _loadingPropertyIntelligence = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final mapContext = _mapViewportKey.currentContext;
      if (mounted && _drawingFreehand && mapContext != null) {
        Scrollable.ensureVisible(mapContext, alignment: .1);
      }
    });
  }

  void _cancelFreehand() {
    setState(() {
      if (_beforeFreehand != null) _restoreDrawing(_beforeFreehand!);
      _drawingFreehand = false;
      _drawingPointer = null;
      _freehandStroke.clear();
      _freehandError = null;
      _freehandNotice = null;
      _originalRepairStroke = [];
      _compareRepairStroke = false;
      _traceInvalid = false;
      _advancedTapPointer = null;
      _geometryChanged();
    });
  }

  bool _insideMap(Offset point) {
    final size = _mapController.camera.nonRotatedSize;
    return point.dx >= 0 &&
        point.dy >= 0 &&
        point.dx <= size.width &&
        point.dy <= size.height;
  }

  void _traceDown(PointerDownEvent event) {
    if (_advancedDrawing && !_saving && !_mappingLocked) {
      if (_advancedTapPointer != null ||
          (event.kind == PointerDeviceKind.mouse &&
              event.buttons != kPrimaryMouseButton)) {
        _advancedTapPointer = null;
        return;
      }
      _advancedTapPointer = event.pointer;
      _advancedTapStart = event.localPosition;
      return;
    }
    if (!_drawingFreehand || _saving || _mappingLocked) return;
    if (_drawingPointer != null) {
      // Keep ownership until pointer-up/cancel, but immediately reject the
      // multi-touch trace. No second pointer may become a new stroke mid-gesture.
      _traceInvalid = true;
      _freehandError = 'Draw with one finger at a time. Try the outline again.';
      return;
    }
    if (event.kind == PointerDeviceKind.mouse &&
        event.buttons != kPrimaryMouseButton) {
      return;
    }
    if (!_insideMap(event.localPosition)) return;
    setState(() {
      _drawingPointer = event.pointer;
      _freehandStroke
        ..clear()
        ..add(_mapController.camera.screenOffsetToLatLng(event.localPosition));
      _traceInvalid = false;
      _freehandError = null;
    });
  }

  void _traceMove(PointerMoveEvent event) {
    if (_advancedDrawing &&
        _advancedTapPointer == event.pointer &&
        (event.localPosition - _advancedTapStart!).distance > 8) {
      _advancedTapPointer = null;
    }
    if (!_drawingFreehand ||
        _drawingPointer != event.pointer ||
        _traceInvalid) {
      return;
    }
    if (!_insideMap(event.localPosition)) {
      _traceInvalid = true;
      _freehandError =
          'Keep the outline inside the map. Move the map in Browse mode, then draw again.';
      return;
    }
    if (_freehandStroke.length >= CampaignFreehandGeometry.maximumRawPoints) {
      _traceInvalid = true;
      _freehandError =
          'This outline has too many points. Draw a shorter, simpler boundary.';
      return;
    }
    final point = _mapController.camera.screenOffsetToLatLng(
      event.localPosition,
    );
    if (_freehandStroke.isNotEmpty &&
        const Distance().as(LengthUnit.Meter, _freehandStroke.last, point) <
            .5) {
      return;
    }
    setState(() => _freehandStroke.add(point));
  }

  void _traceUp(PointerUpEvent event) {
    if (_advancedDrawing) {
      final isTap =
          _advancedTapPointer == event.pointer &&
          _advancedTapStart != null &&
          (event.localPosition - _advancedTapStart!).distance <= 8;
      _advancedTapPointer = null;
      if (isTap && _insideMap(event.localPosition)) {
        _handleMapTap(
          TapPosition(event.position, event.localPosition),
          _mapController.camera.screenOffsetToLatLng(event.localPosition),
        );
      }
      return;
    }
    if (!_drawingFreehand || _drawingPointer != event.pointer) return;
    FreehandAreaResult? result;
    try {
      if (!_insideMap(event.localPosition)) _traceInvalid = true;
      if (!_traceInvalid) {
        final endpoint = _mapController.camera.screenOffsetToLatLng(
          event.localPosition,
        );
        if (_freehandStroke.isNotEmpty &&
            const Distance().as(
                  LengthUnit.Meter,
                  _freehandStroke.last,
                  endpoint,
                ) >=
                .5) {
          if (_freehandStroke.length >=
              CampaignFreehandGeometry.maximumRawPoints) {
            _traceInvalid = true;
            _freehandError =
                'This outline has too many points. Draw a shorter, simpler boundary.';
          } else {
            _freehandStroke.add(endpoint);
          }
        }
      }
      result = _traceInvalid
          ? null
          : CampaignFreehandGeometry.finish(
              _freehandStroke,
              metersPerPixel:
                  40075016.686 *
                  math.cos(
                    _mapController.camera.center.latitude * math.pi / 180,
                  ) /
                  (256 * math.pow(2, _mapController.camera.zoom)),
            );
    } catch (_) {
      _freehandError = 'The outline was interrupted. Draw again.';
    } finally {
      _completeTrace(result);
    }
  }

  void _traceCancel(PointerCancelEvent event) {
    _advancedTapPointer = null;
    _advancedTapStart = null;
    if (event.pointer != _drawingPointer) return;
    _freehandError = 'The outline was interrupted. Draw again.';
    _completeTrace(null);
  }

  void _guardTrace(VoidCallback action) {
    try {
      action();
    } catch (_) {
      _freehandError = 'The outline was interrupted. Draw again.';
      _completeTrace(null);
    }
  }

  void _completeTrace(FreehandAreaResult? result) {
    if (!mounted) return;
    setState(() {
      _drawingFreehand = false;
      _drawingPointer = null;
      _advancedTapPointer = null;
      _advancedTapStart = null;
      _traceInvalid = false;
      if (result?.isValid == true) {
        _freehandUndo = _beforeFreehand;
        _selectedShape = CampaignAreaShape.polygon;
        // Preserve the traced ring order, including concave neighborhood edges.
        _generatedArea = List.of(result!.points);
        _inputPoints
          ..clear()
          ..addAll(result.points);
        _hasLoadedExistingArea = false;
        _freehandError = null;
        _freehandNotice = result.wasRepaired
            ? 'We cleaned up a small overlap. Review your boundary.'
            : null;
        _originalRepairStroke = result.wasRepaired
            ? List.of(_freehandStroke)
            : [];
        _compareRepairStroke = false;
        _geometryChanged();
      } else {
        _freehandError ??=
            result?.error ??
            'The outline was interrupted. Try drawing it again.';
        if (_beforeFreehand != null) _restoreDrawing(_beforeFreehand!);
        _freehandUndo = _beforeFreehand;
        _freehandNotice = null;
        _originalRepairStroke = [];
        _compareRepairStroke = false;
        _geometryChanged();
      }
      _freehandStroke.clear();
    });
  }

  bool _isAreaValid() {
    if (_freehandError != null) return false;
    switch (_selectedShape) {
      case CampaignAreaShape.polygon:
        return _generatedArea.length >= 3 &&
            (!_advancedDrawing ||
                _hasLoadedExistingArea ||
                CampaignFreehandGeometry.finish(
                  _generatedArea,
                  repairMinorDefects: false,
                ).isValid);

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

    return ZoneMetrics(
      areaSquareMeters: areaSquareMeters,
      areaAcres: areaSquareMeters / _squareMetersPerAcre,
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

  Future<bool> _analyzeSavedZone() async {
    try {
      if (widget.analyzePersistedZone != null) {
        return widget.analyzePersistedZone!();
      }
      final callable = FirebaseFunctions.instanceFor(
        region: 'us-east1',
      ).httpsCallable('analyzeCampaignZone');

      final result = await callable.call({
        'zoneId': widget.campaignReference.id,
      });
      if (!mounted) return false;
      await reviewProductionRouteAnalysis(context, result.data);
      final saved = await widget.campaignReference.get();
      final campaignId = (saved.data() as Map?)?['campaignId'];
      if (campaignId is String) {
        await FirebaseFunctions.instanceFor(
          region: 'us-east1',
        ).httpsCallable('confirmCampaignZoneIntelligence').call({
          'campaignId': campaignId,
          'zoneId': widget.campaignReference.id,
        });
      }

      return true;
    } on FirebaseFunctionsException catch (e) {
      debugPrint(
        'Zone analysis failed: '
        '${e.code} ${e.message}',
      );

      if (AppEnvironmentConfig.isProduction) return false;
      return _markHomeEstimateUnavailable();
    } catch (e) {
      debugPrint('Zone analysis failed: $e');

      if (AppEnvironmentConfig.isProduction) return false;
      return _markHomeEstimateUnavailable();
    }
  }

  Future<void> _loadPropertyIntelligence() async {
    if (!_isAreaValid() ||
        _drawingFreehand ||
        _loadingPropertyIntelligence ||
        !_propertyLayerEnabled) {
      return;
    }
    setState(() => _loadingPropertyIntelligence = true);
    final revision = _geometryRevision;
    final geometry = _generatedArea
        .map(
          (p) => <String, double>{
            'latitude': p.latitude,
            'longitude': p.longitude,
          },
        )
        .toList(growable: false);
    try {
      // The editor holds draft geometry, including unsaved edits to an existing
      // Zone. Analyze those exact points through the exploratory authority.
      final analysis =
          await (widget.analyzeGeometry ??
              PropertyIntelligenceService().analyzeArea)(geometry);
      if (mounted && revision == _geometryRevision && _propertyLayerEnabled) {
        setState(() => _propertyIntelligence = analysis);
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted && revision == _geometryRevision) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error.message ??
                  'Property Intelligence is temporarily unavailable.',
            ),
          ),
        );
      }
    } finally {
      if (mounted && revision == _geometryRevision) {
        setState(() => _loadingPropertyIntelligence = false);
      }
    }
  }

  Color _propertySignalColor() {
    final signal = _propertyIntelligence?.signal;
    if (!_propertyLayerEnabled || signal == null) return Colors.blue;
    if (signal >= 75) return const Color(0xFFE36B3D);
    if (signal >= 50) return const Color(0xFFE3A13D);
    if (signal >= 25) return const Color(0xFF43A7D8);
    return const Color(0xFF19C7A2);
  }

  CameraFit? _initialCameraFit() {
    if (_generatedArea.length >= 3) {
      return CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(_generatedArea),
        padding: const EdgeInsets.all(32),
      );
    }
    final bounds = widget.initialBounds;
    if (bounds != null &&
        const [
          'south',
          'north',
          'west',
          'east',
        ].every((k) => bounds[k]?.isFinite == true) &&
        bounds['north']! > bounds['south']! &&
        bounds['east']! > bounds['west']!) {
      return CameraFit.bounds(
        bounds: LatLngBounds(
          LatLng(bounds['south']!, bounds['west']!),
          LatLng(bounds['north']!, bounds['east']!),
        ),
        padding: const EdgeInsets.all(32),
      );
    }
    if (_searchBoundary.length >= 3) {
      return CameraFit.bounds(
        bounds: LatLngBounds.fromPoints(_searchBoundary),
        padding: const EdgeInsets.all(32),
      );
    }
    return null;
  }

  Future<void> _showPropertyComparison() async {
    final zone = await widget.campaignReference.get();
    final campaignId = (zone.data() as Map<String, dynamic>?)?['campaignId']
        ?.toString();
    if (campaignId == null || campaignId.isEmpty || !mounted) return;
    final zones = await FirebaseFirestore.instance
        .collection('campaignZones')
        .where('campaignId', isEqualTo: campaignId)
        .get();
    final analyses = zones.docs
        .map((doc) {
          final data = doc.data();
          final raw = data['propertyIntelligenceSummary'];
          if (raw is! Map) return null;
          return (
            data['zoneName']?.toString() ?? 'Zone',
            PropertyIntelligenceAnalysis(Map<String, dynamic>.from(raw)),
          );
        })
        .whereType<(String, PropertyIntelligenceAnalysis)>()
        .toList();
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Compare Property Intelligence'),
        content: SizedBox(
          width: 520,
          child: analyses.isEmpty
              ? const Text(
                  'Analyze additional campaign zones to compare their neutral property-age signals.',
                )
              : SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: analyses
                        .map(
                          (entry) => ListTile(
                            leading: CircleAvatar(
                              child: Text(entry.$2.signal?.toString() ?? '—'),
                            ),
                            title: Text(entry.$1),
                            subtitle: Text(
                              '${entry.$2.source} (${entry.$2.inputGranularity}) • ${entry.$2.predominantEra} • Pre-1980 ${entry.$2.pre1980.toStringAsFixed(0)}% • Pre-2000 ${entry.$2.pre2000.toStringAsFixed(0)}% • ${entry.$2.ageMetricsAreEstimated ? 'estimated ' : ''}30+ ${entry.$2.age30Plus.toStringAsFixed(0)}% • ${entry.$2.confidence} confidence • ${entry.$2.coverage.toStringAsFixed(0)}% coverage',
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _askPropertyAi() async {
    final analysis = _propertyIntelligence;
    final analysisId = analysis?.data['analysisId']?.toString() ?? '';
    final geometryDigest = analysis?.data['geometryDigest']?.toString() ?? '';
    if (analysis == null || analysisId.isEmpty || geometryDigest.isEmpty) {
      return;
    }
    final objective = TextEditingController();
    final question = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ask AI About This Area'),
        content: SizedBox(
          width: 520,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: objective,
                decoration: const InputDecoration(
                  labelText: 'Business objective',
                ),
              ),
              TextField(
                controller: question,
                maxLength: 1200,
                decoration: const InputDecoration(labelText: 'Question'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Analyze'),
          ),
        ],
      ),
    );
    if (submitted != true || !mounted) {
      objective.dispose();
      question.dispose();
      return;
    }
    try {
      final result = await ScaledCircleIntelligenceService().analyzeProperty(
        analysisId: analysisId,
        geometryDigest: geometryDigest,
        businessObjective: objective.text,
        question: question.text,
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('AI Opportunity Analysis'),
          content: SingleChildScrollView(child: Text(result.summary)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error.message ?? 'AI analysis is temporarily unavailable.',
            ),
          ),
        );
      }
    } finally {
      objective.dispose();
      question.dispose();
    }
  }

  Future<bool> _markHomeEstimateUnavailable() async {
    try {
      await widget.campaignReference.update({
        'analysisStatus': 'geometry_complete',
        'homeCountStatus': 'unavailable',
        'homeCountMethod': 'unavailable',
        'homeCountConfidence': 'unavailable',
        'homeCountConfidenceScore': 0.0,
        'estimatedHomes': 0,
        'analysisUpdatedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      debugPrint('Unable to record unavailable home estimate: $e');

      return false;
    }
  }

  Future<void> _saveArea() async {
    final latestSnapshot = widget.pendingZoneData == null
        ? await widget.campaignReference.get()
        : null;
    if (!mounted) {
      return;
    }

    final latestData = latestSnapshot?.data() as Map<String, dynamic>?;
    final latestAssignedScalerId = latestData?['assignedScalerId']?.toString();

    if (_mappingLocked ||
        latestData?['mapLocked'] == true ||
        (latestAssignedScalerId != null && latestAssignedScalerId.isNotEmpty)) {
      setState(() {
        _mappingLocked = true;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This zone map is locked because the campaign was launched or a '
            'Scaler is already assigned.',
          ),
        ),
      );

      return;
    }

    if (!_isAreaValid()) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_instructionText())));

      return;
    }

    // Regional property aggregates are not accessible stops within this target.
    // Material quantity must not silently force a redraw or a coverage claim.

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

      if (latestSnapshot?.exists == true) {
        updateData.remove('estimatedHomes');
        updateData.remove('homeCountStatus');
        updateData.remove('analysisStatus');
        await widget.campaignReference.update(updateData);
      } else {
        final pendingZoneData = widget.pendingZoneData;
        if (pendingZoneData == null) {
          throw StateError('Campaign zone draft information is unavailable.');
        }
        final createData = <String, dynamic>{...pendingZoneData, ...updateData};
        if (_selectedShape != CampaignAreaShape.circle) {
          createData.remove('serviceAreaCenter');
          createData.remove('serviceAreaRadiusMeters');
        }
        await widget.campaignReference.set(createData);
      }

      if (!mounted) return;

      // Persistence is authoritative. Optional intelligence continues after
      // the map workflow returns and can never invalidate the saved target.
      if (AppEnvironmentConfig.isProduction) {
        await _analyzeSavedZone();
        if (!mounted) return;
      } else {
        unawaited(_analyzeSavedZone());
      }
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) {
        return;
      }

      debugPrint('Unable to save campaign zone: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'The area could not be confirmed. Check the saved zones before trying again.',
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

  String _instructionText() {
    if (!_advancedDrawing) {
      if (_drawingFreehand) {
        return 'Press and drag around the streets or neighborhood you want to cover. Release to preview your area.';
      }
      return _generatedArea.isEmpty
          ? 'Browse the map, then choose Draw Area to trace your territory.'
          : 'Review your boundary. Pan or zoom to inspect it, then Use This Area or Edit Boundary.';
    }
    switch (_selectedShape) {
      case CampaignAreaShape.polygon:
        if (_generatedArea.length >= 3) {
          final validation = CampaignFreehandGeometry.finish(
            _generatedArea,
            repairMinorDefects: false,
          );
          if (!validation.isValid) return validation.error!;
        }
        return 'Click or tap boundary points in order around the area. Add at least 3 points; Undo removes the last point.';

      case CampaignAreaShape.rectangle:
        return 'Tap two opposite corners of the rectangle.';

      case CampaignAreaShape.circle:
        if (_inputPoints.isEmpty) {
          return 'Click or tap the center of your campaign area.';
        }
        if (_inputPoints.length == 1) {
          return 'Move the pointer and click again to set the radius. On touchscreens, tap the radius point.';
        }
        return 'Circle ready. Save this area, or Undo to adjust its radius.';

      case CampaignAreaShape.triangle:
        return 'Tap the 3 corners of the triangle.';
    }
  }

  String _shapeLabel(CampaignAreaShape shape) {
    return CampaignAreaGeometry.label(shape);
  }

  String _shapeValue(CampaignAreaShape shape) {
    return CampaignAreaGeometry.value(shape);
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

  @override
  Widget build(BuildContext context) {
    if (_loadingExistingArea) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final signalColor = _propertySignalColor();
    final preview =
        _selectedShape == CampaignAreaShape.circle &&
            _inputPoints.length == 1 &&
            _circlePreviewEdge != null
        ? _buildCirclePolygon(_inputPoints.first, _circlePreviewEdge!)
        : <LatLng>[];
    final polygons = _generatedArea.length >= 3
        ? [
            Polygon(
              points: _generatedArea,
              borderStrokeWidth: 3,
              color: signalColor.withValues(
                alpha: _propertyLayerEnabled ? 0.30 : 0.18,
              ),
              borderColor: signalColor,
            ),
          ]
        : <Polygon>[];
    if (preview.isNotEmpty) {
      polygons.add(
        Polygon(
          points: preview,
          borderStrokeWidth: 2,
          color: Colors.blue.withValues(alpha: 0.10),
          borderColor: Colors.blue,
        ),
      );
    }
    if (_searchBoundary.length >= 3) {
      polygons.insert(
        0,
        Polygon(
          points: _searchBoundary,
          borderStrokeWidth: 2,
          color: Colors.blueGrey.withValues(alpha: 0.05),
          borderColor: Colors.blueGrey.withValues(alpha: 0.65),
        ),
      );
    }

    final markers = (_advancedDrawing ? _inputPoints : <LatLng>[])
        .asMap()
        .entries
        .map(
          (entry) => Marker(
            point: entry.value,
            width: 16,
            height: 16,
            child: Container(
              decoration: BoxDecoration(
                color: Colors.blue,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: const [
                  BoxShadow(color: Colors.black38, blurRadius: 3),
                ],
              ),
            ),
          ),
        )
        .toList();

    final radius = _circleRadiusMeters();

    final metrics = _calculateZoneMetrics();

    return Scaffold(
      // Recovery remains reachable even when entering Draw mode scrolled the
      // toolbar above the map. Wrap and intrinsic height preserve large text.
      bottomNavigationBar: _freehandError != null && !_drawingFreehand
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Semantics(liveRegion: true, child: Text(_freehandError!)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        FilledButton.icon(
                          key: const Key('freehand-draw-again'),
                          onPressed: _saving || _mappingLocked
                              ? null
                              : () => _beginFreehand(retry: true),
                          icon: const Icon(Icons.draw_outlined),
                          label: const Text('Draw Again'),
                        ),
                        TextButton(
                          key: const Key('freehand-recovery-cancel'),
                          onPressed: _saving
                              ? null
                              : () => Navigator.pop(context, false),
                          child: const Text('Cancel'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            )
          : null,
      appBar: AuthenticatedAppBar(
        title: Text(_mappingLocked ? 'Campaign Area (Locked)' : 'Choose area'),
        centerTitle: true,
        bottom: _drawingFreehand
            ? PreferredSize(
                preferredSize: const Size.fromHeight(56),
                child: SizedBox(
                  height: 56,
                  child: TextButton.icon(
                    onPressed: _cancelFreehand,
                    icon: const Icon(Icons.close),
                    label: const Text('Cancel drawing'),
                  ),
                ),
              )
            : null,
      ),
      body: LayoutBuilder(
        builder: (context, viewport) {
          final desktop = viewport.maxWidth >= 760;
          final mapHeight = desktop
              ? (viewport.maxHeight * 0.64).clamp(520.0, 760.0)
              : (viewport.maxHeight * 0.56).clamp(360.0, 560.0);
          return SingleChildScrollView(
            key: const Key('campaign-area-scroll'),
            physics: _drawingFreehand
                ? const NeverScrollableScrollPhysics()
                : null,
            child: Column(
              children: [
                if (!_mappingLocked)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Draw Your Area',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      Chip(
                        avatar: Icon(
                          _drawingFreehand
                              ? Icons.gesture
                              : Icons.pan_tool_outlined,
                        ),
                        label: Text(
                          _drawingFreehand ? 'Draw mode' : 'Browse Map',
                        ),
                      ),
                      FilledButton.icon(
                        onPressed: _mappingLocked || _saving || _drawingFreehand
                            ? null
                            : _beginFreehand,
                        icon: const Icon(Icons.draw_outlined),
                        label: Text(
                          _generatedArea.isEmpty
                              ? 'Draw Area'
                              : 'Edit Boundary',
                        ),
                      ),
                    ],
                  ),
                ),
                ExpansionTile(
                  title: const Text('Advanced Drawing Tools'),
                  subtitle: const Text(
                    'Click boundary points, or use Rectangle and Circle.',
                  ),
                  children: [
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final shape in CampaignAreaShape.values.where(
                          (v) => v != CampaignAreaShape.triangle,
                        ))
                          OutlinedButton.icon(
                            onPressed: _mappingLocked || _saving
                                ? null
                                : () => _changeShape(shape),
                            icon: Icon(_shapeIcon(shape)),
                            label: Text(_shapeLabel(shape)),
                          ),
                      ],
                    ),
                    const Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                        'Polygon is an alternative to dragging: click or tap boundary points one at a time.',
                      ),
                    ),
                  ],
                ),

                if (_mappingLocked)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 4, 16, 10),
                    child: Card(
                      child: ListTile(
                        leading: Icon(Icons.lock_outline),
                        title: Text('Campaign zone map is locked'),
                        subtitle: Text(
                          'The boundary cannot change after campaign launch or '
                          'Scaler assignment.',
                        ),
                      ),
                    ),
                  ),

                if (_hasLoadedExistingArea && !_mappingLocked)
                  Padding(
                    padding: EdgeInsets.fromLTRB(16, 4, 16, 10),
                    child: Card(
                      child: ListTile(
                        leading: const Icon(Icons.check_circle_outline),
                        title: Text('$_zoneName already has an area'),
                        subtitle: const Text(
                          'Review this saved boundary or choose Edit Boundary to redraw it.',
                        ),
                      ),
                    ),
                  ),

                if (BusinessWorkspaceSession.can('intelligence'))
                  ListTile(
                    leading: const Icon(Icons.cloud_outlined),
                    title: const Text('Weather Intelligence'),
                    subtitle: const Text(
                      'Plan field work around local weather. Review your saved weather coverage before choosing dates.',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const WeatherAlertsScreen(),
                      ),
                    ),
                  ),
                SwitchListTile(
                  value: _propertyLayerEnabled,
                  secondary: const Icon(Icons.home_work_outlined),
                  title: const Text('Property Intelligence'),
                  subtitle: const Text(
                    'Select an area to analyze properties and local geography.',
                  ),
                  onChanged: (enabled) {
                    setState(() => _propertyLayerEnabled = enabled);
                    if (enabled && !_isAreaValid()) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Draw or select an area first. Property Intelligence will analyze it as soon as the area is ready.',
                          ),
                        ),
                      );
                    }
                    if (enabled && _propertyIntelligence == null) {
                      _loadPropertyIntelligence();
                    }
                  },
                ),

                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: Column(
                    children: [
                      // Reserve status space so the map cannot move underneath
                      // the pointer when the first click changes instructions.
                      SizedBox(
                        height: MediaQuery.textScalerOf(context).scale(64),
                        child: Center(
                          child: Text(
                            _instructionText(),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                      if (widget.searchContextLabel != null)
                        Text('Map context: ${widget.searchContextLabel}'),
                      if (_freehandNotice != null)
                        Text(
                          _freehandNotice!,
                          key: const Key('freehand-repair-notice'),
                        ),
                      if (_freehandNotice != null)
                        TextButton(
                          key: const Key('freehand-raw-comparison'),
                          onPressed: () => setState(
                            () => _compareRepairStroke = !_compareRepairStroke,
                          ),
                          child: Text(
                            _compareRepairStroke
                                ? 'Hide original outline'
                                : 'Compare original outline',
                          ),
                        ),
                      if (_compareRepairStroke)
                        const Text(
                          'Orange: original outline. Blue: corrected boundary.',
                        ),

                      SizedBox(
                        height: MediaQuery.textScalerOf(context).scale(26),
                        child: Center(
                          child: Text(
                            radius == null
                                ? ' '
                                : '${_inputPoints.length == 1 ? 'Preview radius' : 'Radius'}: ${radius.toStringAsFixed(0)} meters',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                SizedBox(
                  key: const Key('campaign-zone-map-workspace'),
                  height: mapHeight,
                  child: MapAttributionFrame(
                    child: Listener(
                      key: const Key('freehand-map-input'),
                      onPointerDown: (event) =>
                          _guardTrace(() => _traceDown(event)),
                      onPointerMove: (event) =>
                          _guardTrace(() => _traceMove(event)),
                      onPointerUp: (event) =>
                          _guardTrace(() => _traceUp(event)),
                      onPointerCancel: _traceCancel,
                      child: FlutterMap(
                        key: _mapViewportKey,
                        mapController: _mapController,

                        options: MapOptions(
                          initialCenter: _generatedArea.isEmpty
                              ? (_searchBoundary.isEmpty
                                    ? widget.initialCenter ?? _defaultCenter
                                    : _calculateCenter(_searchBoundary))
                              : _calculateCenter(_generatedArea),
                          initialZoom: _generatedArea.isEmpty
                              ? (_searchBoundary.isEmpty ? 13 : 10)
                              : 15,
                          initialCameraFit: _initialCameraFit(),
                          interactionOptions: InteractionOptions(
                            flags: _drawingFreehand
                                ? InteractiveFlag.none
                                : _mappingLocked || !_advancedDrawing
                                ? InteractiveFlag.all
                                : InteractiveFlag.all &
                                      ~InteractiveFlag.doubleTapZoom &
                                      ~InteractiveFlag.doubleTapDragZoom,
                          ),
                          onPointerHover: (_, point) => _previewCircle(point),

                          // Drawing taps use the pointer path above so switching
                          // modes cannot leave FlutterMap's double-tap timer in
                          // charge of an area's first or second boundary point.
                        ),

                        children: [
                          TileLayer(
                            urlTemplate:
                                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            userAgentPackageName: 'com.scaledcircle.app',
                            tileProvider: widget.tileProvider,
                          ),

                          PolygonLayer(polygons: polygons),
                          if (_compareRepairStroke &&
                              _originalRepairStroke.length >= 2)
                            PolylineLayer(
                              polylines: [
                                Polyline(
                                  points: _originalRepairStroke,
                                  color: Colors.orange,
                                  strokeWidth: 2,
                                ),
                              ],
                            ),
                          if (_freehandStroke.length >= 2)
                            PolylineLayer(
                              polylines: [
                                Polyline(
                                  points: List.of(_freehandStroke),
                                  color: Colors.blue,
                                  strokeWidth: 4,
                                ),
                              ],
                            ),

                          MarkerLayer(markers: markers),
                        ],
                      ),
                    ),
                  ),
                ),

                Container(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      if (_propertyLayerEnabled && _loadingPropertyIntelligence)
                        const Padding(
                          padding: EdgeInsets.all(20),
                          child: CircularProgressIndicator(),
                        ),
                      if (_propertyLayerEnabled &&
                          _propertyIntelligence != null) ...[
                        PropertyIntelligencePanel(
                          analysis: _propertyIntelligence!,
                          onCreateCampaign: () =>
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'This selected area is already attached to the current campaign draft. Confirm and save the campaign when ready.',
                                  ),
                                ),
                              ),
                          onCompare: widget.pendingZoneData == null
                              ? _showPropertyComparison
                              : null,
                          onAskAi: _askPropertyAi,
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (metrics != null &&
                          !_drawingFreehand &&
                          !_traceInvalid)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${metrics.areaAcres.toStringAsFixed(1)} acres',
                                ),
                                const SizedBox(height: 8),
                                ZoneIntelligencePreview(
                                  geometry: _generatedArea
                                      .map(
                                        (p) => <String, double>{
                                          'latitude': p.latitude,
                                          'longitude': p.longitude,
                                        },
                                      )
                                      .toList(),
                                  campaignId: _evidenceCampaignId,
                                  zoneId: widget.pendingZoneData == null
                                      ? widget.campaignReference.id
                                      : null,
                                  loader: widget.zoneEvidenceLoader,
                                  identity: widget.zoneEvidenceIdentity,
                                ),
                              ],
                            ),
                          ),
                        ),

                      Row(
                        children: [
                          if (_hasLoadedExistingArea && _advancedDrawing) ...[
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _mappingLocked
                                    ? null
                                    : _beginReplacement,
                                icon: const Icon(Icons.edit_location_alt),
                                label: const Text('Replace Area'),
                              ),
                            ),
                            const SizedBox(width: 12),
                          ],
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed:
                                  _mappingLocked ||
                                      (_inputPoints.isEmpty &&
                                          _generatedArea.isEmpty &&
                                          _freehandUndo == null)
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
                                  _mappingLocked ||
                                      (_inputPoints.isEmpty &&
                                          _generatedArea.isEmpty)
                                  ? null
                                  : _clearArea,
                              icon: const Icon(Icons.clear),
                              label: const Text('Clear'),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 10),

                      if (widget.recommendWithinArea != null) ...[
                        const Text(
                          'Preview a recommendation inside this boundary. '
                          'Your saved territory stays unchanged until you use a recommendation or save this area.',
                        ),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed:
                              _saving ||
                                  _recommending ||
                                  _mappingLocked ||
                                  _drawingFreehand ||
                                  !_isAreaValid()
                              ? null
                              : _recommendWithinArea,
                          icon: const Icon(Icons.auto_awesome_outlined),
                          label: Text(
                            _recommending
                                ? 'Reviewing this area...'
                                : 'Recommend within this area',
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],

                      SizedBox(
                        width: double.infinity,
                        child: TextButton(
                          onPressed: _saving || _recommending
                              ? null
                              : () => Navigator.pop(context, false),
                          child: const Text('Cancel'),
                        ),
                      ),

                      if (_advancedDrawing)
                        Text(
                          '${_shapeLabel(_selectedShape)} • '
                          '${_generatedArea.length} verification '
                          'point${_generatedArea.length == 1 ? '' : 's'}',
                        ),

                      const SizedBox(height: 10),

                      Container(
                        width: double.infinity,
                        constraints: const BoxConstraints(minHeight: 55),
                        child: ElevatedButton.icon(
                          onPressed:
                              _saving ||
                                  _recommending ||
                                  _mappingLocked ||
                                  _drawingFreehand ||
                                  !_isAreaValid()
                              ? null
                              : _saveArea,
                          icon: _saving
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.save),
                          label: Text(
                            _saving
                                ? 'Saving Target...'
                                : _advancedDrawing
                                ? 'Save Zone'
                                : 'Use This Area',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AreaDrawingSnapshot {
  final CampaignAreaShape shape;
  final List<LatLng> input;
  final List<LatLng> area;
  final bool loaded;

  const _AreaDrawingSnapshot(this.shape, this.input, this.area, this.loaded);
}

class ZoneMetrics {
  final double areaSquareMeters;
  final double areaAcres;

  const ZoneMetrics({required this.areaSquareMeters, required this.areaAcres});
}

class _ProjectedPoint {
  final double x;
  final double y;

  const _ProjectedPoint(this.x, this.y);
}
