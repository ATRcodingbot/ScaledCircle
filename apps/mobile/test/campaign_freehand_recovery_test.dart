import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_app/models/campaign_area_geometry.dart';
import 'package:flutter_app/theme/app_theme.dart';
import 'package:flutter_app/screens/business/campaign_area_screen.dart';
import 'campaign_mapping_interaction_test.dart' as h;

bool usable(WidgetTester t) =>
    t
        .widget<ElevatedButton>(
          find.widgetWithText(ElevatedButton, 'Use This Area'),
        )
        .onPressed !=
    null;

List<Offset> crossing(Offset c) => [
  c + const Offset(-60, -55),
  c + const Offset(60, 55),
  c + const Offset(-60, 55),
  c + const Offset(60, -55),
];
List<Offset> valid(Offset c) => [
  c + const Offset(-65, -55),
  c + const Offset(70, -55),
  c + const Offset(65, 55),
  c + const Offset(-65, 55),
];

Future<void> again(WidgetTester t) async {
  expect(
    find.byKey(const Key('freehand-draw-again')).hitTestable(),
    findsOneWidget,
  );
  await t.tap(find.byKey(const Key('freehand-draw-again')));
  await t.pump();
  await t.pump(const Duration(milliseconds: 50));
}

Future<void> render(WidgetTester t, GlobalKey key, String name) async {
  final directory = Platform.environment['FREEHAND_RENDER_DIR'];
  if (directory == null) return;
  await t.runAsync(() async {
    final image =
        await (key.currentContext!.findRenderObject() as RenderRepaintBoundary)
            .toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File(
      '$directory/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(() async {
    if (Platform.environment['FREEHAND_RENDER_DIR'] == null) return;
    final root = Platform.environment['FREEHAND_RENDER_FONTS']!;
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
  for (final kind in [ui.PointerDeviceKind.mouse, ui.PointerDeviceKind.touch]) {
    testWidgets(
      '$kind repeated rejection -> visible Draw Again -> valid stroke, no writes',
      (t) async {
        final reference = h.DraftReference();
        final controller = MapController();
        addTearDown(controller.dispose);
        await h.surface(
          t,
          h.draft(
            reference,
            controller: controller,
            initialArea: h.glenBurnie.geometry,
          ),
        );
        final original = List<LatLng>.of(h.boundary(t));
        await h.choose(t, 'Edit Boundary');
        for (var attempt = 0; attempt < 3; attempt++) {
          await h.trace(t, crossing(h.mapCenter(t)), kind: kind);
          await t.pump();
          expect(usable(t), false);
          expect(h.boundary(t), original);
          expect(find.textContaining('make a clear area'), findsOneWidget);
          expect(
            find.byKey(const Key('freehand-recovery-cancel')).hitTestable(),
            findsOneWidget,
          );
          final center = controller.camera.center;
          await t.dragFrom(h.mapCenter(t), const Offset(20, 15));
          await t.pump(const Duration(milliseconds: 350));
          expect(controller.camera.center, isNot(center));
          await again(t);
        }
        await h.trace(t, valid(h.mapCenter(t)), kind: kind);
        expect(usable(t), true);
        expect(h.boundary(t), isNot(original));
        expect(find.byKey(const Key('freehand-draw-again')), findsNothing);
        expect(reference.calls, 0);
        await h.choose(t, 'Undo');
        expect(h.boundary(t), original);
        await h.choose(t, 'Clear');
        expect(
          t.widget<PolygonLayer>(find.byType(PolygonLayer)).polygons,
          isEmpty,
        );
        await h.choose(t, 'Undo');
        expect(h.boundary(t), original);
        expect(usable(t), true);
        expect(reference.calls, 0);
        await t.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'pointer cancel and second-touch interruptions both recover in same editor',
    (t) async {
      final reference = h.DraftReference();
      await h.surface(t, h.draft(reference));
      await h.choose(t, 'Draw Area');
      final gesture = await t.startGesture(h.mapCenter(t), pointer: 4);
      await gesture.moveBy(const Offset(40, 30));
      await gesture.cancel();
      await t.pump();
      expect(find.textContaining('interrupted'), findsOneWidget);
      expect(usable(t), false);
      await again(t);
      final first = await t.startGesture(h.mapCenter(t), pointer: 5);
      final second = await t.startGesture(
        h.mapCenter(t) + const Offset(30, 0),
        pointer: 6,
      );
      await second.up();
      await first.up();
      await t.pump();
      expect(find.textContaining('one finger at a time'), findsOneWidget);
      await again(t);
      await h.trace(t, valid(h.mapCenter(t)), kind: ui.PointerDeviceKind.touch);
      expect(usable(t), true);
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'repaired preview invalidates old facts, late old response ignored, Cancel/reopen restores',
    (t) async {
      final reference = h.DraftReference();
      var controller = MapController();
      addTearDown(controller.dispose);
      final originalDigest = CampaignAreaGeometry.savedDigest(
        h.glenBurnie.geometry,
      );
      final requested = <Map<String, dynamic>>[];
      final responses = <Completer<Map<String, dynamic>>>[];
      Map<String, dynamic> evidence(
        Map<String, dynamic> input,
        int targets,
      ) => {
        'version': 'ZoneIntelligenceV1',
        'geometryDigest': CampaignAreaGeometry.savedDigest(input['geometry']),
        'status': 'available',
        'mappedTargetCount': targets,
        'supportingStreetMeters': targets * 10,
        'workload': {'minutes': targets == 7 ? 18 : 24, 'oneScaler': true},
      };
      await t.binding.setSurfaceSize(const Size(1100, 1900));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => CampaignAreaScreen(
                      campaignReference: reference,
                      pendingZoneData: const {
                        'zoneName': 'Saved fixture Zone',
                        'campaignId': 'fixture-campaign',
                      },
                      initialArea: h.glenBurnie.geometry,
                      tileProvider: h.MapTiles(),
                      mapController: controller,
                      zoneEvidenceIdentity: () => 'fixture-owner',
                      zoneEvidenceLoader: (input) {
                        requested.add(Map<String, dynamic>.from(input));
                        final response = Completer<Map<String, dynamic>>();
                        responses.add(response);
                        return response.future;
                      },
                    ),
                  ),
                ),
                child: const Text('Open saved fixture'),
              ),
            ),
          ),
        ),
      );
      await h.choose(t, 'Open saved fixture');
      await t.pump(const Duration(milliseconds: 600));
      responses[0].complete(evidence(requested[0], 10));
      await t.pump();
      expect(find.text('10 mapped residential targets'), findsOneWidget);
      await h.choose(t, 'Edit Boundary');
      expect(find.text('10 mapped residential targets'), findsNothing);
      // Start and cancel drawing once, leaving a pending old-geometry request.
      await h.choose(t, 'Cancel drawing');
      await t.pump(const Duration(milliseconds: 600));
      final oldRequest = responses.length - 1;
      await h.choose(t, 'Edit Boundary');
      final c = h.mapCenter(t);
      // Zoom in enough that a short mouse backtrack is within the 5m ceiling.
      controller.move(controller.camera.center, 18);
      await t.pump();
      await h.trace(t, [
        c + const Offset(-60, -50),
        c + const Offset(60, -50),
        c + const Offset(57, -50),
        c + const Offset(60, 50),
        c + const Offset(-60, 50),
      ]);
      expect(usable(t), true);
      expect(find.byKey(const Key('freehand-repair-notice')), findsOneWidget);
      final repaired = List<LatLng>.of(h.boundary(t));
      await h.choose(t, 'Compare original outline');
      expect(find.byType(PolylineLayer), findsOneWidget);
      expect(h.boundary(t), repaired);
      await h.choose(t, 'Hide original outline');
      expect(find.byType(PolylineLayer), findsNothing);
      expect(h.boundary(t), repaired);
      expect(find.text('10 mapped residential targets'), findsNothing);
      final newGeometry = h
          .boundary(t)
          .map((p) => {'latitude': p.latitude, 'longitude': p.longitude})
          .toList();
      expect(
        CampaignAreaGeometry.savedDigest(newGeometry),
        isNot(originalDigest),
      );
      responses[oldRequest].complete(evidence(requested[oldRequest], 99));
      await t.pump(const Duration(milliseconds: 600));
      expect(find.text('99 mapped residential targets'), findsNothing);
      expect(
        CampaignAreaGeometry.savedDigest(requested.last['geometry']),
        CampaignAreaGeometry.savedDigest(newGeometry),
      );
      responses.last.complete(evidence(requested.last, 7));
      await t.pump();
      expect(find.text('7 mapped residential targets'), findsOneWidget);
      expect(find.text('~18 min'), findsOneWidget);
      expect(reference.calls, 0);
      await h.choose(t, 'Cancel');
      await t.pump(const Duration(milliseconds: 400));
      controller = MapController();
      addTearDown(controller.dispose);
      await h.choose(t, 'Open saved fixture');
      await t.pump(const Duration(milliseconds: 600));
      expect(
        CampaignAreaGeometry.savedDigest(requested.last['geometry']),
        originalDigest,
      );
      responses.last.complete(evidence(requested.last, 10));
      await t.pump();
      expect(find.text('10 mapped residential targets'), findsOneWidget);
      expect(
        h.boundary(t),
        h.glenBurnie.geometry
            .map((p) => LatLng(p['latitude']!, p['longitude']!))
            .toList(),
      );
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    '390px 2x text recovery is reachable and renders before/after actual editor',
    (t) async {
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final reference = h.DraftReference();
      final key = GlobalKey();
      final base = AppTheme.darkTheme;
      ButtonStyle font(ButtonStyle value) => value.copyWith(
        textStyle: WidgetStatePropertyAll(
          value.textStyle!.resolve({})!.copyWith(fontFamily: 'Roboto'),
        ),
      );
      // Use the app theme's same sizes/weights with the loaded system font;
      // standalone button/AppBar styles otherwise use Flutter's square test font.
      final renderTheme = base.copyWith(
        textTheme: base.textTheme.apply(fontFamily: 'Roboto'),
        appBarTheme: base.appBarTheme.copyWith(
          titleTextStyle: base.appBarTheme.titleTextStyle!.copyWith(
            fontFamily: 'Roboto',
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: font(base.filledButtonTheme.style!),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: font(base.elevatedButtonTheme.style!),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: font(base.outlinedButtonTheme.style!),
        ),
        textButtonTheme: TextButtonThemeData(
          style: font(base.textButtonTheme.style!),
        ),
      );
      await t.pumpWidget(
        RepaintBoundary(
          key: key,
          child: MaterialApp(
            theme: renderTheme,
            debugShowCheckedModeBanner: false,
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(2)),
              child: child!,
            ),
            home: h.draft(reference),
          ),
        ),
      );
      await t.pump();
      await h.choose(t, 'Draw Area');
      await h.trace(
        t,
        crossing(h.mapCenter(t)),
        kind: ui.PointerDeviceKind.touch,
      );
      expect(usable(t), false);
      expect(t.takeException(), isNull);
      expect(
        find.byKey(const Key('freehand-recovery-cancel')).hitTestable(),
        findsOneWidget,
      );
      await render(t, key, 'freehand-error-recovery-narrow-2x');
      await again(t);
      await h.trace(t, valid(h.mapCenter(t)), kind: ui.PointerDeviceKind.touch);
      expect(usable(t), true);
      await t.ensureVisible(find.text('Use This Area'));
      await t.pump();
      expect(find.text('Use This Area').hitTestable(), findsOneWidget);
      expect(t.takeException(), isNull);
      await render(t, key, 'freehand-success-after-retry-narrow-2x');
      expect(reference.calls, 0);
      await t.pumpWidget(const SizedBox());
    },
  );
}
