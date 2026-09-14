import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_post_editor.dart';
import 'package:flutter_app/widgets/social_asset_choice.dart';
import 'customer_social_editor_test.dart' show InlineEditorService;

class RegenService extends InlineEditorService {
  final completion = Completer<Map<String, dynamic>>();
  bool available = true;
  @override
  Future<Map<String, dynamic>> generationAvailability() async => {
    'availability': {
      'available': available,
      'message': 'Creative generation is temporarily unavailable.',
    },
    'usage': {'used': 5, 'total': 60, 'remaining': 55},
  };
  @override
  Future<Map<String, dynamic>> preparePost(Map<String, dynamic> input) async {
    calls.add(input);
    if (input['action'] == 'regenerate') return completion.future;
    return {};
  }
}

class QueuePreparationService extends RegenService {
  bool pending = true;
  @override
  Map<String, dynamic> post() => {
    ...super.post(),
    'version': pending ? 1 : 2,
    'ready': !pending,
    'creativeNeedsPreparation': pending,
    'reviewState': pending ? 'preparing_creative' : 'ready_for_review',
  };
  @override
  Future<Map<String, dynamic>> preparePost(Map<String, dynamic> input) async {
    calls.add(input);
    return {'creativeStatus': 'preparing'};
  }
}

void main() {
  testWidgets(
    'Preview waits for queue preparation and uses its reconciled version',
    (tester) async {
      final service = QueuePreparationService();
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSocialPostEditor(
            post: service.post(),
            service: service,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 350));
      await tester.scrollUntilVisible(
        find.text('Regenerate Image'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Regenerate Image'),
            )
            .onPressed,
        isNull,
      );
      service.pending = false;
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Regenerate Image'),
            )
            .onPressed,
        isNotNull,
      );
      expect(service.calls.length, 1);
      expect(service.calls.single['action'], 'auto');
      expect(find.text('Preparing your preview…'), findsNothing);
    },
  );

  testWidgets(
    'rejected regeneration clears its preparing notice and makes no automatic retry',
    (tester) async {
      final service = RegenService();
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSocialPostEditor(
            post: service.post(),
            service: service,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Regenerate Image'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Regenerate Image'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Regenerate Image'));
      await tester.pump(const Duration(milliseconds: 350));
      service.completion.completeError(StateError('Draft changed'));
      await tester.pumpAndSettle();
      expect(find.text('Preparing new creative…'), findsNothing);
      await tester.scrollUntilVisible(
        find.textContaining('could not confirm'),
        -180,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.textContaining('could not confirm'), findsOneWidget);
      expect(service.calls.length, 1);
      expect(service.calls.single['action'], 'regenerate');
    },
  );

  testWidgets(
    'Regenerate stays in Preview, calls generation, returns status and never opens asset selection',
    (tester) async {
      final service = RegenService();
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSocialPostEditor(
            post: service.post(),
            service: service,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Regenerate Image'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Regenerate Image'));
      await tester.pumpAndSettle();
      expect(find.textContaining('55 concepts remaining'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Regenerate Image'));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.scrollUntilVisible(
        find.text('Preparing new creative…'),
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Preparing new creative…'), findsOneWidget);
      expect(service.calls.single['action'], 'regenerate');
      expect(service.calls.single['confirmRegeneration'], true);
      expect(find.text('Choose approved creative'), findsNothing);
      service.completion.complete({'creativeStatus': 'concept_needs_review'});
      await tester.pumpAndSettle();
      expect(find.byType(CustomerSocialPostEditor), findsOneWidget);
      expect(find.textContaining('New creative prepared.'), findsOneWidget);
      expect(
        service.calls.any(
          (c) => c['action'] == 'attach' || c['action'] == 'approve',
        ),
        false,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'unavailable generation is disabled, with truthful alternatives',
    (tester) async {
      final service = RegenService()..available = false;
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSocialPostEditor(
            post: service.post(),
            service: service,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Regenerate Image'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Regenerate Image'),
            )
            .onPressed,
        isNull,
      );
      expect(
        find.text('Creative generation is temporarily unavailable.'),
        findsOneWidget,
      );
      expect(find.text('Use Different Asset'), findsOneWidget);
    },
  );
  testWidgets(
    'asset chooser shows concept, origin and use history with wrapping',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 320,
              child: SocialAssetChoice(
                asset: const {'title': 'Fence'},
                history: const {
                  'conceptLabel': 'Horizontal-board privacy fence and gate',
                  'origin': 'Generated concept',
                  'lastUsed': '2026-09-14T12:00:00Z',
                  'lastPlatform': 'facebook',
                  'recentUses': 3,
                  'plannedUses': 0,
                  'overused': true,
                },
                load: () async => null,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Horizontal-board privacy fence and gate'),
        findsOneWidget,
      );
      expect(find.textContaining('3 scheduled/published uses'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
