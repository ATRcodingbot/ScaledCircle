import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_app/models/campaign/zone_display_identity.dart';
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

List<Offset> smartZoneMarkerOffsets(List<List<LatLng>> zones) {
  if (zones.isEmpty) return const [];
  final centroids = zones.map(_smartZoneCentroid).toList(growable: false);
  final allPoints = zones.expand((points) => points).toList(growable: false);
  final latitudes = allPoints.map((point) => point.latitude);
  final longitudes = allPoints.map((point) => point.longitude);
  final latitudeSpan = math.max(
    latitudes.reduce(math.max) - latitudes.reduce(math.min),
    0.00015,
  );
  final longitudeSpan = math.max(
    longitudes.reduce(math.max) - longitudes.reduce(math.min),
    0.00015,
  );
  final parents = List<int>.generate(zones.length, (index) => index);

  int root(int index) {
    while (parents[index] != index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }

  void join(int first, int second) {
    final firstRoot = root(first);
    final secondRoot = root(second);
    if (firstRoot != secondRoot) parents[secondRoot] = firstRoot;
  }

  for (var first = 0; first < centroids.length; first++) {
    for (var second = first + 1; second < centroids.length; second++) {
      final latitudeDistance =
          (centroids[first].latitude - centroids[second].latitude) /
          latitudeSpan;
      final longitudeDistance =
          (centroids[first].longitude - centroids[second].longitude) /
          longitudeSpan;
      if (math.sqrt(
            latitudeDistance * latitudeDistance +
                longitudeDistance * longitudeDistance,
          ) <
          0.14) {
        join(first, second);
      }
    }
  }

  final clusters = <int, List<int>>{};
  for (var index = 0; index < zones.length; index++) {
    clusters.putIfAbsent(root(index), () => []).add(index);
  }
  final offsets = List<Offset>.filled(zones.length, Offset.zero);
  for (final cluster in clusters.values) {
    if (cluster.length < 2) continue;
    final radius = cluster.length <= 4 ? 28.0 : 38.0;
    for (var position = 0; position < cluster.length; position++) {
      final angle = -math.pi / 2 + (2 * math.pi * position / cluster.length);
      offsets[cluster[position]] = Offset(
        math.cos(angle) * radius,
        math.sin(angle) * radius,
      );
    }
  }
  return offsets;
}

LatLng _smartZoneCentroid(List<LatLng> points) {
  final latitude =
      points.fold<double>(0, (sum, point) => sum + point.latitude) /
      points.length;
  final longitude =
      points.fold<double>(0, (sum, point) => sum + point.longitude) /
      points.length;
  return LatLng(latitude, longitude);
}

class SmartZoneGeometryMap extends StatefulWidget {
  const SmartZoneGeometryMap({
    required this.zones,
    this.selectedTerritory = const [],
    this.selectedZoneIndex,
    this.onZoneSelected,
    this.interactive = true,
    this.height,
    this.mapKey,
    this.showZoneSelector = false,
    super.key,
  });

  final List<Map<String, dynamic>> zones;
  final List<LatLng> selectedTerritory;
  final int? selectedZoneIndex;
  final ValueChanged<int>? onZoneSelected;
  final bool interactive;
  final double? height;
  final Key? mapKey;
  final bool showZoneSelector;

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
    final identities = resolveZoneDisplayIdentities(widget.zones);
    final validZones =
        <({int index, List<LatLng> points, ZoneDisplayIdentity identity})>[
          for (var index = 0; index < zonePoints.length; index++)
            if (zonePoints[index].length >= 3)
              (
                index: index,
                points: zonePoints[index],
                identity: identities[index],
              ),
        ]..sort(
          (first, second) =>
              first.identity.ordinal.compareTo(second.identity.ordinal),
        );
    final operationalPoints = <LatLng>[
      for (final zone in validZones) ...zone.points,
    ];
    if (validZones.isEmpty || operationalPoints.length < 3) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(18),
          child: Text('Smart Zone map unavailable.'),
        ),
      );
    }
    final labels = smartZoneLabelStrategy(validZones.length);
    final selected = _selection;
    final markerOffsets = smartZoneMarkerOffsets(
      validZones.map((zone) => zone.points).toList(growable: false),
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final mapHeight =
            widget.height ?? (constraints.maxWidth < 520 ? 300.0 : 360.0);
        final cameraPadding = (math.min(constraints.maxWidth, mapHeight) * 0.12)
            .clamp(24.0, 64.0);
        return Semantics(
          label:
              'Campaign territory with ${validZones.length} authoritative worker Zones. '
              'Labels use $labels.',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  key:
                      widget.mapKey ??
                      const Key('smart-zone-authoritative-map'),
                  height: mapHeight,
                  child: Stack(
                    children: [
                      FlutterMap(
                        options: MapOptions(
                          initialCenter: operationalPoints.first,
                          initialZoom: 14,
                          initialCameraFit: CameraFit.bounds(
                            bounds: LatLngBounds.fromPoints(operationalPoints),
                            padding: EdgeInsets.all(cameraPadding),
                            maxZoom: validZones.length == 1
                                ? 17
                                : validZones.length <= 5
                                ? 16.5
                                : 15.5,
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
                                  pattern: StrokePattern.dashed(
                                    segments: [8, 6],
                                  ),
                                ),
                              ],
                            ),
                          PolygonLayer(
                            polygons: validZones
                                .map((zone) {
                                  final color = smartZoneColor(
                                    zone.identity.styleKey - 1,
                                  );
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
                                .asMap()
                                .entries
                                .map((entry) {
                                  final markerPosition = entry.key;
                                  final zone = entry.value;
                                  final point = _smartZoneCentroid(zone.points);
                                  final color = smartZoneColor(
                                    zone.identity.styleKey - 1,
                                  );
                                  final offset = markerOffsets[markerPosition];
                                  final active = selected == zone.index;
                                  return Marker(
                                    point: point,
                                    width: 112,
                                    height: 112,
                                    child: Semantics(
                                      button: true,
                                      label: 'Select ${zone.identity.label}',
                                      child: Stack(
                                        alignment: Alignment.center,
                                        children: [
                                          if (offset != Offset.zero)
                                            CustomPaint(
                                              size: const Size(112, 112),
                                              painter: _MarkerConnectorPainter(
                                                offset,
                                                color,
                                              ),
                                            ),
                                          Transform.translate(
                                            offset: offset,
                                            child: GestureDetector(
                                              key: Key(
                                                'smart-zone-marker-${zone.index}',
                                              ),
                                              onTap: () => _select(zone.index),
                                              child: AnimatedContainer(
                                                duration: const Duration(
                                                  milliseconds: 160,
                                                ),
                                                width: active ? 42 : 34,
                                                height: active ? 42 : 34,
                                                alignment: Alignment.center,
                                                decoration: BoxDecoration(
                                                  color: color,
                                                  shape: BoxShape.circle,
                                                  border: Border.all(
                                                    color: Colors.white,
                                                    width: active ? 4 : 3,
                                                  ),
                                                  boxShadow: const [
                                                    BoxShadow(
                                                      color: Colors.black38,
                                                      blurRadius: 5,
                                                    ),
                                                  ],
                                                ),
                                                child: Text(
                                                  '${zone.identity.ordinal}',
                                                  style: const TextStyle(
                                                    color: Colors.white,
                                                    fontWeight: FontWeight.w800,
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                })
                                .toList(growable: false),
                          ),
                          const RichAttributionWidget(
                            attributions: [
                              TextSourceAttribution(
                                '© OpenStreetMap contributors',
                              ),
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
                if (widget.showZoneSelector)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 10, 10, 2),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      alignment: WrapAlignment.center,
                      children: validZones
                          .map((zone) {
                            final active = selected == zone.index;
                            return ChoiceChip(
                              key: Key('smart-zone-card-${zone.index}'),
                              selected: active,
                              onSelected: (_) => _select(zone.index),
                              avatar: CircleAvatar(
                                backgroundColor: smartZoneColor(
                                  zone.identity.styleKey - 1,
                                ),
                                foregroundColor: Colors.white,
                                child: Text('${zone.identity.ordinal}'),
                              ),
                              label: Text(zone.identity.label),
                            );
                          })
                          .toList(growable: false),
                    ),
                  ),
              ],
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
}

class _MarkerConnectorPainter extends CustomPainter {
  const _MarkerConnectorPainter(this.offset, this.color);

  final Offset offset;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    canvas.drawLine(
      center,
      center + offset,
      Paint()
        ..color = color.withValues(alpha: 0.9)
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(_MarkerConnectorPainter oldDelegate) =>
      oldDelegate.offset != offset || oldDelegate.color != color;
}
