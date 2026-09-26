import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';
import 'package:flutter_app/widgets/smart_zone_geometry_map.dart';
import 'package:flutter_app/widgets/smart_zone_recommendation_evidence.dart';
import 'campaign_mapping_interaction_test.dart' as fixtures;

void main() {
  Map<String, dynamic> workspace({bool allowed = true}) => {
    'actorUid': 'actor',
    'businessId': 'owner',
    'capabilities': {'intelligentAreaRecommendation': allowed},
  };
  test(
    'recommendation requires current actor, campaign workspace and server capability',
    () {
      bool allowed(
        Map<String, dynamic>? value, {
        String? actor = 'actor',
        String owner = 'owner',
      }) => intelligentAreaRecommendationAllowed(
        value,
        actorUid: actor,
        campaignBusinessId: owner,
      );
      expect(allowed(workspace()), true);
      expect(allowed(workspace(allowed: false)), false);
      expect(allowed(workspace(), actor: null), false);
      expect(allowed(workspace(), actor: 'previous-user'), false);
      expect(allowed(workspace(), owner: 'another-business'), false);
      expect(
        allowed({'actorUid': 'actor', 'businessId': 'owner', 'plan': 'Scale'}),
        false,
      );
      expect(allowed(null), false);
    },
  );

  for (final plan in ['Starter', 'Growth']) {
    testWidgets(
      '$plan manual search/draw stays usable without recommendation calls',
      (tester) async {
        var calls = 0;
        var manual = 0;
        await fixtures.surface(
          tester,
          Scaffold(
            body: SingleChildScrollView(
              child: CampaignZoneAreaEntry(
                locked: false,
                hasSavedArea: false,
                savedAreaName: '',
                initialSelection: fixtures.glenBurnie,
                recommendationEnabled: false,
                onPlan: (_, _, _) async {
                  calls++;
                },
                onAdvancedEdit: (area) {
                  expect(area, fixtures.glenBurnie);
                  manual++;
                },
              ),
            ),
          ),
        );
        expect(find.text('Recommend an Area'), findsNothing);
        expect(find.text('Requested field workload (hours)'), findsNothing);
        expect(
          find.text(
            'Intelligent area recommendations are included with Scale.',
          ),
          findsOneWidget,
        );
        expect(
          tester
              .widget<TextFormField>(find.byType(TextFormField).first)
              .enabled,
          true,
        );
        await fixtures.choose(tester, 'Draw My Area');
        expect(manual, 1);
        expect(calls, 0);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'Scale explicit goal and workload are passed with the selected location',
    (tester) async {
      String? goal;
      double? hours;
      await fixtures.surface(
        tester,
        Scaffold(
          body: SingleChildScrollView(
            child: CampaignZoneAreaEntry(
              locked: false,
              hasSavedArea: false,
              savedAreaName: '',
              initialSelection: fixtures.glenBurnie,
              recommendationEnabled: true,
              onPlan: (area, value, objective) async {
                expect(area, fixtures.glenBurnie);
                hours = value;
                goal = objective;
              },
              onAdvancedEdit: (_) {},
            ),
          ),
        ),
      );
      await tester.enterText(
        find.widgetWithText(
          TextFormField,
          'Desired customers or campaign goal',
        ),
        'Residential deck outreach',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Requested field workload (hours)'),
        '5',
      );
      await fixtures.choose(tester, 'Recommend an Area');
      expect(goal, 'Residential deck outreach');
      expect(hours, 5);
      await tester.pumpWidget(const SizedBox());
    },
  );

  test('cached alternate preserves explicit inputs and request identity', () {
    final request = smartZoneRecommendationRequest(
      campaignId: 'campaign',
      selectedArea: fixtures.glenBurnie,
      objective: 'Residential deck outreach',
      desiredHours: 5,
      recommendationRunId: 'same-evidence',
      alternativeIndex: 1,
    );
    expect(request['recommendationRunId'], 'same-evidence');
    expect(request['alternativeIndex'], 1);
    expect(request['objective'], 'Residential deck outreach');
    expect(request['desiredHours'], 5);
    expect(
      (request['areaSelection'] as Map)['query'],
      fixtures.glenBurnie.fullAddress,
    );
  });

  testWidgets(
    'adjusted boundary preserves non-default goal/workload without stale search cache',
    (tester) async {
      Map<String, dynamic>? request;
      const hours = 7.5;
      const goal = 'Commercial landscaping prospects';
      await fixtures.surface(
        tester,
        fixtures.draft(
          fixtures.DraftReference(),
          initialArea: const [
            {'latitude': 39.15, 'longitude': -76.63},
            {'latitude': 39.16, 'longitude': -76.63},
            {'latitude': 39.16, 'longitude': -76.62},
          ],
          recommend: (_, boundary) async {
            request = smartZoneRecommendationRequest(
              campaignId: 'draft',
              desiredHours: hours,
              objective: goal,
              analysisBoundary: boundary,
            );
            return null;
          },
        ),
      );
      await fixtures.choose(tester, 'Recommend within this area');
      expect(request?['desiredHours'], hours);
      expect(request?['objective'], goal);
      expect(request?['analysisBoundary'], [
        {'lat': 39.15, 'lng': -76.63},
        {'lat': 39.16, 'lng': -76.63},
        {'lat': 39.16, 'lng': -76.62},
      ]);
      expect(request?.containsKey('recommendationRunId'), false);
      expect(request?.containsKey('areaSelection'), false);
      await tester.pumpWidget(const SizedBox());
    },
  );

  for (final preview in [true, false]) {
    testWidgets(
      'map preview=$preview preserves full search outline with appropriate initial fit',
      (tester) async {
        const search = [
          LatLng(39.10, -76.70),
          LatLng(39.20, -76.70),
          LatLng(39.20, -76.50),
          LatLng(39.10, -76.50),
        ];
        await fixtures.surface(
          tester,
          Scaffold(
            body: SmartZoneGeometryMap(
              planningPreview: preview,
              tileProvider: fixtures.MapTiles(),
              selectedTerritory: search,
              zones: const [
                {
                  'geometry': [
                    {'lat': 39.15, 'lng': -76.63},
                    {'lat': 39.151, 'lng': -76.63},
                    {'lat': 39.151, 'lng': -76.629},
                  ],
                },
              ],
            ),
          ),
        );
        final camera = MapCamera.of(
          tester.element(find.byKey(const Key('mapped-target-evidence'))),
        );
        expect(camera.visibleBounds.contains(search.first), !preview);
        final polygonLayers = tester.widgetList<PolygonLayer>(
          find.byType(PolygonLayer),
        );
        expect(polygonLayers.first.polygons.single.points, search);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  Map<String, dynamic> plan({bool valid = true}) => {
    'recommendationStatus': valid
        ? 'review_required'
        : 'manual_review_required',
    'zones': valid
        ? [
            {'mappedRouteMeters': 739},
          ]
        : [],
    'targetEvidence': {
      'measure': 'mapped_target_features',
      'eligibleMappedFeatureCount': valid ? 19 : 0,
      'sourceSnapshots': [
        {
          'name': 'OpenStreetMap',
          'dataTimestamp': '2026-09-26T18:45:17Z',
          'fetchedAt': '2026-09-26T18:46:46Z',
        },
        {
          'name': 'OpenStreetMap',
          'dataTimestamp': '2026-09-26T18:45:17Z',
          'fetchedAt': '2026-09-26T18:46:46Z',
        },
      ],
    },
    'recommendationContext': {
      'goal': 'Residential deck outreach',
      'locationLabel': 'Glen Burnie / 21061',
      'requestedHours': 5,
      'supportedMinutes': valid ? 44 : null,
      'why': ['Connected local streets'],
      'signals': [
        {
          'label': 'Mapped building type',
          'value': 'Residential',
          'source': 'OpenStreetMap',
        },
      ],
      'limitations': ['Public mapping does not establish buying intent.'],
    },
  };

  testWidgets(
    'presentation shows supported workload and actual evidence, not requested-hours inventory',
    (tester) async {
      await fixtures.surface(
        tester,
        Scaffold(
          body: SingleChildScrollView(
            child: SmartZoneRecommendationEvidence(plan: plan()),
          ),
        ),
      );
      expect(find.text('Goal: Residential deck outreach'), findsOneWidget);
      expect(find.text('Location: Glen Burnie / 21061'), findsOneWidget);
      expect(
        find.text('Estimated field workload: 44m (advisory)'),
        findsOneWidget,
      );
      expect(find.text('19 mapped target features'), findsOneWidget);
      expect(find.text('~739 m supporting street network'), findsOneWidget);
      expect(find.textContaining('supports less than'), findsOneWidget);
      expect(
        find.textContaining('Mapped building type: Residential'),
        findsOneWidget,
      );
      await fixtures.choose(tester, 'Source and retrieval dates');
      await tester.pump(const Duration(milliseconds: 300));
      expect(
        find.textContaining('Source date: 2026-09-26T18:45:17Z'),
        findsOneWidget,
      );
      expect(find.textContaining('Not recorded'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'failed intelligence offers manual path and never displays zero as measured targets',
    (tester) async {
      await fixtures.surface(
        tester,
        Scaffold(
          body: SmartZoneRecommendationEvidence(plan: plan(valid: false)),
        ),
      );
      expect(
        find.textContaining("We couldn't find enough reliable data"),
        findsOneWidget,
      );
      expect(find.text('0 mapped target features'), findsNothing);
      expect(find.textContaining('Estimated field workload:'), findsNothing);
      expect(smartZonePlanCanApply(plan(valid: false)), false);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'planning map renders target and street evidence distinctly, without execution route',
    (tester) async {
      await fixtures.surface(
        tester,
        Scaffold(
          body: SmartZoneGeometryMap(
            planningPreview: true,
            tileProvider: fixtures.MapTiles(),
            zones: const [
              {
                'geometry': [
                  {'lat': 39.15, 'lng': -76.63},
                  {'lat': 39.16, 'lng': -76.63},
                  {'lat': 39.16, 'lng': -76.62},
                ],
                'planningTargets': {
                  'features': [
                    {'latitude': 39.155, 'longitude': -76.627},
                  ],
                },
                'planningNetwork': {
                  'isExecutionRoute': false,
                  'segments': [
                    {
                      'from': {'lat': 39.151, 'lng': -76.629},
                      'to': {'lat': 39.155, 'lng': -76.626},
                    },
                  ],
                },
                'executionRoute': {
                  'centerline': [
                    {'lat': 0, 'lng': 0},
                    {'lat': 1, 'lng': 1},
                  ],
                },
              },
            ],
          ),
        ),
      );
      final streets = tester.widget<PolylineLayer>(
        find.byKey(const Key('planning-street-evidence')),
      );
      expect(streets.polylines.length, 1);
      expect(streets.polylines.single.points.first.latitude, 39.151);
      expect(find.byType(PolylineLayer), findsOneWidget);
      final targets = tester.widget<MarkerLayer>(
        find.byKey(const Key('mapped-target-evidence')),
      );
      expect(targets.markers.single.point.latitude, 39.155);
      expect(
        find.textContaining('Execution route: not approved.'),
        findsOneWidget,
      );
      expect(find.textContaining('Scaler Zones'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
