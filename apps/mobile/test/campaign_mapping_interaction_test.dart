import 'dart:async';
import 'dart:convert';
import 'dart:ui';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_app/models/campaign_map_context.dart';
import 'package:flutter_app/models/campaign_area_geometry.dart';
import 'package:flutter_app/screens/business/campaign_area_screen.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';
import 'package:flutter_app/services/address_search_service.dart';
import 'package:flutter_app/services/property_intelligence_service.dart';
import 'package:flutter_app/widgets/smart_zone_recommendation_evidence.dart';
import 'package:flutter_app/widgets/zone_intelligence_card.dart';

// Test-only boundary: unexpected Firestore reads or writes fail immediately.
// ignore: subtype_of_sealed_class, must_be_immutable
class DraftReference implements DocumentReference<Map<String, dynamic>> {
  int calls = 0;
  @override
  String get id => 'unsaved-zone';
  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls++;
    throw StateError('Draft geometry must not read or write a persisted Zone.');
  }
}

// ignore: subtype_of_sealed_class, must_be_immutable
class SavedDraftReference extends DraftReference {
  Map<String, dynamic>? saved;
  @override
  Future<void> set(Map<String, dynamic> data, [SetOptions? options]) async {
    saved = Map<String, dynamic>.from(data);
  }
}

class MapTiles extends TileProvider {
  final ImageProvider image = MemoryImage(
    base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN49+7dfwAJYgPK1Rd34wAAAABJRU5ErkJggg==',
    ),
  );
  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) =>
      image;
}

const glenBurnie = AddressSuggestion(
  id: '21061',
  primaryText: '21061',
  secondaryText: 'Anne Arundel County, Maryland, United States',
  fullAddress: '21061, Anne Arundel County, Maryland, United States',
  latitude: 39.1559,
  longitude: -76.6252,
  bounds: {'south': 39.115, 'north': 39.200, 'west': -76.680, 'east': -76.580},
  geometry: [
    {'latitude': 39.115, 'longitude': -76.680},
    {'latitude': 39.200, 'longitude': -76.680},
    {'latitude': 39.200, 'longitude': -76.580},
    {'latitude': 39.115, 'longitude': -76.580},
  ],
);

Future<void> surface(WidgetTester t, Widget screen) async {
  await t.binding.setSurfaceSize(const Size(1100, 1900));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(MaterialApp(home: screen));
  await t.pump(const Duration(milliseconds: 1));
}

CampaignAreaScreen draft(
  DraftReference reference, {
  MapController? controller,
  Future<PropertyIntelligenceAnalysis> Function(List<Map<String, double>>)?
  analyze,
  CampaignMapContext? location,
  List<Map<String, dynamic>> initialArea = const [],
  Future<CampaignAreaRecommendationResult?> Function(
    BuildContext,
    List<Map<String, double>>,
  )?
  recommend,
}) => CampaignAreaScreen(
  campaignReference: reference,
  pendingZoneData: const {'zoneName': 'Draft Zone'},
  initialCenter: location?.center,
  initialBounds: location?.bounds,
  searchBoundary: location?.searchBoundary ?? const [],
  initialArea: initialArea,
  searchContextLabel: location?.selectedArea?.fullAddress,
  tileProvider: MapTiles(),
  mapController: controller,
  analyzeGeometry: analyze,
  recommendWithinArea: recommend,
);

