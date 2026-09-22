import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_app/screens/business/business_email_screen.dart';
import 'package:flutter_app/services/business_email_service.dart';

class LinkFixture extends BusinessEmailService {
  final calls = <String>[];
  Object? failure;
  @override
  Future<Map<String, dynamic>> call(
    String op, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(op);
    expect(op, 'loadConversation');
    expect(input['operationId'], 'original-inquiry');
    if (failure != null) throw failure!;
    return {
      'businessId': 'owner',
      'operation': {
        'id': 'original-inquiry',
        'recipient': 'controlled@example.test',
        'subject': 'Pricing inquiry',
      },
      'replies': <dynamic>[],
      'appointments': <dynamic>[],
      'canManage': false,
    };
  }
}

void main() {
  testWidgets(
    'external operation bypasses unrelated workspace load and refresh retains exact target',
    (t) async {
      final service = LinkFixture();
      Future<void> open() async {
        await t.pumpWidget(
          MaterialApp(
            home: BusinessEmailScreen(
              service: service,
              initialOperationId: 'original-inquiry',
            ),
          ),
        );
        await t.pumpAndSettle();
      }

      await open();
      expect(find.text('controlled@example.test'), findsOneWidget);
      expect(service.calls, ['loadConversation']);
      await t.pumpWidget(const SizedBox());
      await open();
      expect(service.calls, ['loadConversation', 'loadConversation']);
    },
  );
  testWidgets(
    'temporary failure is not membership denial and retry preserves target',
    (t) async {
      final service = LinkFixture()
        ..failure = FirebaseFunctionsException(
          code: 'unavailable',
          message: 'private',
        );
      await t.pumpWidget(
        MaterialApp(
          home: BusinessEmailScreen(
            service: service,
            initialOperationId: 'original-inquiry',
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.textContaining('temporarily unavailable'), findsOneWidget);
      expect(find.textContaining('eligible membership'), findsNothing);
      expect(find.text('Sign in with another account'), findsOneWidget);
      service.failure = null;
      await t.tap(find.text('Retry'));
      await t.pumpAndSettle();
      expect(find.text('controlled@example.test'), findsOneWidget);
      expect(service.calls.length, 2);
    },
  );
  test(
    'safe errors distinguish auth, denied, missing and temporary states',
    () {
      for (final c in [
        'unauthenticated',
        'permission-denied',
        'not-found',
        'unavailable',
      ])
        expect(
          businessEmailLoadError(
            FirebaseFunctionsException(code: c, message: 'SECRET'),
          ),
          isNot(contains('SECRET')),
        );
      expect(
        businessEmailLoadError(
          FirebaseFunctionsException(
            code: 'permission-denied',
            message: 'private',
          ),
        ),
        contains('Switch'),
      );
    },
  );
}
