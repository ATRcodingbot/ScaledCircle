import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_post_editor.dart';
import 'package:flutter_app/services/social_operations_service.dart';

class EditorService extends SocialOperationsService {
  final calls = <Map<String, dynamic>>[];
  bool fail = false;
  String? imageUrl;
  int version = 1;
  Map<String, dynamic> post() => {
    'itemId': 'post',
    'provider': 'facebook',
    'version': version,
    'scheduledFor': DateTime.now()
        .add(const Duration(days: 2))
        .toUtc()
        .toIso8601String(),
    'ready': imageUrl != null,
    'reasons': [],
    'reviewedPost': {
      'variant': {
        'copy': 'Our local project work.',
        'callToAction': 'Learn more',
        'destinationUrl': 'https://example.com/services',
        'mediaRequirement': 'none',
      },
      'images': [
        if (imageUrl != null) {'url': imageUrl},
      ],
    },
  };
  @override
  Future<Map<String, dynamic>> generationAvailability() async => {
    'availability': {'available': true},
    'usage': {'used': 5, 'total': 60, 'remaining': 55},
  };
  @override
  Future<Map<String, dynamic>> previewPost(Map<String, dynamic> post) async =>
      this.post();
  @override
  Future<Map<String, dynamic>> preparePost(Map<String, dynamic> input) async {
    calls.add(input);
    if (fail) throw Exception('private provider detail');
    if (input['action'] == 'save') version++;
    return {
      'quality': {'readyToPublish': true, 'variantAssessments': []},
    };
  }

  @override
  Future<Map<String, dynamic>> approveAndSchedulePost(
    Map<String, dynamic> post,
  ) => throw StateError('Preparation cannot approve');
}

class InlineEditorService extends EditorService {
  final bytes = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwdgk1dgllgFAAFdYDMQlC68kAAAAASUVORK5CYII=',
  );
  bool badBytes = false;
  @override
  Map<String, dynamic> post() => {
    ...super.post(),
    'ready': true,
    'reviewState': 'ready_for_review',
    'creativeNeedsPreparation': false,
    'inlineCreativeApproval': {'digest': 'exact-review'},
    'reviewCandidate': {
      'sha256': sha256.convert(bytes).toString(),
      'storagePath': 'private-concept',
      'width': 1024,
      'height': 1024,
      'status': 'pending_owner_review',
      'approved': false,
      'disclosure': 'Service concept — not completed Business work.',
    },
  };
  @override
  Future<Uint8List?> previewCreative(Map<String, dynamic> candidate) async =>
      badBytes ? Uint8List.fromList([1, 2, 3]) : bytes;
}

void main() {
  for (final corrupt in [false, true]) {
    testWidgets(
      'inline exact creative approval requires decoded verified bytes: corrupt=$corrupt',
      (tester) async {
        tester.view.physicalSize = const Size(375, 812);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final service = InlineEditorService()..badBytes = corrupt;
        var confirmations = 0;
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(2)),
              child: child!,
            ),
            home: CustomerSocialPostEditor(
              post: service.post(),
              service: service,
              onSchedule: (post) async {
                expect(
                  post['inlineCreativeApproval']['digest'],
                  'exact-review',
                );
                confirmations++;
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        if (!corrupt) {
          await tester.runAsync(
            () => precacheImage(
              MemoryImage(service.bytes),
              tester.element(find.byType(CustomerSocialPostEditor)),
            ),
          );
          await tester.pumpAndSettle();
        }
        expect(confirmations, 0);
        await tester.scrollUntilVisible(
          find.text('Approve & Schedule'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        final button = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Approve & Schedule'),
        );
        expect(button.onPressed, corrupt ? isNull : isNotNull);
        expect(find.text('Ready for your review'), findsNothing);
        expect(
          find.textContaining('Creative needs attention. Automatic'),
          findsNothing,
        );
        if (!corrupt) {
          await Scrollable.ensureVisible(tester.element(find.text('Approve & Schedule')), alignment: 0.5);
          await tester.pumpAndSettle();
          await tester.tap(find.text('Approve & Schedule'));
          await tester.pumpAndSettle();
          expect(confirmations, 1);
        }
        expect(service.calls, isEmpty);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('an unavailable preview image cannot be approved', (
    tester,
  ) async {
    final service = EditorService()
      ..imageUrl = 'https://example.test/unavailable.jpg';
    var approvals = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerSocialPostEditor(
          post: service.post(),
          service: service,
          onSchedule: (_) async {
            approvals++;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Image preview unavailable. Reload before approval.'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.text('Approve & Schedule'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Approve & Schedule'),
    );
    expect(button.onPressed, isNull);
    expect(approvals, 0);
    expect(tester.takeException(), isNull);
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'narrow editor keeps owner text, exact version and no implicit approval at text scale $scale',
      (tester) async {
        tester.view.physicalSize = const Size(360, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final service = EditorService();
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: CustomerSocialPostEditor(
              post: service.post(),
              service: service,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(service.calls.single['action'], 'auto');
        expect(service.calls.single['confirmOwnerExecution'], true);
        service.calls.clear();
        await tester.scrollUntilVisible(
          find.text('Edit Post'),
          150,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(find.text('Edit Post'));
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.byKey(const ValueKey('social-post-copy')),
          -150,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.enterText(
          find.byKey(const ValueKey('social-post-copy')),
          'Edited by the Business owner.',
        );
        service.fail = true;
        await tester.scrollUntilVisible(
          find.text('Save draft changes'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await Scrollable.ensureVisible(
          tester.element(find.text('Save draft changes')),
          alignment: 0.5,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Save draft changes'));
        await tester.pumpAndSettle();
        expect(service.calls.single['version'], 1);
        expect(service.calls.single['textOnly'], true);
        await tester.scrollUntilVisible(
          find.text('Post text'),
          -250,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text('Edited by the Business owner.'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.textContaining('could not confirm'),
          -250,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.textContaining('could not confirm'), findsOneWidget);
        expect(find.textContaining('private provider'), findsNothing);
        service.fail = false;
        await tester.scrollUntilVisible(
          find.text('Save draft changes'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await Scrollable.ensureVisible(
          tester.element(find.text('Save draft changes')),
          alignment: 0.5,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Save draft changes'));
        await tester.pumpAndSettle();
        expect(service.version, 2);
        expect(find.text('Review content quality'), findsNothing);
        expect(service.calls.last['action'], 'save');
        expect(
          service.calls.where(
            (c) => c['action'] == 'approve' || c['action'] == 'schedule',
          ),
          isEmpty,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
