import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_post_editor.dart';
import 'package:flutter_app/services/social_operations_service.dart';

class EditorService extends SocialOperationsService {
  final calls = <Map<String, dynamic>>[];
  bool fail = false;
  int version = 1;
  Map<String, dynamic> post() => {
    'itemId': 'post',
    'provider': 'facebook',
    'version': version,
    'scheduledFor': DateTime.now()
        .add(const Duration(days: 2))
        .toUtc()
        .toIso8601String(),
    'ready': false,
    'reasons': [],
    'reviewedPost': {
      'variant': {
        'copy': 'Our local project work.',
        'callToAction': 'Learn more',
        'destinationUrl': 'https://example.com/services',
        'mediaRequirement': 'none',
      },
      'images': [],
    },
  };
  @override
  Future<Map<String, dynamic>> previewPost(Map<String, dynamic> post) async =>
      this.post();
  @override
  Future<Map<String, dynamic>> preparePost(Map<String, dynamic> input) async {
    calls.add(input);
    if (fail) throw Exception('private provider detail');
    if (input['action'] == 'save') version++;
    return {'readyToPublish': true, 'variantAssessments': []};
  }

  @override
  Future<Map<String, dynamic>> approveAndSchedulePost(
    Map<String, dynamic> post,
  ) => throw StateError('Preparation cannot approve');
}

void main() {
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
        expect(service.calls, isEmpty);
        await tester.enterText(
          find.byType(TextField).first,
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
        await tester.scrollUntilVisible(
          find.text('Review content quality'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await Scrollable.ensureVisible(
          tester.element(find.text('Review content quality')),
          alignment: 0.5,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Review content quality'));
        await tester.pumpAndSettle();
        expect(service.calls.last['action'], 'assess');
        expect(service.calls.last['version'], 2);
        expect(find.text('Content quality review passed'), findsOneWidget);
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
