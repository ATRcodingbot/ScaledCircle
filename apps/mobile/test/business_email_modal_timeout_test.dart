import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_email_screen.dart';
import 'package:flutter_app/services/business_email_service.dart';

class PendingEmailService extends BusinessEmailService {
  final calls = <String>[];
  final pending = Completer<Map<String, dynamic>>();
  @override
  Future<Map<String, dynamic>> call(
    String operation, [
    Map<String, dynamic> input = const {},
  ]) {
    calls.add(operation);
    return pending.future;
  }
}

void main() {
  for (final waitForTimeout in [false, true]) {
    testWidgets('pending eligibility can close; timeout=$waitForTimeout', (
      tester,
    ) async {
      final service = PendingEmailService();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: BusinessEmailDraftButton(
              mailbox: const {
                'connection': {'send': true, 'email': 'owner@example.test'},
                'sendEnabled': true,
              },
              prospect: const {
                'id': 'one',
                'email': 'person@example.test',
                'draft': 'A reviewed project question.',
              },
              service: service,
            ),
          ),
        ),
      );
      await tester.tap(find.text('Edit Draft / Approve & Send Email'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review exact email'));
      await tester.pump();
      expect(service.calls, ['saveDraft']);
      if (waitForTimeout) {
        await tester.pump(const Duration(seconds: 31));
        expect(find.textContaining('no send was requested'), findsOneWidget);
        expect(find.text('Send Email'), findsNothing);
      }
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      service.pending.complete({'version': 1});
      await tester.pump();
      expect(service.calls, ['saveDraft']);
      expect(tester.takeException(), isNull);
    });
  }
}
