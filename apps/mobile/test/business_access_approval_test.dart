import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/business_access_approval_screen.dart';

void main() {
  final pending = <String, dynamic>{
    'uid': 'business-owner',
    'email': 'owner@example.test',
    'businessName': 'Example Business',
    'state': 'Pending',
    'eligible': true,
    'approved': false,
    'reason': null,
  };
  for (final width in [360.0, 1100.0]) {
    testWidgets('review and intentional approval at width $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final calls = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessAccessApprovalScreen(
            call: (name, input) async {
              calls.add(name);
              if (name == 'getBusinessAccessApproval') {
                expect(input, {'email': 'owner@example.test'});
                return pending;
              }
              expect(input, {'uid': 'business-owner'});
              return {
                ...pending,
                'state': 'Approved',
                'eligible': false,
                'approved': true,
              };
            },
          ),
        ),
      );
      expect(find.text('Approve Business'), findsNothing);
      await tester.enterText(find.byType(TextField), 'owner@example.test');
      await tester.tap(find.text('Review Business'));
      await tester.pumpAndSettle();
      expect(find.text('Access: Pending'), findsOneWidget);
      await tester.tap(find.text('Approve Business'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('does not activate a subscription'),
        findsOneWidget,
      );
      expect(calls, ['getBusinessAccessApproval']);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(calls.length, 1);
      await tester.tap(find.text('Approve Business'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm approval'));
      await tester.pumpAndSettle();
      expect(calls, ['getBusinessAccessApproval', 'approveBusinessAccess']);
      expect(find.text('Access: Approved'), findsOneWidget);
      expect(find.text('Approve Business'), findsNothing);
      expect(find.text('business-owner'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'failure is recoverable and never claims success; edited target invalidates preview',
    (tester) async {
      var attempts = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessAccessApprovalScreen(
            call: (name, input) async {
              if (name == 'getBusinessAccessApproval') return pending;
              attempts++;
              throw FirebaseFunctionsException(
                code: 'failed-precondition',
                message: 'Current Terms are required.',
              );
            },
          ),
        ),
      );
      await tester.enterText(find.byType(TextField), 'owner@example.test');
      await tester.tap(find.text('Review Business'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Approve Business'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm approval'));
      await tester.pumpAndSettle();
      expect(attempts, 1);
      expect(find.text('Access: Approved'), findsNothing);
      expect(find.text('Current Terms are required.'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'other@example.test');
      await tester.pump();
      expect(find.text('Approve Business'), findsNothing);
      expect(find.text('Example Business'), findsNothing);
    },
  );
  testWidgets(
    'blocked and already approved Businesses have no approval button',
    (tester) async {
      for (final state in ['Unavailable', 'Approved']) {
        await tester.pumpWidget(
          MaterialApp(
            home: BusinessAccessApprovalScreen(
              key: ValueKey(state),
              call: (name, input) async => {
                ...pending,
                'state': state,
                'eligible': false,
                'approved': state == 'Approved',
                'reason': state == 'Unavailable'
                    ? 'This Business is disabled.'
                    : null,
              },
            ),
          ),
        );
        await tester.enterText(find.byType(TextField), 'owner@example.test');
        await tester.tap(find.text('Review Business'));
        await tester.pumpAndSettle();
        expect(find.text('Approve Business'), findsNothing);
        expect(find.text('Access: $state'), findsOneWidget);
      }
    },
  );
}