Future<void> choose(WidgetTester t, String text) async {
  if (['Circle', 'Rectangle', 'Polygon'].contains(text) &&
      find.text(text).evaluate().isEmpty) {
    await t.ensureVisible(find.text('Advanced Drawing Tools'));
    await t.tap(find.text('Advanced Drawing Tools'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
  }
  await t.ensureVisible(find.text(text).last);
  await t.tap(find.text(text).last);
  await t.pump(const Duration(milliseconds: 1));
  await t.pump(const Duration(milliseconds: 1));
}

bool ready(WidgetTester t) =>
    t
        .widget<ElevatedButton>(
          find.widgetWithText(ElevatedButton, 'Save Zone'),
        )
        .onPressed !=
    null;
Offset mapCenter(WidgetTester t) => t.getCenter(find.byType(FlutterMap));

Future<void> tapMap(WidgetTester t, Offset point) async {
  await t.tapAt(point);
  await t.pump(const Duration(milliseconds: 1));
}

List<LatLng> boundary(WidgetTester t) =>
    t.widget<PolygonLayer>(find.byType(PolygonLayer)).polygons.last.points;

Future<void> trace(
  WidgetTester t,
  List<Offset> points, {
  PointerDeviceKind kind = PointerDeviceKind.mouse,
}) async {
  final gesture = await t.startGesture(points.first, kind: kind);
  for (final point in points.skip(1)) {
    await gesture.moveTo(point);
    await t.pump(const Duration(milliseconds: 16));
  }
  await gesture.up();
  await t.pump(const Duration(milliseconds: 1));
  await gesture.removePointer();
}

void main() {
  const originalAnalysisArea = <Map<String, dynamic>>[
    {'latitude': 39.15, 'longitude': -76.62},
    {'latitude': 39.151, 'longitude': -76.62},
    {'latitude': 39.151, 'longitude': -76.619},
    {'latitude': 39.15, 'longitude': -76.619},
  ];

  test(
    'explicit analysis boundary replaces ZIP lookup without shrinking it',
    () {
      final largeBoundary = <Map<String, double>>[
        {'lat': 39.10, 'lng': -76.7},
        {'lat': 39.20, 'lng': -76.7},
        {'lat': 39.20, 'lng': -76.5},
        {'lat': 39.10, 'lng': -76.5},
      ];
      final request = smartZoneRecommendationRequest(
        campaignId: 'existing-draft',
        selectedArea: glenBurnie,
        analysisBoundary: largeBoundary,
      );
      expect(request['analysisBoundary'], largeBoundary);
      expect(request.containsKey('areaSelection'), false);
      largeBoundary.first['lat'] = 0;
      expect((request['analysisBoundary'] as List).first['lat'], 39.10);
      expect(
        request.keys,
        unorderedEquals(['campaignId', 'desiredHours', 'analysisBoundary']),
      );
    },
  );

  testWidgets('unsaved recommendation sends exact boundary and never saves', (
    t,
  ) async {
    final reference = DraftReference();
    List<Map<String, double>>? requested;
    await surface(
      t,
      draft(
        reference,
        initialArea: originalAnalysisArea,
        recommend: (_, geometry) async {
          requested = geometry;
          return null;
        },
      ),
    );
    await choose(t, 'Recommend within this area');
    expect(
      requested,
      originalAnalysisArea
          .map((p) => {'lat': p['latitude'], 'lng': p['longitude']})
          .toList(),
    );
    expect(reference.calls, 0);
    expect(boundary(t).length, 4);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('recommendation Adjust stays in same editor and supports Undo', (
    t,
  ) async {
    final reference = DraftReference();
    final adjusted = <Map<String, dynamic>>[
      {'latitude': 39.1501, 'longitude': -76.6199},
      {'latitude': 39.1508, 'longitude': -76.6199},
      {'latitude': 39.1508, 'longitude': -76.6192},
      {'latitude': 39.1501, 'longitude': -76.6192},
    ];
    await surface(
      t,
      draft(
        reference,
        initialArea: originalAnalysisArea,
        recommend: (_, _) async =>
            CampaignAreaRecommendationResult.adjust(adjusted),
      ),
    );
    final editor = t.state(find.byType(CampaignAreaScreen));
    await choose(t, 'Recommend within this area');
    expect(t.state(find.byType(CampaignAreaScreen)), same(editor));
    expect(boundary(t).first.latitude, 39.1501);
    await choose(t, 'Undo');
    expect(boundary(t).first.latitude, 39.15);
    expect(reference.calls, 0);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets(
    'applied recommendation exits with false and does not save pending Zone',
    (t) async {
      final reference = DraftReference();
      bool? saveResult;
      await surface(
        t,
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                saveResult = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => draft(
                      reference,
                      initialArea: originalAnalysisArea,
                      recommend: (_, _) async =>
                          const CampaignAreaRecommendationResult.applied(),
                    ),
                  ),
                );
              },
              child: const Text('Open editor'),
            ),
          ),
        ),
      );
      await choose(t, 'Open editor');
      await t.pump(const Duration(milliseconds: 400));
      await choose(t, 'Recommend within this area');
      await t.pump(const Duration(milliseconds: 400));
      await t.pump(const Duration(milliseconds: 400));
      expect(saveResult, false);
      expect(find.byType(CampaignAreaScreen), findsNothing);
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'invalid and stale adjusted boundaries never replace the current drawing',
    (t) async {
      final reference = DraftReference();
      final response = Completer<CampaignAreaRecommendationResult?>();
      await surface(
        t,
        draft(
          reference,
          initialArea: originalAnalysisArea,
          recommend: (_, _) => response.future,
        ),
      );
      await choose(t, 'Recommend within this area');
      await choose(t, 'Clear');
      response.complete(
        const CampaignAreaRecommendationResult.adjust(originalAnalysisArea),
      );
      await t.pump();
      expect(
        t.widget<PolygonLayer>(find.byType(PolygonLayer)).polygons,
        isEmpty,
      );
      expect(reference.calls, 0);
      final button = t.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Recommend within this area'),
      );
      expect(button.onPressed, isNull);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'self-crossing adjusted boundary is rejected without changing saved or draft data',
    (t) async {
      final reference = DraftReference();
      await surface(
        t,
        draft(
          reference,
          initialArea: originalAnalysisArea,
          recommend: (_, _) async => CampaignAreaRecommendationResult.adjust([
            originalAnalysisArea[0],
            originalAnalysisArea[2],
            originalAnalysisArea[1],
            originalAnalysisArea[3],
          ]),
        ),
      );
      await choose(t, 'Recommend within this area');
      expect(
        boundary(t)
            .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
            .toList(),
        originalAnalysisArea,
      );
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'narrow screen with large text keeps primary and advanced controls reachable',
    (t) async {
      await t.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.6)),
            child: child!,
          ),
          home: draft(DraftReference(), recommend: (_, _) async => null),
        ),
      );
      await t.pump();
      expect(t.takeException(), isNull);
      await choose(t, 'Draw Area');
      expect(find.text('Cancel drawing').hitTestable(), findsOneWidget);
      final map = t.getRect(find.byType(FlutterMap));
      expect(map.top, greaterThanOrEqualTo(112));
      expect(map.bottom, lessThanOrEqualTo(844));
      final center = map.center;
      await trace(t, [
        center + const Offset(-70, -50),
        center + const Offset(70, -50),
        center + const Offset(70, 50),
        center + const Offset(-70, 50),
      ], kind: PointerDeviceKind.touch);
      for (final label in [
        'Use This Area',
        'Recommend within this area',
        'Clear',
        'Undo',
        'Edit Boundary',
        'Advanced Drawing Tools',
      ]) {
        await t.ensureVisible(find.text(label));
        await t.pump();
        expect(find.text(label).hitTestable(), findsOneWidget);
        expect(t.takeException(), isNull);
      }
      await choose(t, 'Polygon');
      for (final label in ['Polygon', 'Rectangle', 'Circle', 'Save Zone']) {
        await t.ensureVisible(find.text(label));
        await t.pump();
        expect(find.text(label).hitTestable(), findsOneWidget);
      }
      expect(t.takeException(), isNull);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'accessible Polygon keeps concave click order and blocks self-crossing geometry',
    (t) async {
      final controller = MapController();
      addTearDown(controller.dispose);
      await surface(t, draft(DraftReference(), controller: controller));
      await choose(t, 'Polygon');
      final center = mapCenter(t);
      final points = [
        center + const Offset(-100, -100),
        center + const Offset(100, -100),
        center + const Offset(100, 100),
        center,
        center + const Offset(-100, 100),
      ];
      final expected = points
          .map(
            (p) => controller.camera.screenOffsetToLatLng(
              p - t.getTopLeft(find.byType(FlutterMap)),
            ),
          )
          .toList();
      for (final point in points) {
        await tapMap(t, point);
      }
      expect(boundary(t), expected);
      expect(ready(t), true);
      await choose(t, 'Clear');
      final next = mapCenter(t);
      for (final point in [
        next + const Offset(-80, -80),
        next + const Offset(80, 80),
        next + const Offset(-80, 80),
        next + const Offset(80, -80),
      ]) {
        await tapMap(t, point);
      }
      expect(ready(t), false);
      expect(find.textContaining('crosses or loops'), findsOneWidget);
      await choose(t, 'Undo');
      expect(ready(t), true);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'multitouch and outside-map freehand are cancelled without replacing prior area',
    (t) async {
      await surface(
        t,
        draft(DraftReference(), initialArea: glenBurnie.geometry),
      );
      final original = List<LatLng>.of(boundary(t));
      await choose(t, 'Edit Boundary');
      var center = mapCenter(t);
      final first = await t.startGesture(
        center + const Offset(-70, -60),
        pointer: 1,
      );
      await first.moveBy(const Offset(100, 0));
      final second = await t.startGesture(center, pointer: 2);
      await first.moveBy(const Offset(0, 100));
      await first.up();
      await second.up();
      await t.pump();
      expect(find.textContaining('one finger at a time'), findsOneWidget);
      expect(boundary(t), original);
      await choose(t, 'Edit Boundary');
      center = mapCenter(t);
      final outside = await t.startGesture(center);
      await outside.moveTo(
        t.getTopLeft(find.byType(FlutterMap)) - const Offset(5, 5),
      );
      await outside.up();
      await t.pump();
      expect(
        find.textContaining('Keep the outline inside the map'),
        findsOneWidget,
      );
      expect(boundary(t), original);
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'freehand mouse preserves a concave trace, previews without writes, saves only Use This Area',
    (t) async {
      final reference = SavedDraftReference();
      final controller = MapController();
      addTearDown(controller.dispose);
      await surface(
        t,
        CampaignAreaScreen(
          campaignReference: reference,
          pendingZoneData: const {'zoneName': 'Freehand zone'},
          mapController: controller,
          tileProvider: MapTiles(),
          analyzePersistedZone: () async => true,
        ),
      );
      expect(find.text('Browse Map'), findsOneWidget);
      expect(find.text('Circle'), findsNothing);
      await choose(t, 'Draw Area');
      final center = mapCenter(t);
      final offsets = [
        const Offset(-100, -100),
        const Offset(100, -100),
        const Offset(100, 100),
        const Offset(0, 0),
        const Offset(-100, 100),
      ];
      final screenPoints = offsets.map((p) => center + p).toList();
      final expected = screenPoints
          .map(
            (p) => controller.camera.screenOffsetToLatLng(
              p - t.getTopLeft(find.byType(FlutterMap)),
            ),
          )
          .toList();
      final originalCenter = controller.camera.center;
      final gesture = await t.startGesture(
        screenPoints.first,
        kind: PointerDeviceKind.mouse,
      );
      for (final point in screenPoints.skip(1)) {
        await gesture.moveTo(point);
        await t.pump(const Duration(milliseconds: 16));
      }
      expect(find.byType(PolylineLayer), findsOneWidget);
      expect(reference.saved, isNull);
      expect(controller.camera.center, originalCenter);
      await gesture.up();
      await t.pump(const Duration(milliseconds: 1));
      await gesture.removePointer();
      expect(find.text('Browse Map'), findsOneWidget);
      expect(boundary(t), expected);
      expect(find.byType(PolylineLayer), findsNothing);
      expect(reference.saved, isNull);
      final geometry = boundary(
        t,
      ).map((p) => {'latitude': p.latitude, 'longitude': p.longitude}).toList();
      await choose(t, 'Use This Area');
      expect(reference.saved?['serviceArea'], geometry);
      expect(reference.saved?['serviceAreaType'], 'polygon');
      await t.pump(const Duration(milliseconds: 350));
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'touch Browse pans, Draw traces without panning, preview returns to pan and Undo restores edited boundary',
    (t) async {
      final controller = MapController();
      addTearDown(controller.dispose);
      final reference = DraftReference();
      await surface(t, draft(reference, controller: controller));
      final beforeBrowse = controller.camera.center;
      await t.dragFrom(mapCenter(t), const Offset(100, 25));
      await t.pump(const Duration(milliseconds: 350));
      expect(controller.camera.center, isNot(beforeBrowse));
      expect(
        t.widget<PolygonLayer>(find.byType(PolygonLayer)).polygons,
        isEmpty,
      );
      await choose(t, 'Draw Area');
      final center = mapCenter(t);
      final beforeTrace = controller.camera.center;
      final beforeScroll = t
          .state<ScrollableState>(
            find
                .descendant(
                  of: find.byKey(const Key('campaign-area-scroll')),
                  matching: find.byType(Scrollable),
                )
                .first,
          )
          .position
          .pixels;
      await trace(t, [
        center + const Offset(-70, -70),
        center + const Offset(90, -70),
        center + const Offset(80, 80),
        center + const Offset(-70, 80),
      ], kind: PointerDeviceKind.touch);
      final original = List<LatLng>.of(boundary(t));
      expect(controller.camera.center, beforeTrace);
      expect(
        t
            .state<ScrollableState>(
              find
                  .descendant(
                    of: find.byKey(const Key('campaign-area-scroll')),
                    matching: find.byType(Scrollable),
                  )
                  .first,
            )
            .position
            .pixels,
        beforeScroll,
      );
      await t.dragFrom(mapCenter(t), const Offset(30, 40));
      await t.pump(const Duration(milliseconds: 350));
      expect(controller.camera.center, isNot(beforeTrace));
      expect(boundary(t), original);
      await choose(t, 'Edit Boundary');
      final editCenter = mapCenter(t);
      await trace(t, [
        editCenter + const Offset(-50, -50),
        editCenter + const Offset(50, -50),
        editCenter + const Offset(50, 50),
        editCenter + const Offset(-50, 50),
      ], kind: PointerDeviceKind.touch);
      expect(boundary(t), isNot(original));
      await choose(t, 'Undo');
      expect(boundary(t), original);
      await choose(t, 'Clear');
      expect(
        t.widget<PolygonLayer>(find.byType(PolygonLayer)).polygons,
        isEmpty,
      );
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'invalid crossing and interrupted freehand keep exact recommended territory; editing invalidates in-flight analysis',
    (t) async {
      final response = Completer<PropertyIntelligenceAnalysis>();
      final proposal = glenBurnie.geometry;
      await surface(
        t,
        draft(
          DraftReference(),
          initialArea: proposal,
          analyze: (_) => response.future,
        ),
      );
      final before = List<LatLng>.of(boundary(t));
      await choose(t, 'Property Intelligence');
      await choose(t, 'Edit Boundary');
      response.complete(
        const PropertyIntelligenceAnalysis({
          'aiSummary': 'Old recommendation analysis',
        }),
      );
      await t.pump(const Duration(milliseconds: 1));
      expect(find.text('Old recommendation analysis'), findsNothing);
      final center = mapCenter(t);
      await trace(t, [
        center + const Offset(-80, -80),
        center + const Offset(80, 80),
        center + const Offset(-80, 80),
        center + const Offset(80, -80),
      ]);
      expect(find.textContaining('crosses or loops'), findsOneWidget);
      expect(boundary(t), before);
      await choose(t, 'Edit Boundary');
      final gesture = await t.startGesture(mapCenter(t));
      await gesture.moveBy(const Offset(50, 30));
      await gesture.cancel();
      await t.pump(const Duration(milliseconds: 1));
      expect(boundary(t), before);
      expect(find.text('Browse Map'), findsOneWidget);
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'mapped feature inventory shows provenance and rejects stale geometry evidence',
    (t) async {
      final digest = CampaignAreaGeometry.savedDigest(glenBurnie.geometry);
      final zone = <String, dynamic>{
        'serviceArea': glenBurnie.geometry,
        'serverZoneGeometryDigest': digest,
        'estimatedHomes': 999,
        'homeCountMethod': 'osm_classified_mapped_features_v2',
        'smartZoneTargetEvidence': {
          'measure': 'mapped_target_features',
          'geometryDigest': digest,
          'eligibleMappedFeatureCount': 12,
          'source': 'OpenStreetMap',
          'dataTimestamp': '2026-09-25T12:00:00Z',
          'fetchedAt': '2026-09-26T12:00:00Z',
          'targetIntent': 'business',
          'limitations': ['Building coverage may be incomplete.'],
        },
      };
      await surface(
        t,
        Scaffold(
          body: ZoneIntelligenceCard(zoneName: 'Current zone', data: zone),
        ),
      );
      expect(find.text('Mapped business target features'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('999'), findsNothing);
      expect(
        find.textContaining('Source date: 2026-09-25T12:00:00Z'),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'not distinct households or verified accessible delivery points',
        ),
        findsOneWidget,
      );
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ZoneIntelligenceCard(
              zoneName: 'Edited zone',
              data: {...zone, 'serverZoneGeometryDigest': 'stale'},
            ),
          ),
        ),
      );
      expect(find.text('12'), findsNothing);
      expect(
        find.textContaining('does not match this saved geometry'),
        findsOneWidget,
      );
      await t.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'desktop circle finalizes on first two nearby rapid clicks, with hover preview',
    (t) async {
      final reference = DraftReference();
      await surface(t, draft(reference));
      await choose(t, 'Circle');
      expect(
        find.text('Click or tap the center of your campaign area.'),
        findsOneWidget,
      );
      final center = mapCenter(t);
      final mouse = await t.createGesture(kind: PointerDeviceKind.mouse);
      await mouse.addPointer(location: center);
      await mouse.down(center);
      await mouse.up();
      await t.pump(const Duration(milliseconds: 1));
      expect(
        find.textContaining('Move the pointer and click again'),
        findsOneWidget,
      );
      await mouse.moveTo(center + const Offset(35, 0));
      await t.pump(const Duration(milliseconds: 1));
      expect(find.textContaining('Preview radius:'), findsOneWidget);
      expect(ready(t), false);
      expect(
        t
            .widget<PolygonLayer>(find.byType(PolygonLayer))
            .polygons
            .single
            .points
            .length,
        48,
      );
      await mouse.down(center + const Offset(35, 0));
      await mouse.up();
      await t.pump(const Duration(milliseconds: 1));
      expect(
        find.text(
          'Circle ready. Save this area, or Undo to adjust its radius.',
        ),
        findsOneWidget,
      );
      expect(ready(t), true);
      expect(reference.calls, 0);
      await mouse.removePointer();
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'touch circle, undo, clear and shape switches do not retain stale points',
    (t) async {
      final reference = DraftReference();
      await surface(t, draft(reference));
      await tapMap(t, mapCenter(t));
      await t.pump(const Duration(milliseconds: 1));
      await choose(t, 'Circle');
      final center = mapCenter(t);
      await tapMap(t, center);
      await tapMap(t, center + const Offset(45, 0));
      await t.pump(const Duration(milliseconds: 1));
      expect(ready(t), true);
      await choose(t, 'Undo');
      expect(ready(t), false);
      expect(
        find.textContaining('Move the pointer and click again'),
        findsOneWidget,
      );
      await tapMap(t, mapCenter(t) + const Offset(65, 0));
      await t.pump(const Duration(milliseconds: 1));
      expect(ready(t), true);
      await choose(t, 'Clear');
      expect(
        find.text('Click or tap the center of your campaign area.'),
        findsOneWidget,
      );
      await tapMap(t, mapCenter(t));
      await t.pump(const Duration(milliseconds: 1));
      await choose(t, 'Rectangle');
      await choose(t, 'Circle');
      expect(
        find.text('Click or tap the center of your campaign area.'),
        findsOneWidget,
      );
      expect(ready(t), false);
      await tapMap(t, mapCenter(t));
      await tapMap(t, mapCenter(t) + const Offset(45, 0));
      expect(ready(t), true);
      await choose(t, 'Clear');
      await tapMap(t, mapCenter(t));
      await tapMap(t, mapCenter(t) + const Offset(55, 0));
      expect(ready(t), true);
      expect(boundary(t), hasLength(48));
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'circle center survives pan/zoom and duplicate center click does not finalize',
    (t) async {
      final controller = MapController();
      addTearDown(controller.dispose);
      await surface(t, draft(DraftReference(), controller: controller));
      await choose(t, 'Circle');
      final center = mapCenter(t);
      await tapMap(t, center);
      await tapMap(t, center);
      await t.pump(const Duration(milliseconds: 1));
      expect(ready(t), false);
      final before = t
          .widget<MarkerLayer>(find.byType(MarkerLayer))
          .markers
          .single
          .point;
      controller.move(
        LatLng(before.latitude + .002, before.longitude + .002),
        controller.camera.zoom + 1,
      );
      await t.pump(const Duration(milliseconds: 1));
      await t.dragFrom(mapCenter(t), const Offset(30, 30));
      await t.pump(const Duration(milliseconds: 1));
      expect(
        t.widget<MarkerLayer>(find.byType(MarkerLayer)).markers.single.point,
        before,
      );
      await tapMap(t, mapCenter(t) + const Offset(100, 20));
      await t.pump(const Duration(milliseconds: 1));
      expect(ready(t), true);
      expect(
        t.widget<MarkerLayer>(find.byType(MarkerLayer)).markers.first.point,
        before,
      );
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'outside-map click leaves drawing unchanged and back then return starts fresh',
    (t) async {
      final reference = DraftReference();
      await surface(
        t,
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              child: const Text('Open map'),
              onPressed: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => draft(reference))),
            ),
          ),
        ),
      );
      await choose(t, 'Open map');
      await t.pump(const Duration(milliseconds: 400));
      await choose(t, 'Circle');
      await tapMap(t, mapCenter(t));
      await t.pump(const Duration(milliseconds: 1));
      await choose(t, 'Draw Your Area');
      expect(t.widget<MarkerLayer>(find.byType(MarkerLayer)).markers.length, 1);
      await choose(t, 'Cancel');
      await t.pump(const Duration(milliseconds: 400));
      await choose(t, 'Open map');
      await t.pump(const Duration(milliseconds: 400));
      await choose(t, 'Circle');
      expect(t.widget<MarkerLayer>(find.byType(MarkerLayer)).markers, isEmpty);
      await tapMap(t, mapCenter(t));
      await tapMap(t, mapCenter(t) + const Offset(55, 0));
      await t.pump(const Duration(milliseconds: 1));
      expect(ready(t), true);
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'Property Intelligence explains pre-area state and analyzes exact draft without Zone404',
    (t) async {
      final reference = DraftReference();
      final geometries = <List<Map<String, double>>>[];
      await surface(
        t,
        draft(
          reference,
          analyze: (geometry) async {
            geometries.add(geometry);
            return const PropertyIntelligenceAnalysis({
              'source': 'Fixture source',
              'aiSummary': 'Draft geometry analysis',
            });
          },
        ),
      );
      expect(
        t.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged,
        isNotNull,
      );
      await choose(t, 'Property Intelligence');
      expect(
        find.textContaining('Draw or select an area first.'),
        findsOneWidget,
      );
      expect(geometries, isEmpty);
      await choose(t, 'Circle');
      await tapMap(t, mapCenter(t));
      await tapMap(t, mapCenter(t) + const Offset(45, 0));
      await t.pump(const Duration(milliseconds: 350));
      await t.pump(const Duration(milliseconds: 1));
      final drawn = t
          .widget<PolygonLayer>(find.byType(PolygonLayer))
          .polygons
          .single
          .points;
      expect(
        geometries.single,
        drawn
            .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
            .toList(),
      );
      expect(geometries.single.length, 48);
      expect(reference.calls, 0);
      expect(find.text('Draft geometry analysis'), findsOneWidget);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'late property result cannot overwrite a cleared or changed drawing',
    (t) async {
      final response = Completer<PropertyIntelligenceAnalysis>();
      await surface(
        t,
        draft(DraftReference(), analyze: (_) => response.future),
      );
      await choose(t, 'Property Intelligence');
      await choose(t, 'Circle');
      await tapMap(t, mapCenter(t));
      await tapMap(t, mapCenter(t) + const Offset(45, 0));
      await t.pump(const Duration(milliseconds: 350));
      await choose(t, 'Clear');
      response.complete(
        const PropertyIntelligenceAnalysis({
          'aiSummary': 'Stale old territory',
        }),
      );
      await t.pump(const Duration(milliseconds: 1));
      expect(find.text('Stale old territory'), findsNothing);
      expect(ready(t), false);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    '21061 search feeds Recommend and Draw My Area, fits Glen Burnie bounds and survives back',
    (t) async {
      final memory = CampaignMapContext();
      AddressSuggestion? recommended;
      final controller = MapController();
      addTearDown(controller.dispose);
      await surface(
        t,
        Builder(
          builder: (context) => Scaffold(
            body: SingleChildScrollView(
              child: CampaignZoneAreaEntry(
                recommendationEnabled: true,
                locked: false,
                hasSavedArea: false,
                savedAreaName: '',
                initialSelection: memory.selectedArea,
                onSelectionChanged: (v) => memory.selectedArea = v,
                searchAddresses: (query) async {
                  expect(query, '21061');
                  return [glenBurnie];
                },
                onPlan: (area, hours, objective) async {
                  recommended = area;
                },
                onAdvancedEdit: (area) {
                  memory.selectedArea = area;
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => draft(
                        DraftReference(),
                        controller: controller,
                        location: memory,
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      );
      await t.enterText(find.byType(TextFormField).first, '21061');
      await t.tap(find.byTooltip('Search map'));
      await t.pump(const Duration(milliseconds: 1));
      await choose(t, 'Recommend an Area');
      expect(recommended, same(glenBurnie));
      await choose(t, 'Draw My Area');
      await t.pump(const Duration(milliseconds: 400));
      expect(controller.camera.center.latitude, closeTo(39.1575, .001));
      expect(controller.camera.center.longitude, closeTo(-76.630, .001));
      expect(
        controller.camera.visibleBounds.contains(const LatLng(39.115, -76.680)),
        true,
      );
      expect(
        controller.camera.visibleBounds.contains(const LatLng(39.200, -76.580)),
        true,
      );
      expect(
        (controller.camera.center.latitude - 39.2904).abs(),
        greaterThan(.1),
      );
      await choose(t, 'Cancel');
      await t.pump(const Duration(milliseconds: 400));
      expect(memory.selectedArea, same(glenBurnie));
      expect(find.text(glenBurnie.fullAddress), findsOneWidget);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'Adjust Area proposed geometry takes precedence over wider search bounds',
    (t) async {
      final controller = MapController();
      addTearDown(controller.dispose);
      final proposal = <Map<String, dynamic>>[
        {'latitude': 39.15, 'longitude': -76.62},
        {'latitude': 39.151, 'longitude': -76.62},
        {'latitude': 39.151, 'longitude': -76.619},
      ];
      await surface(
        t,
        draft(
          DraftReference(),
          controller: controller,
          location: CampaignMapContext()..selectedArea = glenBurnie,
          initialArea: proposal,
        ),
      );
      expect(controller.camera.center.latitude, closeTo(39.1505, .0001));
      expect(controller.camera.zoom, greaterThan(16));
      final drawn = t
          .widget<PolygonLayer>(find.byType(PolygonLayer))
          .polygons
          .last
          .points;
      expect(
        drawn
            .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
            .toList(),
        proposal,
      );
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'legacy 225-property fallback cannot show Excellent or be applied',
    (t) async {
      final plan = <String, dynamic>{
        'zones': [
          {'workability': 'excellent'},
        ],
        'totalEstimatedProperties': 225,
        'totalEstimatedHours': 5,
      };
      expect(smartZonePlanCanApply(plan), false);
      await surface(
        t,
        Scaffold(body: SmartZoneRecommendationEvidence(plan: plan)),
      );
      expect(find.text('Basic Area Estimate'), findsOneWidget);
      expect(find.textContaining('225'), findsNothing);
      expect(find.text('Excellent'), findsNothing);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'saved legacy demand-derived count is not presented as observed target homes',
    (t) async {
      await surface(
        t,
        const Scaffold(
          body: ZoneIntelligenceCard(
            zoneName: 'Legacy zone',
            data: {
              'estimatedHomes': 225,
              'homeCountStatus': 'complete',
              'analysisStatus': 'complete',
              'homeCountMethod': 'smart_zone_conservative_density_v1',
            },
          ),
        ),
      );
      expect(find.text('225'), findsNothing);
      expect(
        find.textContaining('assumed distribution productivity'),
        findsOneWidget,
      );
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'Save persists exact finalized circle before persisted-Zone analysis; preview never writes',
    (t) async {
      final reference = SavedDraftReference();
      var persistedAnalyses = 0;
      await surface(
        t,
        CampaignAreaScreen(
          campaignReference: reference,
          pendingZoneData: const {
            'zoneName': 'Draft Zone',
            'campaignId': 'campaign',
          },
          tileProvider: MapTiles(),
          analyzePersistedZone: () async {
            expect(reference.saved, isNotNull);
            persistedAnalyses++;
            return true;
          },
        ),
      );
      await choose(t, 'Circle');
      await tapMap(t, mapCenter(t));
      expect(reference.saved, isNull);
      await tapMap(t, mapCenter(t) + const Offset(75, 0));
      final geometry = t
          .widget<PolygonLayer>(find.byType(PolygonLayer))
          .polygons
          .single
          .points
          .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
          .toList();
      expect(reference.saved, isNull);
      await choose(t, 'Save Zone');
      expect(reference.saved?['serviceArea'], geometry);
      expect(reference.saved?['serviceAreaPointCount'], 48);
      expect(reference.saved?['serviceAreaType'], 'circle');
      expect(persistedAnalyses, 1);
      await t.pump(const Duration(milliseconds: 350));
      await t.pumpWidget(const SizedBox());
    },
  );
}
