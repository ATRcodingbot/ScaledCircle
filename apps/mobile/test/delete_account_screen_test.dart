import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/auth/delete_account_screen.dart';

void main() {
  testWidgets('obligations block deletion and no Auth mutation is attempted', (
    tester,
  ) async {
    var reauth = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: DeleteAccountScreen(
          staging: true,
          call: (_) async => {
            'canDelete': false,
            'blockers': ['Resolve your Wallet balance first.'],
          },
          reauthenticate: (_) async {
            reauth++;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Resolve your Wallet balance first.'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
    expect(reauth, 0);
  });
  testWidgets(
    'typed confirmation, explicit dialog and reauthentication precede authoritative delete',
    (tester) async {
      final events = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: DeleteAccountScreen(
            staging: true,
            call: (input) async {
              events.add(input['action']);
              return input['action'] == 'get'
                ? {'canDelete': true, 'blockers': [], 'email': 'invited@example.test'}
                  : {'deleted': true};
            },
            reauthenticate: (_) async {
              events.add('reauth');
            },
            onDeleted: () async {
              events.add('signout');
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Account: invited@example.test'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextField, 'Type DELETE to confirm'),
        'DELETE',
      );
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Delete Account'));
      await tester.pumpAndSettle();
      expect(events, ['get']);
      await tester.tap(
        find.widgetWithText(FilledButton, 'Delete Account').last,
      );
      await tester.pumpAndSettle();
      expect(events, ['get', 'reauth', 'delete', 'signout']);
      expect(find.text('Account deleted'), findsOneWidget);
    },
  );
}
