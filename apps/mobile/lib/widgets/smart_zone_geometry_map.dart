import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

const _zoneColors = <Color>[
  Color(0xFF0878D1),
  Color(0xFF00A878),
  Color(0xFFF28C28),
  Color(0xFF7B61C9),
  Color(0xFFD1495B),
  Color(0xFF008C95),
];

List<LatLng> smartZonePoints(dynamic value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((point) {
        final latitude = point['latitude'] ?? point['lat'];
        final longitude = point['longitude'] ?? point['lng'];
        if (latitude is! num || longitude is! num) return null;
        return LatLng(latitude.toDouble(), longitude.toDouble());
      })
      .whereType<LatLng>()
      .toList(growable: false);
}

Color smartZoneColor(int index) => _zoneColors[index % _zoneColors.length];

String smartZoneLabelStrategy(int count) => count <= 10
    ? 'numbered_polygon_labels'
    : 'numbered_centroid_markers_and_selectable_list';

class SmartZoneGeometryMap extends StatefulWidget {
  const SmartZoneGeometryMap({
    required this.zones,
    this.selectedTerritory = const [],
    this.selectedZoneIndex,
    this.onZoneSelected,
    this.interactive = true,
    this.height,
    this.mapKey,
    super.key,
  });

  final List<Map<String, dynamic>> zones;
  final List<LatLng> selectedTerritory;
  final int? selectedZoneIndex;
  final ValueChanged<int>? onZoneSelected;
  final bool interactive;
  final double? height;
  final Key? mapKey;

  @override
  State<SmartZoneGeometryMap> createState() => _SmartZoneGeometryMapState();
}

class _SmartZoneGeometryMapState extends State<SmartZoneGeometryMap> {
  int? _internalSelection;

  int? get _selection => widget.selectedZoneIndex ?? _internalSelection;

  @override
  Widget build(BuildContext context) {
    final zonePoints = widget.zones
        .map((zone) => smartZonePoints(zone['geometry'] ?? zone['serviceArea']))
        .toList(growable: false);
    final validZones = <({int index, List<LatLng> points})>[
      for (var index = 0; index < zonePoints.length; index++)
        if (zonePoints[index].length >= 3)
          (index: index, points: zonePoints[index]),
    ];
    final allPoints = <LatLng>[
      ...widget.selectedTerritory,
      for (final zone in validZones) ...zone.points,
    ];
    if (validZones.isEmpty || allPoints.length < 3) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(18),
          child: Text('Smart Zone map unavailable.'),
        ),
      );
    }
    final labels = smartZoneLabelStrategy(validZones.length);
    final selected = _selection;
    return LayoutBuilder(
      builder: (context, constraints) {
        final mapHeight =
            widget.height ?? (constraints.maxWidth < 520 ? 300.0 : 360.0);
        return Semantics(
          label:
              'Campaign territory with ${validZones.length} authoritative worker Zones. '
              'Labels use $labels.',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              key: widget.mapKey ?? const Key('smart-zone-authoritative-map'),
              height: mapHeight,
              child: Stack(
                children: [
                  FlutterMap(
                    options: MapOptions(
                      initialCenter: allPoints.first,
                      initialZoom: 14,
                      initialCameraFit: CameraFit.bounds(
                        bounds: LatLngBounds.fromPoints(allPoints),
                        padding: const EdgeInsets.all(28),
                        maxZoom: 16,
                      ),
                      interactionOptions: InteractionOptions(
                        flags: widget.interactive
                            ? InteractiveFlag.all
                            : InteractiveFlag.none,
                      ),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.scaledcircle.app',
                      ),
                      if (widget.selectedTerritory.length >= 3)
                        PolygonLayer(
                          polygons: [
                            Polygon(
                              points: widget.selectedTerritory,
                              color: const Color(
                                0xFF28485F,
                              ).withValues(alpha: 0.035),
                              borderColor: const Color(0xFF526C81),
                              borderStrokeWidth: 2,
                              pattern: StrokePattern.dashed(segments: [8, 6]),
                            ),
                          ],
                        ),
                      PolygonLayer(
                        polygons: validZones
                            .map((zone) {
                              final color = smartZoneColor(zone.index);
                              final active = selected == zone.index;
                              return Polygon(
                                points: zone.points,
                                color: color.withValues(
                                  alpha: active ? 0.30 : 0.16,
                                ),
                                borderColor: color,
                                borderStrokeWidth: active ? 5 : 3,
                              );
                            })
                            .toList(growable: false),
                      ),
                      MarkerLayer(
                        markers: validZones
                            .map((zone) {
                              final point = _centroid(zone.points);
                              final color = smartZoneColor(zone.index);
                              return Marker(
                                point: point,
                                width: 52,
                                height: 52,
                                child: Semantics(
                                  button: true,
                                  label: 'Select Zone ${zone.index + 1}',
                                  child: GestureDetector(
                                    key: Key('smart-zone-marker-${zone.index}'),
                                    onTap: () => _select(zone.index),
                                    child: Container(
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: color,
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: Colors.white,
                                          width: 3,
                                        ),
                                        boxShadow: const [
                                          BoxShadow(
                                            color: Colors.black38,
                                            blurRadius: 5,
                                          ),
                                        ],
                                      ),
                                      child: Text(
                                        '${zone.index + 1}',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            })
                            .toList(growable: false),
                      ),
                      const RichAttributionWidget(
                        attributions: [
                          TextSourceAttribution('© OpenStreetMap contributors'),
                        ],
                      ),
                    ],
                  ),
                  Positioned(
                    left: 10,
                    bottom: 10,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Theme.of(
                            context,
                          ).colorScheme.surface.withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: const [
                            BoxShadow(color: Colors.black26, blurRadius: 4),
                          ],
                        ),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 7,
                          ),
                          child: Text(
                            'Dashed: selected territory  •  Colored: Scaler Zones',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _select(int index) {
    if (widget.selectedZoneIndex == null) {
      setState(() => _internalSelection = index);
    }
    widget.onZoneSelected?.call(index);
  }

  LatLng _centroid(List<LatLng> points) {
    final latitude =
        points.fold<double>(0, (sum, point) => sum + point.latitude) /
        points.length;
    final longitude =
        points.fold<double>(0, (sum, point) => sum + point.longitude) /
        points.length;
    return LatLng(latitude, longitude);
  }
}
