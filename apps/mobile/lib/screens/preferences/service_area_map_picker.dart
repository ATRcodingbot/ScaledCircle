import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class ServiceAreaMapSelection {
  const ServiceAreaMapSelection({required this.center, required this.geometry});
  final LatLng center;
  final List<LatLng> geometry;
}

class ServiceAreaMapPicker extends StatefulWidget {
  const ServiceAreaMapPicker({super.key, required this.drawArea});
  final bool drawArea;

  @override
  State<ServiceAreaMapPicker> createState() => _ServiceAreaMapPickerState();
}

class _ServiceAreaMapPickerState extends State<ServiceAreaMapPicker> {
  static const _maryland = LatLng(39.0458, -76.6413);
  final List<LatLng> _points = [];

  void _tap(TapPosition _, LatLng point) => setState(() {
    if (!widget.drawArea) _points.clear();
    if (_points.length < 100) _points.add(point);
  });

  @override
  Widget build(BuildContext context) {
    final ready = widget.drawArea ? _points.length >= 3 : _points.length == 1;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.drawArea ? 'Draw my area' : 'Choose the center'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              widget.drawArea
                  ? 'Tap around the area where you want to work. Use at least three points.'
                  : 'Tap the map near your business or preferred work area. This does not turn on GPS.',
            ),
          ),
          Expanded(
            child: FlutterMap(
              options: MapOptions(
                initialCenter: _maryland,
                initialZoom: 8,
                onTap: _tap,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.scaledcircle.app',
                ),
                if (_points.length >= 3)
                  PolygonLayer(
                    polygons: [
                      Polygon(
                        points: _points,
                        color: const Color(0x3319C7A2),
                        borderColor: const Color(0xFF19C7A2),
                        borderStrokeWidth: 3,
                      ),
                    ],
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
                                geometry: widget.drawArea
                                    ? List.unmodifiable(_points)
                                    : const [],
                              ),
                            );
                          }
                        : null,
                    child: const Text('Use This Area'),
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
