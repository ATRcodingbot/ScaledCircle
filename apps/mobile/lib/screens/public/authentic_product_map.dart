import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'public_funnel_components.dart';

enum PublicProductMapMode { campaign, activeWork }

const scalerResidentialZoneFixture = <LatLng>[
  LatLng(39.3810, -76.5460),
  LatLng(39.3810, -76.5350),
  LatLng(39.3740, -76.5320),
  LatLng(39.3700, -76.5390),
  LatLng(39.3740, -76.5480),
];

const scalerResidentialPositionFixture = LatLng(39.3760, -76.5400);

bool publicPointInsidePolygon(LatLng point, List<LatLng> polygon) {
  var inside = false;
  for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    final a = polygon[i];
    final b = polygon[j];
    final crossesLatitude =
        (a.latitude > point.latitude) != (b.latitude > point.latitude);
    if (!crossesLatitude) continue;
    final crossingLongitude =
        (b.longitude - a.longitude) *
            (point.latitude - a.latitude) /
            (b.latitude - a.latitude) +
        a.longitude;
    if (point.longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

/// A read-only public preview built from the same FlutterMap layers used by
/// campaign creation and active-job tracking. Coordinates are deterministic
/// demo fixtures; no production customer data is rendered.
class AuthenticProductMap extends StatelessWidget {
  const AuthenticProductMap({
    super.key,
    required this.mode,
    this.height = 260,
    this.showOpportunityCard = false,
  });

  final PublicProductMapMode mode;
  final double height;
  final bool showOpportunityCard;

  static const _serviceArea = <LatLng>[
    LatLng(39.115, -76.615),
    LatLng(39.115, -76.505),
    LatLng(39.020, -76.490),
    LatLng(38.985, -76.565),
    LatLng(39.035, -76.640),
  ];
  static const _campaignTarget = <LatLng>[
    LatLng(39.085, -76.585),
    LatLng(39.086, -76.535),
    LatLng(39.047, -76.525),
    LatLng(39.035, -76.565),
    LatLng(39.058, -76.598),
  ];
  static const _zone = <LatLng>[
    LatLng(39.077, -76.578),
    LatLng(39.078, -76.548),
    LatLng(39.055, -76.540),
    LatLng(39.046, -76.562),
    LatLng(39.059, -76.582),
  ];
  @override
  Widget build(BuildContext context) {
    final activeWork = mode == PublicProductMapMode.activeWork;
    assert(
      !activeWork ||
          publicPointInsidePolygon(
            scalerResidentialPositionFixture,
            scalerResidentialZoneFixture,
          ),
      'The public Scaler position fixture must remain inside its assigned Zone.',
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Semantics(
        image: true,
        label: activeWork
            ? 'Read-only product preview of an assigned Zone with GPS verification active and a current-position marker. No route is shown.'
            : 'Read-only product preview using the campaign map with Service Area, Campaign Target, and mapped Zone overlays.',
        child: SizedBox(
          height: height,
          width: double.infinity,
          child: Stack(
            children: [
              Positioned.fill(
                child: IgnorePointer(
                  child: FlutterMap(
                    options: MapOptions(
                      initialCenter: activeWork
                          ? scalerResidentialPositionFixture
                          : const LatLng(39.055, -76.560),
                      initialZoom: activeWork ? 15.4 : 12.3,
                      initialCameraFit: activeWork
                          ? CameraFit.bounds(
                              bounds: LatLngBounds.fromPoints(
                                scalerResidentialZoneFixture,
                              ),
                              padding: const EdgeInsets.all(28),
                              maxZoom: 16,
                            )
                          : null,
                      interactionOptions: const InteractionOptions(
                        flags: InteractiveFlag.none,
                      ),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName: 'com.scaledcircle.app',
                      ),
                      if (!activeWork)
                        PolygonLayer(
                          polygons: [
                            Polygon(
                              points: _serviceArea,
                              color: publicMuted.withValues(alpha: .05),
                              borderColor: const Color(0xFF526C81),
                              borderStrokeWidth: 2,
                            ),
                            Polygon(
                              points: _campaignTarget,
                              color: businessGreen.withValues(alpha: .18),
                              borderColor: businessGreen,
                              borderStrokeWidth: 3,
                            ),
                            Polygon(
                              points: _zone,
                              color: scalerBlue.withValues(alpha: .25),
                              borderColor: scalerBlue,
                              borderStrokeWidth: 3,
                            ),
                          ],
                        ),
                      if (activeWork)
                        PolygonLayer(
                          polygons: [
                            Polygon(
                              points: scalerResidentialZoneFixture,
                              color: scalerBlue.withValues(alpha: .18),
                              borderColor: scalerBlue,
                              borderStrokeWidth: 4,
                            ),
                          ],
                        ),
                      if (activeWork)
                        const MarkerLayer(
                          markers: [
                            Marker(
                              point: scalerResidentialPositionFixture,
                              width: 46,
                              height: 46,
                              child: _CurrentPositionMarker(),
                            ),
                          ],
                        ),
                      const RichAttributionWidget(
                        attributions: [
                          TextSourceAttribution('© OpenStreetMap contributors'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 12,
                top: 12,
                child: _MapStateBadge(
                  text: activeWork
                      ? 'GPS verification • Active'
                      : 'Zone 1 • Mapped',
                  color: activeWork ? businessGreen : scalerBlue,
                ),
              ),
              Positioned(
                left: 8,
                bottom: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: .9),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    '© OpenStreetMap contributors',
                    style: TextStyle(
                      color: Color(0xFF243442),
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              if (showOpportunityCard)
                const Positioned(
                  left: 14,
                  right: 14,
                  bottom: 30,
                  child: _OpportunityCard(),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentPositionMarker extends StatelessWidget {
  const _CurrentPositionMarker();

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: scalerBlue.withValues(alpha: .2),
      shape: BoxShape.circle,
    ),
    alignment: Alignment.center,
    child: Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: scalerBlue,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
      ),
    ),
  );
}

class _MapStateBadge extends StatelessWidget {
  const _MapStateBadge({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: publicBackground.withValues(alpha: .92),
      borderRadius: BorderRadius.circular(9),
      border: Border.all(color: color.withValues(alpha: .7)),
    ),
    child: Text(
      text,
      style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900),
    ),
  );
}

class _OpportunityCard extends StatelessWidget {
  const _OpportunityCard();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: publicBackground.withValues(alpha: .94),
      borderRadius: BorderRadius.circular(13),
      border: Border.all(color: businessGreen.withValues(alpha: .55)),
      boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 16)],
    ),
    child: const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'CAMPAIGN OPPORTUNITY • EXAMPLE',
          style: TextStyle(
            color: businessGreen,
            fontSize: 10,
            fontWeight: FontWeight.w900,
          ),
        ),
        SizedBox(height: 6),
        Text(
          'Main Service Area • 500 flyers',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
        ),
        SizedBox(height: 5),
        Text(
          'Campaign Target selected  •  Zone 1 mapped  •  Route not yet verified',
          style: TextStyle(color: publicMuted, fontSize: 11, height: 1.35),
        ),
      ],
    ),
  );
}
