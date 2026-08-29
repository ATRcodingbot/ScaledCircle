import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/brand_assets_screen.dart';
import 'package:flutter_app/services/business_media_service.dart';

class _FakeMedia implements BusinessMediaGateway {
  _FakeMedia(this.result);
  final Map<String, dynamic> result;
  @override
  Future<Map<String, dynamic>> workspace({String? cursor}) async => result;
  @override
  Future<Uint8List?> previewBytes(Map<String, dynamic> asset) async => null;
  @override
  Future<void> approve(String assetId, String revisionId) async {}
  @override
  Future<void> reject(String assetId, String revisionId) async {}
  @override
  Future<void> remove(String assetId) async {}
  @override
  Future<void> selectLogo(String assetId, String revisionId) async {}
  @override
  Future<void> updateBrand({
    required String primaryColor,
    required String secondaryColor,
    required String stylePreset,
  }) async {}
  @override
  Future<void> saveReviewMetadata({
    required String assetId,
    required String revisionId,
    required String altText,
    required String serviceLabel,
    required bool rightsAttestation,
  }) async {}
  @override
  Future<void> upload({
    required Uint8List bytes,
    required String filename,
    required String purpose,
    String? assetId,
  }) async {}
}

void main() {
  testWidgets('zero state makes upload optional and obvious', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: BrandAssetsScreen(
          service: _FakeMedia({'assets': <dynamic>[], 'hasMore': false}),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Add your logo or photos'), findsOneWidget);
    expect(find.textContaining('still use ScaledCircle'), findsOneWidget);
    expect(find.text('Upload image'), findsWidgets);
  });

  testWidgets(
    'ready revision exposes review, replace, remove, and textual status',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: BrandAssetsScreen(
            service: _FakeMedia({
              'hasMore': false,
              'assets': [
                {
                  'assetId': 'asset-one',
                  'title': 'Deck photo',
                  'purpose': 'service_visual',
                  'removed': false,
                  'revision': {
                    'revisionId': 'revision-one',
                    'status': 'ready',
                    'approvalStatus': 'pending',
                    'altText': '',
                    'renditions': <String, dynamic>{},
                  },
                },
              ],
            }),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Ready for review'), findsOneWidget);
      expect(find.text('Review'), findsOneWidget);
      expect(find.text('Reject'), findsOneWidget);
      expect(find.text('Replace'), findsOneWidget);
      expect(find.text('Remove'), findsOneWidget);
    },
  );

  testWidgets('Brand Assets remains usable at 390 by 844', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: BrandAssetsScreen(
          service: _FakeMedia({'assets': <dynamic>[], 'hasMore': false}),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Brand Assets'), findsOneWidget);
    expect(find.text('Upload image'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
