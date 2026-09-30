import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';
import 'package:flutter_app/screens/business/campaign_area_screen.dart';
import 'campaign_mapping_interaction_test.dart' as h;

// ignore: subtype_of_sealed_class
class Snapshot extends Fake implements DocumentSnapshot<Map<String, dynamic>> {
  @override
  bool get exists => true;
  @override
  Map<String, dynamic> data() => {'serviceArea': h.glenBurnie.geometry};
}

// ignore: subtype_of_sealed_class, must_be_immutable
class FailedLoad extends h.DraftReference {
  int reads = 0;
  @override
  Future<DocumentSnapshot<Map<String, dynamic>>> get([
    GetOptions? options,
  ]) async {
    if (++reads == 1) throw StateError('fixture unavailable');
    return Snapshot();
  }
}

class _FailedTile extends Fake implements TileImage {}

void main() {
  for (final scale in [false, true]) {
    testWidgets(
      'blank goal 21061 first manual area: no workload write, map visible, unsaved Cancel (Scale=$scale)',
      (t) async {
        await t.binding.setSurfaceSize(const Size(390, 844));
        addTearDown(() => t.binding.setSurfaceSize(null));
        var workloadWrites = 0;
        final ref = h.DraftReference();
        await t.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(2)),
              child: child!,
            ),
            home: Builder(
              builder: (context) => Scaffold(
                body: SingleChildScrollView(
                  child: CampaignZoneAreaEntry(
                    locked: false,
                    hasSavedArea: false,
                    savedAreaName: '',
                    recommendationEnabled: scale,
                    initialSelection: h.glenBurnie,
                    initialHours: 0,
                    onSaveWorkload: (_) async {
                      workloadWrites++;
                      return false;
                    },
                    onPlan: (_, hours, goal) async {
                      fail('manual must not recommend');
                    },
                    onAdvancedEdit: (area) => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => CampaignAreaScreen(
                          campaignReference: ref,
                          pendingZoneData: const {'zoneName': 'First area'},
                          searchBoundary: area!.geometry,
                          initialCenter: null,
                          initialBounds: area.bounds,
                          focusMapOnOpen: true,
                          tileProvider: h.MapTiles(),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await h.choose(t, 'Draw My Area');
        await t.pump(const Duration(milliseconds: 400));
        expect(find.byType(CampaignAreaScreen), findsOneWidget);
        expect(find.text('Draw Area').hitTestable(), findsOneWidget);
        final rect = t.getRect(find.byType(FlutterMap));
        expect(rect.top, greaterThanOrEqualTo(0));
        expect(rect.bottom, lessThan(844));
        expect(workloadWrites, 0);
        await t.tap(find.text('Draw Area'));
        await t.pump();
        await t.pump(const Duration(milliseconds: 50));
        final c = t.getCenter(find.byType(FlutterMap));
        await h.trace(t, [
          c + const Offset(-40, -30),
          c + const Offset(40, -30),
          c + const Offset(40, 30),
          c + const Offset(-40, 30),
        ]);
        expect(find.text('Use This Area').hitTestable(), findsOneWidget);
        expect(
          t
              .widget<ElevatedButton>(
                find.widgetWithText(ElevatedButton, 'Use This Area'),
              )
              .onPressed,
          isNotNull,
        );
        expect(ref.calls, 0);
        expect(workloadWrites, 0);
        await h.choose(t, 'Cancel');
        await t.pump(const Duration(milliseconds: 400));
        expect(find.byType(CampaignZoneAreaEntry), findsOneWidget);
        expect(ref.calls, 0);
        await t.pumpWidget(const SizedBox());
      },
    );
  }
  testWidgets(
    'area initialization failure has Retry and Back; retry loads original without writes',
    (t) async {
      final ref = FailedLoad();
      await h.surface(
        t,
        CampaignAreaScreen(campaignReference: ref, tileProvider: h.MapTiles()),
      );
      expect(find.text('Retry map').hitTestable(), findsOneWidget);
      expect(find.text('Back to campaign').hitTestable(), findsOneWidget);
      expect(find.byType(FlutterMap), findsNothing);
      await t.tap(find.text('Retry map'));
      await t.pump();
      expect(find.byType(FlutterMap), findsOneWidget);
      expect(ref.reads, 2);
      expect(ref.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'map background failure offers reachable retry without resetting geometry or saving',
    (t) async {
      final ref = h.DraftReference();
      await h.surface(
        t,
        CampaignAreaScreen(
          campaignReference: ref,
          pendingZoneData: const {'zoneName': 'Draft'},
          initialArea: h.glenBurnie.geometry,
          tileProvider: h.MapTiles(),
          focusMapOnOpen: true,
        ),
      );
      final layer = t.widget<TileLayer>(find.byType(TileLayer));
      layer.errorTileCallback!(
        _FailedTile(),
        StateError('synthetic tile failure'),
        null,
      );
      await t.pump(const Duration(milliseconds: 100));
      await t.pump(const Duration(milliseconds: 100));
      expect(find.text('Retry map background').hitTestable(), findsOneWidget);
      final before = List.of(h.boundary(t));
      await t.tap(find.text('Retry map background'));
      await t.pump();
      expect(find.text('Retry map background'), findsNothing);
      expect(h.boundary(t), before);
      expect(ref.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );
}
