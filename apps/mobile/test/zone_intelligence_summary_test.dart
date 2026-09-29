import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign_area_geometry.dart';
import 'package:flutter_app/widgets/zone_intelligence_summary.dart';
import 'package:flutter_app/widgets/smart_zone_recommendation_evidence.dart';

final area = [
  {'latitude': 39.0, 'longitude': -76.0},
  {'latitude': 39.001, 'longitude': -76.0},
  {'latitude': 39.001, 'longitude': -76.001},
];
final other = [
  {'latitude': 39.01, 'longitude': -76.0},
  {'latitude': 39.011, 'longitude': -76.0},
  {'latitude': 39.011, 'longitude': -76.001},
];
Map<String, dynamic> evidence({
  dynamic geometry,
  int count = 11,
  String mode = 'manual',
}) => {
  'version': 'ZoneIntelligenceV1',
  'geometryDigest': CampaignAreaGeometry.savedDigest(geometry ?? area),
  'mode': mode,
  'targetIntent': 'residential',
  'mappedTargetCount': count,
  'supportingStreetMeters': 620,
  'propertyMix': {
    'classifiedCount': 7,
    'unknownCount': 4,
    'categories': [
      {'label': 'Detached', 'count': 7},
    ],
  },
  'regionalContext': {
    'signals': [
      {'label': 'Predominant construction era', 'value': '1940–1959'},
    ],
  },
  'workload': {'minutes': 32, 'oneScaler': true},
  'executionRouteVerified': false,
  'source': {
    'name': 'OpenStreetMap',
    'dataTimestamp': '2026-09-25',
    'fetchedAt': '2026-09-26',
    'freshness': 'fresh',
  },
};
Widget page(Widget child, {double scale = 1}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(textScaler: TextScaler.linear(scale)),
    child: Scaffold(body: SingleChildScrollView(child: child)),
  ),
);
void main() {
  test(
    'all retained production Area/alternate cards match the exact server/map digest',
    () {
      final report =
          jsonDecode(
                File(
                  '../../docs/zone-intelligence-21061-examples-20260926.json',
                ).readAsStringSync(),
              )
              as Map;
      var count = 0;
      for (final option in report['options'] as List) {
        for (final area in option['areas'] as List) {
          expect(
            zoneEvidenceMatches(
              area['zoneIntelligence'] as Map,
              area['geometry'],
            ),
            true,
          );
          count++;
        }
      }
      expect(count, 9);
    },
  );
  testWidgets(
    'manual preview shows measured targets, mix, region context, street and advisory time before save',
    (t) async {
      await t.pumpWidget(
        page(ZoneIntelligenceSummary(data: evidence(), geometry: area)),
      );
      expect(find.text('What we found in this area'), findsOneWidget);
      expect(find.text('11 mapped residential targets'), findsOneWidget);
      expect(find.text('7 detached homes'), findsOneWidget);
      expect(find.textContaining('4 unspecified'), findsOneWidget);
      expect(find.textContaining('Regional property context'), findsOneWidget);
      expect(find.textContaining('620 m supporting streets'), findsOneWidget);
      expect(find.text('~32 min'), findsOneWidget);
      expect(find.text('One-Scaler planning estimate'), findsOneWidget);
      expect(find.text('Execution route not yet verified'), findsOneWidget);
      expect(find.text('View property evidence'), findsOneWidget);
    },
  );
  testWidgets(
    'missing details are unknown and B2B excludes residential context',
    (t) async {
      final data = evidence()
        ..['targetIntent'] = 'business'
        ..['propertyMix'] = null
        ..['workload'] = null;
      await t.pumpWidget(
        page(ZoneIntelligenceSummary(data: data, geometry: area)),
      );
      expect(find.text('11 mapped business targets'), findsOneWidget);
      expect(find.text('Property type unavailable'), findsOneWidget);
      expect(find.textContaining('1940'), findsNothing);
      expect(find.text('Not established'), findsOneWidget);
    },
  );
  testWidgets(
    'source and assumptions stay collapsible without route overclaim',
    (t) async {
      await t.pumpWidget(
        page(ZoneIntelligenceSummary(data: evidence(), geometry: area)),
      );
      expect(find.textContaining('Source snapshot:'), findsNothing);
      await t.tap(find.text('View property evidence'));
      await t.pumpAndSettle();
      expect(find.textContaining('45 mapped targets/hour'), findsOneWidget);
      expect(find.textContaining('No conversation duration'), findsOneWidget);
      expect(
        find.textContaining('Source snapshot: 2026-09-25'),
        findsOneWidget,
      );
      expect(find.textContaining('not verified households'), findsOneWidget);
    },
  );
  testWidgets(
    'area switching binds panel values and digest to selected map Zone',
    (t) async {
      final plan = <String, dynamic>{
        'recommendationStatus': 'review_required',
        'targetEvidence': {'measure': 'mapped_target_features'},
        'recommendationContext': {'supportedMinutes': 64, 'requestedHours': 5},
        'zones': [
          {'geometry': area, 'zoneIntelligence': evidence(mode: 'recommended')},
          {
            'geometry': other,
            'zoneIntelligence': evidence(
              geometry: other,
              count: 18,
              mode: 'recommended',
            ),
          },
        ],
      };
      await t.pumpWidget(page(SmartZoneRecommendationEvidence(plan: plan)));
      expect(find.text('11 mapped residential targets'), findsOneWidget);
      expect(
        find.text('Why Scaled Circle recommends this area'),
        findsOneWidget,
      );
      await t.pumpWidget(
        page(SmartZoneRecommendationEvidence(plan: plan, selectedZoneIndex: 1)),
      );
      expect(find.text('11 mapped residential targets'), findsNothing);
      expect(find.text('18 mapped residential targets'), findsOneWidget);
      expect(find.text('Zone 2'), findsOneWidget);
    },
  );
  testWidgets('stale geometry does not display old observations', (t) async {
    await t.pumpWidget(
      page(ZoneIntelligenceSummary(data: evidence(), geometry: other)),
    );
    expect(find.textContaining('Area changed'), findsOneWidget);
    expect(find.textContaining('mapped residential targets'), findsNothing);
  });
  testWidgets(
    'pre-save load has no Zone id and ignores late response for old geometry',
    (t) async {
      final old = Completer<Map<String, dynamic>>(),
          fresh = Completer<Map<String, dynamic>>();
      final inputs = <Map<String, dynamic>>[];
      Future<Map<String, dynamic>> load(Map<String, dynamic> v) {
        inputs.add(v);
        return inputs.length == 1 ? old.future : fresh.future;
      }

      Widget view(dynamic geometry) => page(
        ZoneIntelligencePreview(
          geometry: geometry,
          campaignId: 'draft',
          loader: load,
          identity: () => 'owner/business',
        ),
      );
      await t.pumpWidget(view(area));
      await t.pump(const Duration(milliseconds: 501));
      expect(inputs.single.containsKey('zoneId'), false);
      await t.pumpWidget(view(other));
      await t.pump(const Duration(milliseconds: 501));
      old.complete(evidence());
      await t.pump();
      expect(find.text('11 mapped residential targets'), findsNothing);
      fresh.complete(evidence(geometry: other, count: 18));
      await t.pump();
      expect(find.text('18 mapped residential targets'), findsOneWidget);
    },
  );
  testWidgets(
    'account switch drops pending response and cannot reuse prior initial evidence',
    (t) async {
      var owner = 'one';
      final requests = <Completer<Map<String, dynamic>>>[];
      Future<Map<String, dynamic>> load(Map<String, dynamic> v) {
        final c = Completer<Map<String, dynamic>>();
        requests.add(c);
        return c.future;
      }

      Widget view() => page(
        ZoneIntelligencePreview(
          geometry: area,
          campaignId: 'draft',
          loader: load,
          identity: () => owner,
        ),
      );
      await t.pumpWidget(view());
      await t.pump(const Duration(milliseconds: 501));
      owner = 'two';
      await t.pumpWidget(view());
      await t.pump(const Duration(milliseconds: 501));
      requests.first.complete(evidence());
      await t.pump();
      expect(find.text('11 mapped residential targets'), findsNothing);
      requests.last.completeError(StateError('unauthorized'));
      await t.pump();
      expect(find.textContaining('temporarily unavailable'), findsOneWidget);
    },
  );
  testWidgets('unknown count is not rendered as zero and retry is explicit', (
    t,
  ) async {
    final data = evidence()
      ..['mappedTargetCount'] = null
      ..['propertyMix'] = null
      ..['supportingStreetMeters'] = null
      ..['workload'] = null;
    await t.pumpWidget(
      page(ZoneIntelligenceSummary(data: data, geometry: area)),
    );
    expect(find.text('Mapped target count unavailable'), findsOneWidget);
    expect(find.textContaining('0 mapped'), findsNothing);
  });
  testWidgets(
    'narrow high-text-scale summary remains readable without overflow',
    (t) async {
      t.view.physicalSize = const Size(320, 900);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      await t.pumpWidget(
        page(
          ZoneIntelligenceSummary(data: evidence(), geometry: area),
          scale: 2,
        ),
      );
      expect(t.takeException(), isNull);
      await t.ensureVisible(find.text('View property evidence'));
      await t.tap(find.text('View property evidence'));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'over six-hour workload retains actual time and warns rather than approving',
    (t) async {
      final data = evidence()
        ..['workload'] = {'minutes': 420, 'oneScaler': false};
      await t.pumpWidget(
        page(ZoneIntelligenceSummary(data: data, geometry: area)),
      );
      expect(find.textContaining('~7 hr 0 min'), findsOneWidget);
      expect(find.textContaining('Exceeds the six-hour'), findsOneWidget);
      expect(find.text('Execution route not yet verified'), findsOneWidget);
    },
  );
}
