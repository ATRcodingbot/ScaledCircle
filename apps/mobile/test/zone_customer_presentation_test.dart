import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/theme/app_theme.dart';
import 'package:flutter_app/widgets/zone_intelligence_summary.dart';
import 'package:flutter_app/widgets/campaign_workload_summary.dart';
import 'package:flutter_app/models/campaign/zone_display_identity.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';

final report =
    jsonDecode(
          File(
            '../../docs/zone-intelligence-21061-examples-20260926.json',
          ).readAsStringSync(),
        )
        as Map;
final initial = (report['options'] as List).first['areas'] as List;
Widget card(Map area, int number, {String? comparison}) => Card(
  child: Padding(
    padding: const EdgeInsets.all(20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Zone $number', style: AppTheme.darkTheme.textTheme.titleLarge),
        const SizedBox(height: 16),
        ZoneIntelligenceSummary(
          data: Map<String, dynamic>.from(area['zoneIntelligence']),
          geometry: area['geometry'],
          comparisonReason: comparison,
        ),
      ],
    ),
  ),
);
Widget page(Widget child, {double scale = 1}) => MaterialApp(
  theme: AppTheme.darkTheme,
  home: MediaQuery(
    data: MediaQueryData(textScaler: TextScaler.linear(scale)),
    child: Scaffold(body: SingleChildScrollView(child: child)),
  ),
);
void main() {
  setUpAll(() async {
    if (Platform.environment['ZONE_RENDER_DIR'] == null) return;
    final root = Platform.environment['ZONE_RENDER_FONTS']!;
    for (final entry in {
      'Roboto': ['roboto-regular.ttf', 'roboto-bold.ttf'],
      'MaterialIcons': ['MaterialIcons-Regular.otf'],
    }.entries) {
      final loader = FontLoader(entry.key);
      for (final name in entry.value) {
        loader.addFont(
          Future.value(
            ByteData.sublistView(File('$root/$name').readAsBytesSync()),
          ),
        );
      }
      await loader.load();
    }
  });
  testWidgets(
    'five-second summary leads with exact per-Zone facts; technical evidence expands on demand',
    (t) async {
      for (var i = 0; i < 2; i++) {
        await t.pumpWidget(page(card(initial[i], i + 1)));
        final targets = find.text(
          i == 0
              ? '10 mapped residential targets'
              : '11 mapped residential targets',
        );
        final type = find.text(
          i == 0 ? 'Attached / semi-detached homes' : 'Detached homes',
        );
        final time = find.text(i == 0 ? '~24 min' : '~21 min');
        final streets = find.text(
          i == 0 ? '403 m supporting streets' : '251 m supporting streets',
        );
        expect(t.getTopLeft(targets).dy, lessThan(t.getTopLeft(type).dy));
        expect(t.getTopLeft(type).dy, lessThan(t.getTopLeft(time).dy));
        expect(t.getTopLeft(time).dy, lessThan(t.getTopLeft(streets).dy));
        expect(
          find.textContaining(
            i == 0
                ? 'Nearby housing era: 1960–1979'
                : 'Nearby housing era: 1940–1959',
          ),
          findsOneWidget,
        );
        expect(find.text('Regional property context'), findsOneWidget);
        expect(find.text('Execution route not yet verified'), findsOneWidget);
        expect(find.textContaining('records or housing units'), findsNothing);
        expect(find.textContaining('Source snapshot:'), findsNothing);
        await t.ensureVisible(find.text('About these estimates'));
        await t.tap(find.text('About these estimates'));
        await t.pumpAndSettle();
        await t.ensureVisible(find.text('Technical source details'));
        await t.tap(find.text('Technical source details'));
        await t.pumpAndSettle();
        expect(find.textContaining('records or housing units'), findsOneWidget);
        expect(
          find.textContaining('not facts about each target'),
          findsOneWidget,
        );
        expect(find.textContaining('Source snapshot:'), findsNWidgets(2));
        await t.pumpWidget(const SizedBox());
      }
    },
  );
  testWidgets('only explicit server comparison permits weaker/equal claim', (
    t,
  ) async {
    for (final reason in [null, lowerFitReason, equalFitReason]) {
      await t.pumpWidget(page(card(initial[1], 2, comparison: reason)));
      expect(
        find.textContaining('weaker match'),
        reason == lowerFitReason ? findsOneWidget : findsNothing,
      );
      expect(
        find.textContaining('similar match'),
        reason == equalFitReason ? findsOneWidget : findsNothing,
      );
      expect(find.textContaining('lead probability'), findsNothing);
      expect(find.text(lowerFitReason), findsNothing);
    }
  });
  testWidgets('property evidence supports keyboard expand and collapse', (
    t,
  ) async {
    await t.pumpWidget(page(card(initial[0], 1)));
    await t.ensureVisible(find.text('About these estimates'));
    await t.sendKeyEvent(LogicalKeyboardKey.tab);
    await t.sendKeyEvent(LogicalKeyboardKey.enter);
    await t.pumpAndSettle();
    expect(find.textContaining('Source snapshot:'), findsOneWidget);
    await t.sendKeyEvent(LogicalKeyboardKey.enter);
    await t.pumpAndSettle();
    expect(find.textContaining('Source snapshot:'), findsNothing);
  });
  test(
    'legacy Area names resolve one consistent Zone ordinal without changing IDs or geometry',
    () {
      final rows = [
        {'id': 'z-b', 'zoneName': 'Area 2'},
        {'id': 'z-a', 'zoneName': 'Area 1'},
      ];
      final result = resolveZoneDisplayIdentities(rows);
      expect(result.map((v) => v.ordinal), [2, 1]);
      expect(result.map((v) => v.label), ['Zone 2', 'Zone 1']);
      expect(result.map((v) => v.authoritativeId), ['z-b', 'z-a']);
      expect(rows.first['zoneName'], 'Area 2');
    },
  );
  test(
    'review UI cannot accept missing, stale or oversized Zones even with old ready response',
    () {
      final row = {
        'serviceArea': initial[0]['geometry'],
        'zoneIntelligence': initial[0]['zoneIntelligence'],
      };
      final ready = {'ready': true, 'requiredZoneCount': 1};
      expect(campaignZoneWorkloadCanReview([row], ready), true);
      expect(
        campaignZoneWorkloadCanReview(
          [row],
          {'ready': true, 'requiredZoneCount': 2},
        ),
        false,
      );
      expect(
        campaignZoneWorkloadCanReview(
          [row],
          {'ready': false, 'requiredZoneCount': 1},
        ),
        false,
      );
      expect(
        campaignZoneWorkloadCanReview([
          {...row, 'serviceArea': initial[1]['geometry']},
        ], ready),
        false,
      );
      expect(
        campaignZoneWorkloadCanReview([
          {...row, 'assignedScalerId': 'worker'},
        ], ready),
        false,
      );
      expect(
        campaignZoneWorkloadCanReview([
          {...row, 'zoneIntelligence': null},
        ], ready),
        false,
      );
      final bad = Map<String, dynamic>.from(initial[0]['zoneIntelligence']);
      bad['workload'] = {'minutes': 361, 'oneScaler': true};
      expect(
        campaignZoneWorkloadCanReview([
          {...row, 'zoneIntelligence': bad},
        ], ready),
        false,
      );
    },
  );
  test(
    'saved alternate request binds selected slot and complete current selection without legacy boundary',
    () {
      final request = smartZoneRecommendationRequest(
        campaignId: 'c',
        desiredHours: 10,
        selectionIds: ['candidate-a', 'candidate-b'],
        replaceZoneIndex: 1,
        resumeSavedPlan: true,
      );
      expect(request['desiredHours'], 10);
      expect(request['selectionIds'], ['candidate-a', 'candidate-b']);
      expect(request['replaceZoneIndex'], 1);
      expect(request['resumeSavedPlan'], true);
      expect(request.containsKey('analysisBoundary'), false);
    },
  );
  testWidgets('demand and supported total remain separate at 2x text', (
    t,
  ) async {
    t.view.physicalSize = const Size(320, 1100);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(
      page(
        const CampaignWorkloadSummary(
          state: {
            'requestedHours': 10,
            'requestedMinutes': 600,
            'requiredZoneCount': 2,
            'validZoneCount': 2,
            'supportedMinutes': 330,
            'targetMinutesPerZone': 300,
          },
        ),
        scale: 2,
      ),
    );
    expect(find.text('Required Zones: 2'), findsOneWidget);
    expect(
      find.text('Supported planning workload: ~5 hr 30 min'),
      findsOneWidget,
    );
    expect(t.takeException(), isNull);
  });
  testWidgets('review renders and accessible expansion at narrow 2x text', (
    t,
  ) async {
    final out = Platform.environment['ZONE_RENDER_DIR'];
    for (final narrow in [false, true]) {
      t.view.physicalSize = narrow
          ? const Size(390, 1900)
          : const Size(1140, 820);
      t.view.devicePixelRatio = 1;
      final key = GlobalKey();
      await t.pumpWidget(
        page(
          RepaintBoundary(
            key: key,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: narrow
                  ? card(initial[1], 2)
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: card(initial[0], 1)),
                        const SizedBox(width: 16),
                        Expanded(child: card(initial[1], 2)),
                      ],
                    ),
            ),
          ),
          scale: narrow ? 2 : 1,
        ),
      );
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      if (out != null) {
        await t.runAsync(() async {
          final image =
              await (key.currentContext!.findRenderObject()
                      as RenderRepaintBoundary)
                  .toImage(pixelRatio: 1);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File(
            '$out/zone-summary-${narrow ? 'narrow-2x' : 'desktop'}.png',
          ).writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }
      if (narrow) {
        await t.ensureVisible(find.text('About these estimates'));
        await t.tap(find.text('About these estimates'));
        await t.pumpAndSettle();
        expect(find.textContaining('Source snapshot:'), findsOneWidget);
        expect(t.takeException(), isNull);
      }
    }
    t.view.resetPhysicalSize();
    t.view.resetDevicePixelRatio();
  });
}
