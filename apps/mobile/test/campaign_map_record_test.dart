import 'dart:convert';
import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_app/screens/business/campaign_map_record_screen.dart';

class FixtureTiles extends TileProvider {
  final ImageProvider image = MemoryImage(
    base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN49+7dfwAJYgPK1Rd34wAAAABJRU5ErkJggg==',
    ),
  );
  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) =>
      image;
}

void main() {
  testWidgets(
    'map renders exact saved polygons and exports PNG without writes',
    (t) async {
      await t.binding.setSurfaceSize(const Size(1100, 1300));
      addTearDown(() => t.binding.setSurfaceSize(null));
      var reads = 0;
      final outputs = <({Uint8List bytes, bool print})>[];
      final tileProvider = FixtureTiles();
      await t.runAsync(() async {
        final completer = tileProvider.image.resolve(ImageConfiguration.empty);
        final done = Completer<void>();
        completer.addListener(
          ImageStreamListener(
            (_, _) => done.complete(),
            onError: (e, s) => done.completeError(e, s),
          ),
        );
        await done.future;
      });
      final points = [
        {'latitude': 38.9, 'longitude': -76.8},
        {'latitude': 38.91, 'longitude': -76.8},
        {'latitude': 38.91, 'longitude': -76.79},
      ];
      await t.pumpWidget(
        MaterialApp(
          home: CampaignMapRecordScreen(
            campaignId: 'fixture',
            tileProvider: tileProvider,
            loadRecord: () async {
              reads++;
              return {
                'campaignId': 'fixture',
                'campaignName': 'Synthetic map fixture',
                'businessName': 'Fixture Business',
                'status': 'draft',
                'exportedAt': '2026-09-26T12:00:00Z',
                'territory': points,
                'zones': [
                  {'id': 'one', 'serviceArea': points},
                  {'id': 'two', 'serviceArea': points},
                ],
                'notice': 'Saved planning geography. Not completion evidence.',
              };
            },
            exportRecord: (bytes, print) async {
              outputs.add((bytes: bytes, print: print));
            },
          ),
        ),
      );
      await t.pump();
      for (var i = 0; i < 8; i++) {
        await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 50)),
        );
        await t.pump(const Duration(milliseconds: 500));
      }
      final layer = t.widget<PolygonLayer>(find.byType(PolygonLayer));
      expect(layer.polygons.length, 3);
      expect(layer.polygons.first.points.first.latitude, 38.9);
      expect(layer.polygons.first.points.first.longitude, -76.8);
      expect(find.textContaining('OpenStreetMap'), findsOneWidget);
      expect(
        t
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Download Map'),
            )
            .onPressed,
        isNotNull,
      );
      await t.tap(find.text('Download Map'));
      await t.pump();
      await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 200)),
      );
      await t.pump();
      expect(outputs.length, 1);
      final codec = await t.runAsync(
        () => ui.instantiateImageCodec(outputs.first.bytes),
      );
      final frame = await t.runAsync(() => codec!.getNextFrame());
      expect(frame!.image.width, 1800);
      expect(frame.image.height, greaterThan(1200));
      frame.image.dispose();
      codec!.dispose();
      await t.tap(find.text('Print Map'));
      await t.pump();
      await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 200)),
      );
      await t.pump();
      expect(outputs.length, 2);
      expect(outputs.last.print, true);
      expect(reads, 1);
      await t.pumpWidget(const SizedBox());
    },
  );
}
