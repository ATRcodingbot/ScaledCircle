import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/brand_assets_screen.dart';
import 'package:flutter_app/services/business_media_service.dart';

class _FakeMedia implements BusinessMediaGateway {
  _FakeMedia(this.result);
  Map<String, dynamic> result;
  var brandUpdates = 0;
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
    required List<String> approvedServiceCategories,
  }) async {
    brandUpdates++;
    result = {
      ...result,
      'brandProfile': {
        ...(result['brandProfile'] as Map? ?? const {}),
        'primaryColor': primaryColor,
        'secondaryColor': secondaryColor,
        'stylePreset': stylePreset,
        'approvedServiceCategories': approvedServiceCategories,
      },
    };
  }

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

class _FakeGeneration implements GeneratedVisualGateway {
  _FakeGeneration(this.result);
  Map<String, dynamic> result;
  var requests = 0;
  var processes = 0;
  var approvals = 0;
  var rejections = 0;
  @override
  Future<Map<String, dynamic>> generationWorkspace({String? cursor}) async =>
      result;
  @override
  Future<Map<String, dynamic>> requestGeneration({
    required String requestId,
    required String serviceCategory,
    required String visualDirection,
  }) async {
    requests++;
    return {'jobId': 'job-one', 'status': 'queued'};
  }

  @override
  Future<Map<String, dynamic>> processGeneration(String jobId) async {
    processes++;
    return {'jobId': jobId, 'status': 'review_required'};
  }

  @override
  Future<void> approveGeneration(String jobId) async {
    approvals++;
  }

  @override
  Future<void> rejectGeneration(String jobId) async {
    rejections++;
  }
}

Widget _screen(_FakeMedia media, {_FakeGeneration? generation}) => MaterialApp(
  home: BrandAssetsScreen(
    service: media,
    generationService:
        generation ??
        _FakeGeneration({'capability': 'disabled', 'jobs': <dynamic>[]}),
  ),
);

void main() {
  testWidgets('zero state makes upload optional and obvious', (tester) async {
    await tester.pumpWidget(
      _screen(_FakeMedia({'assets': <dynamic>[], 'hasMore': false})),
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
        _screen(
          _FakeMedia({
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
      _screen(_FakeMedia({'assets': <dynamic>[], 'hasMore': false})),
    );
    await tester.pumpAndSettle();
    expect(find.text('Brand Assets'), findsOneWidget);
    expect(find.text('Upload image'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('local test workflow is truthful, bounded, and review-first', (
    tester,
  ) async {
    final generation = _FakeGeneration({
      'capability': 'test_only',
      'budgetEnabled': true,
      'approvedServiceCategories': ['Decks'],
      'visualDirections': ['clean', 'premium'],
      'disclosure':
          "Service concept image — not a photo of this Business's completed work, team, customers, or property.",
      'jobs': [
        {
          'jobId': 'job-review',
          'status': 'review_required',
          'serviceCategory': 'Decks',
          'visualDirection': 'clean',
        },
      ],
    });
    await tester.pumpWidget(
      _screen(
        _FakeMedia({'assets': <dynamic>[], 'hasMore': false}),
        generation: generation,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Create visuals for me'), findsOneWidget);
    expect(find.textContaining('Generated concept'), findsWidgets);
    expect(find.text('Approve concept'), findsOneWidget);
    expect(find.text('Try another'), findsOneWidget);
    expect(find.text('Remove'), findsOneWidget);
    expect(find.textContaining('not a photo'), findsWidgets);
  });

  testWidgets('deployed disabled capability exposes no generation action', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        _FakeMedia({'assets': <dynamic>[], 'hasMore': false}),
        generation: _FakeGeneration({
          'capability': 'disabled',
          'jobs': <dynamic>[],
        }),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Create visuals for me'), findsNothing);
    expect(find.text('Create service visual'), findsNothing);
  });

  testWidgets('zero services provides a useful choose-services action', (
    tester,
  ) async {
    final media = _FakeMedia({
      'assets': <dynamic>[],
      'hasMore': false,
      'availableServiceCategories': ['Decks'],
      'brandProfile': <String, dynamic>{},
    });
    await tester.pumpWidget(
      _screen(
        media,
        generation: _FakeGeneration({
          'capability': 'enabled',
          'approvedServiceCategories': <dynamic>[],
          'jobs': <dynamic>[],
        }),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Choose at least one service before creating a visual.'),
      findsOneWidget,
    );
    expect(find.text('Choose services'), findsOneWidget);
    expect(find.text('Create service visual'), findsNothing);
  });

  testWidgets('Business selects, saves, and reloads visual services', (
    tester,
  ) async {
    final media = _FakeMedia({
      'assets': <dynamic>[],
      'hasMore': false,
      'availableServiceCategories': ['Decks', 'Kitchen remodeling'],
      'brandProfile': {
        'primaryColor': '#176FD1',
        'secondaryColor': '#10243E',
        'stylePreset': 'clean',
        'approvedServiceCategories': <String>[],
      },
    });
    await tester.pumpWidget(_screen(media));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Brand settings'));
    await tester.pumpAndSettle();
    expect(find.text('Services for visuals'), findsOneWidget);
    await tester.ensureVisible(find.text('Decks'));
    await tester.tap(find.text('Decks'));
    await tester.ensureVisible(find.text('Kitchen remodeling'));
    await tester.tap(find.text('Kitchen remodeling'));
    await tester.ensureVisible(find.text('Save settings'));
    await tester.tap(find.text('Save settings'));
    await tester.pumpAndSettle();
    expect(media.brandUpdates, 1);
    expect((media.result['brandProfile'] as Map)['approvedServiceCategories'], [
      'Decks',
      'Kitchen remodeling',
    ]);
    expect(find.text('Brand settings saved.'), findsOneWidget);

    await tester.tap(find.text('Brand settings'));
    await tester.pumpAndSettle();
    final chips = tester.widgetList<FilterChip>(find.byType(FilterChip));
    expect(chips.where((chip) => chip.selected), hasLength(2));
  });

  testWidgets(
    'Business can add a bounded visual service without a Growth Profile',
    (tester) async {
      final media = _FakeMedia({
        'assets': <dynamic>[],
        'hasMore': false,
        'serviceCategorySource': 'brand_profile_manual',
        'availableServiceCategories': <String>[],
        'brandProfile': {
          'primaryColor': '#176FD1',
          'secondaryColor': '#10243E',
          'stylePreset': 'clean',
          'approvedServiceCategories': <String>[],
        },
      });
      await tester.pumpWidget(_screen(media));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Brand settings'));
      await tester.pumpAndSettle();
      expect(find.text('Add service'), findsOneWidget);
      expect(find.text('Open Growth Profile'), findsNothing);
      await tester.enterText(
        find.byKey(const Key('brand-service-entry')),
        '  Seasonal   cleanup  ',
      );
      await tester.ensureVisible(find.text('Add service'));
      await tester.tap(find.text('Add service'));
      await tester.pump();
      expect(
        find.widgetWithText(FilterChip, 'Seasonal cleanup'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Save settings'));
      await tester.tap(find.text('Save settings'));
      await tester.pumpAndSettle();
      expect(media.brandUpdates, 1);
      expect(
        (media.result['brandProfile'] as Map)['approvedServiceCategories'],
        ['Seasonal cleanup'],
      );
    },
  );
}
