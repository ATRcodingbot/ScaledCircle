import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class ServiceAreaMapSelection {
  const ServiceAreaMapSelection({
    required this.center,
    required this.geometry,
    this.geometryParts = const [],
  });
  final LatLng center;
  final List<LatLng> geometry;
  final List<List<LatLng>> geometryParts;
}

class ServiceAreaMapPicker extends StatefulWidget {
  const ServiceAreaMapPicker({
    super.key,
    required this.drawArea,
    this.initialCenter,
    this.initialGeometry = const [],
    this.initialGeometryParts = const [],
    this.confirmationOnly = false,
  });
  final bool drawArea;
  final LatLng? initialCenter;
  final List<LatLng> initialGeometry;
  final List<List<LatLng>> initialGeometryParts;
  final bool confirmationOnly;

  @override
  State<ServiceAreaMapPicker> createState() => _ServiceAreaMapPickerState();
}

class _ServiceAreaMapPickerState extends State<ServiceAreaMapPicker> {
  static const _maryland = LatLng(39.0458, -76.6413);
  final List<LatLng> _points = [];
  bool _adjusting = false;

  @override
  void initState() {
    super.initState();
    _points.addAll(widget.initialGeometry);
    if (_points.isEmpty && widget.initialCenter != null && !widget.drawArea) {
      _points.add(widget.initialCenter!);
    }
  }

  void _tap(TapPosition _, LatLng point) {
    if (widget.confirmationOnly && !_adjusting) return;
    setState(() {
      if (!widget.drawArea) _points.clear();
      if (_points.length < 100) _points.add(point);
    });
  }

  @override
  Widget build(BuildContext context) {
    final usingResolvedBoundary =
        widget.confirmationOnly && !_adjusting && _points.length >= 3;
    final ready = usingResolvedBoundary
        ? true
        : widget.drawArea
        ? _points.length >= 3
        : _points.length == 1;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.confirmationOnly
              ? 'Confirm service area'
              : widget.drawArea
              ? 'Draw my area'
              : 'Choose the center',
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              widget.confirmationOnly && !_adjusting
                  ? 'Is this the area you serve? The saved boundary will be reused across ScaledCircle.'
                  : widget.drawArea
                  ? 'Tap around the area where you want to work. Use at least three points.'
                  : 'Tap the map near your business or preferred work area. This does not turn on GPS.',
            ),
          ),
          Expanded(
            child: FlutterMap(
              options: MapOptions(
                initialCenter:
                    widget.initialCenter ??
                    (_points.isEmpty ? _maryland : _points.first),
                initialZoom: widget.initialCenter == null ? 8 : 10,
                onTap: _tap,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.scaledcircle.app',
                ),
                const RichAttributionWidget(
                  attributions: [
                    TextSourceAttribution('© OpenStreetMap contributors'),
                    TextSourceAttribution(
                      'Boundaries: Nominatim / U.S. Census',
                    ),
                  ],
                ),
                if (_points.length >= 3)
                  PolygonLayer(
                    polygons:
                        (usingResolvedBoundary &&
                                    widget.initialGeometryParts.isNotEmpty
                                ? widget.initialGeometryParts
                                : [_points])
                            .map(
                              (part) => Polygon(
                                points: part,
                                color: const Color(0x3319C7A2),
                                borderColor: const Color(0xFF19C7A2),
                                borderStrokeWidth: 3,
                              ),
                            )
                            .toList(),
                  ),
                MarkerLayer(
                  markers: _points
                      .asMap()
                      .entries
                      .map(
                        (entry) => Marker(
                          point: entry.value,
                          width: 34,
                          height: 34,
                          child: CircleAvatar(child: Text('${entry.key + 1}')),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  if (widget.confirmationOnly && !_adjusting)
                    TextButton(
                      onPressed: () => setState(() {
                        _adjusting = true;
                        _points.clear();
                      }),
                      child: const Text('Adjust Boundary'),
                    )
                  else
                    TextButton(
                      onPressed: _points.isEmpty
                          ? null
                          : () => setState(_points.clear),
                      child: const Text('Start Over'),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: ready
                        ? () {
                            final latitude =
                                _points
                                    .map((point) => point.latitude)
                                    .reduce((a, b) => a + b) /
                                _points.length;
                            final longitude =
                                _points
                                    .map((point) => point.longitude)
                                    .reduce((a, b) => a + b) /
                                _points.length;
                            Navigator.pop(
                              context,
                              ServiceAreaMapSelection(
                                center: LatLng(latitude, longitude),
                                geometry:
                                    widget.drawArea || usingResolvedBoundary
                                    ? List.unmodifiable(_points)
                                    : const [],
                                geometryParts: usingResolvedBoundary
                                    ? List.unmodifiable(
                                        widget.initialGeometryParts.isEmpty
                                            ? [List.unmodifiable(_points)]
                                            : widget.initialGeometryParts,
                                      )
                                    : [List.unmodifiable(_points)],
                              ),
                            );
                          }
                        : null,
                    child: const Text('Apply Boundary'),
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
