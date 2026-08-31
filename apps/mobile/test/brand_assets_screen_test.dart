import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/brand_assets_screen.dart';
import 'package:flutter_app/services/business_media_service.dart';

class _FakeMedia implements BusinessMediaGateway {
  _FakeMedia(this.result, {this.preview, this.previewError});
  Map<String, dynamic> result;
  Uint8List? preview;
  Object? previewError;
  var brandUpdates = 0;
  @override
  Future<Map<String, dynamic>> workspace({String? cursor}) async => result;
  @override
  Future<Uint8List?> previewBytes(Map<String, dynamic> asset) async {
    if (previewError != null) throw previewError!;
    return preview;
  }

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
  final validPng = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZ7hG3sAAAAASUVORK5CYII=',
  );
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

  testWidgets('generated review shows the exact authenticated preview', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        _FakeMedia({
          'hasMore': false,
          'assets': [
            {
              'assetId': 'generated-one',
              'title': 'Seasonal cleanup generated concept',
              'purpose': 'service_visual',
              'revision': {
                'revisionId': 'generated-revision',
                'status': 'ready',
                'approvalStatus': 'pending',
                'origin': 'generated_service_concept',
                'altText': 'Generated seasonal cleanup concept',
                'renditions': {
                  'card': {'storagePath': 'private/card.webp'},
                },
              },
            },
          ],
        }, preview: validPng),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.bySemanticsLabel('Generated seasonal cleanup concept'),
      findsOneWidget,
    );
    expect(find.text('Preview unavailable'), findsNothing);
    expect(find.text('Generated concept'), findsOneWidget);
  });

  testWidgets('preview failure is explicit and retryable', (tester) async {
    await tester.pumpWidget(
      _screen(
        _FakeMedia({
          'hasMore': false,
          'assets': [
            {
              'assetId': 'generated-one',
              'title': 'Generated concept',
              'purpose': 'service_visual',
              'revision': {
                'revisionId': 'generated-revision',
                'status': 'ready',
                'approvalStatus': 'pending',
                'origin': 'generated_service_concept',
                'renditions': {
                  'card': {'storagePath': 'private/card.webp'},
                },
              },
            },
          ],
        }, previewError: Exception('storage failure')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Preview unavailable'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.textContaining('storage failure'), findsNothing);
  });

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
      'businessAuthorized': true,
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
    expect(find.text('Try another · Uses 1 generated visual'), findsOneWidget);
    expect(find.text('Remove'), findsOneWidget);
    expect(find.textContaining('not a photo'), findsWidgets);
  });

  testWidgets('commercial usage and Try another cost are explicit', (
    tester,
  ) async {
    final generation = _FakeGeneration({
      'capability': 'enabled',
      'businessAuthorized': true,
      'budgetEnabled': true,
      'approvedServiceCategories': ['Decks'],
      'usage': {
        'used': 3,
        'pending': 0,
        'total': 5,
        'remaining': 2,
        'resetAt': DateTime.utc(2026, 9, 1).millisecondsSinceEpoch,
      },
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
    expect(find.textContaining('3 of 5 used this month'), findsOneWidget);
    expect(find.textContaining('Resets September 1'), findsOneWidget);
    expect(find.text('Try another · Uses 1 generated visual'), findsOneWidget);
  });

  testWidgets('provider-disabled Beta keeps usage and alternatives visible', (
    tester,
  ) async {
    final generation = _FakeGeneration({
      'capability': 'disabled',
      'businessAuthorized': true,
      'usage': {
        'used': 0,
        'pending': 0,
        'total': 60,
        'remaining': 60,
        'resetAt': DateTime.utc(2026, 9, 1).millisecondsSinceEpoch,
      },
      'jobs': <dynamic>[],
    });
    await tester.pumpWidget(
      _screen(
        _FakeMedia({'assets': <dynamic>[], 'hasMore': false}),
        generation: generation,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Beta'), findsOneWidget);
    expect(find.textContaining('0 of 60 used this month'), findsOneWidget);
    expect(find.textContaining('Resets September 1'), findsOneWidget);
    expect(
      find.textContaining('Try another uses 1 generated visual'),
      findsOneWidget,
    );
    expect(find.textContaining('temporarily unavailable'), findsOneWidget);
    expect(find.textContaining('upload your own photo'), findsOneWidget);
  });

  testWidgets('monthly limit preserves useful no-generation alternatives', (
    tester,
  ) async {
    final generation = _FakeGeneration({
      'capability': 'enabled',
      'businessAuthorized': true,
      'budgetEnabled': true,
      'approvedServiceCategories': ['Decks'],
      'usage': {
        'used': 5,
        'pending': 0,
        'total': 5,
        'remaining': 0,
        'limitReached': true,
        'resetAt': DateTime.utc(2026, 9, 1).millisecondsSinceEpoch,
      },
      'jobs': <dynamic>[],
    });
    await tester.pumpWidget(
      _screen(
        _FakeMedia({'assets': <dynamic>[], 'hasMore': false}),
        generation: generation,
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.textContaining('used your generated visuals for this period'),
      findsOneWidget,
    );
    expect(find.text('Upload your own photo'), findsOneWidget);
    expect(find.text('Existing visuals remain usable'), findsOneWidget);
    expect(
      find.text('Publishing without a photo is available'),
      findsOneWidget,
    );
    expect(find.text('Create service visual'), findsNothing);
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

  testWidgets('non-authorized Business has no generated visual dispatch path', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        _FakeMedia({'assets': <dynamic>[], 'hasMore': false}),
        generation: _FakeGeneration({
          'capability': 'enabled',
          'businessAuthorized': false,
          'approvedServiceCategories': ['Decks'],
          'jobs': <dynamic>[],
        }),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Create visuals for me'), findsNothing);
    expect(find.text('Create service visual'), findsNothing);
    expect(
      find.textContaining('available for this account yet'),
      findsOneWidget,
    );
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
          'businessAuthorized': true,
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
