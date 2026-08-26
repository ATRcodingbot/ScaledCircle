import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'public_funnel_components.dart';

enum PublicProductMapMode { campaign, activeWork }

/// Public, non-customer demo output reproduced from SmartZonePlanningV2.
///
/// Input anchor: 39.2949221, -76.68799185; desired workload: 5 hours;
/// properties/hour: 45. The maintained planner produced plan
/// `smart-zone_542b54c1fb1388f0f13740d7`, validated 179,999.25 m² of
/// non-zero geometry, 225 estimated homes, and 300 estimated minutes.
/// It is deliberately presented as a conservative planning estimate—not a
/// verified walking route, parcel boundary, or AI neighborhood ranking.
const validatedSmartZoneDemo = <LatLng>[
  LatLng(39.2930165, -76.6904542),
  LatLng(39.2930165, -76.6855295),
  LatLng(39.2968277, -76.6855295),
  LatLng(39.2968277, -76.6904542),
];

const validatedSmartZoneDemoPosition = LatLng(39.2949221, -76.6879919);
const validatedSmartZoneDemoPlanId =
    'smart-zone_542b54c1fb1388f0f13740d7';
const validatedSmartZoneDemoEstimatedHomes = 225;
const validatedSmartZoneDemoEstimatedMinutes = 300;

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
/// campaign creation and active-job tracking. Campaign geometry is a validated
/// deterministic Smart Zone demo; no production customer data is rendered.
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

  @override
  Widget build(BuildContext context) {
    final activeWork = mode == PublicProductMapMode.activeWork;
    assert(
      !activeWork ||
          publicPointInsidePolygon(
            validatedSmartZoneDemoPosition,
            validatedSmartZoneDemo,
          ),
      'The public Scaler position fixture must remain inside its assigned Zone.',
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Semantics(
        image: true,
        label: activeWork
            ? 'Read-only product preview of an assigned Zone with GPS verification active and a current-position marker. No route is shown.'
            : 'Read-only Baltimore demo showing a selected area and the validated Smart Zone produced by the maintained planner. Route not yet verified.',
        child: SizedBox(
          height: height,
          width: double.infinity,
          child: Stack(
            children: [
              Positioned.fill(
                child: IgnorePointer(
                  child: FlutterMap(
                    options: MapOptions(
                      initialCenter: validatedSmartZoneDemoPosition,
                      initialZoom: 15.4,
                      initialCameraFit: CameraFit.bounds(
                        bounds: LatLngBounds.fromPoints(validatedSmartZoneDemo),
                        padding: const EdgeInsets.all(28),
                        maxZoom: 16,
                      ),
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
                              points: validatedSmartZoneDemo,
                              color: publicMuted.withValues(alpha: .04),
                              borderColor: const Color(0xFF526C81),
                              borderStrokeWidth: 6,
                            ),
                            Polygon(
                              points: validatedSmartZoneDemo,
                              color: businessGreen.withValues(alpha: .08),
                              borderColor: businessGreen,
                              borderStrokeWidth: 3.5,
                            ),
                          ],
                        ),
                      if (activeWork)
                        PolygonLayer(
                          polygons: [
                            Polygon(
                              points: validatedSmartZoneDemo,
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
                              point: validatedSmartZoneDemoPosition,
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
                      : 'Smart Zone A • Validated demo',
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
          'VALIDATED SMART ZONE • DEMO',
          style: TextStyle(
            color: businessGreen,
            fontSize: 10,
            fontWeight: FontWeight.w900,
          ),
        ),
        SizedBox(height: 6),
        Text(
          'Baltimore, Maryland • 225 estimated homes',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
        ),
        SizedBox(height: 5),
        Text(
          '5-hour conservative estimate  •  Route not yet verified  •  Advanced Edit available',
          style: TextStyle(color: publicMuted, fontSize: 11, height: 1.35),
        ),
      ],
    ),
  );
}
