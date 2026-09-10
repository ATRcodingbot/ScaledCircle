import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_membership_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';

class BillingHistoryService extends BusinessWorkspaceService {
  final calls = <String>[];
  bool scheduled = false;
  bool reconcile = true;
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(name);
    if (name == 'changeBusinessMembership' && reconcile) scheduled = true;
    return {
      'plan': 'starter',
      'planName': 'Starter',
      'price': 99,
      'addons': [],
      'canCancel': true,
      'status': 'active',
      'cancelAtPeriodEnd': scheduled,
      'canWithdrawCancellation': scheduled,
      'periodEndMs': DateTime(2026, 10, 10).millisecondsSinceEpoch,
      'paidAccess': true,
      'billingHistoryStatus': 'verified',
      'billingHistory': [
        {
          'description': 'Starter Membership',
          'dateMs': DateTime(2026, 9, 10).millisecondsSinceEpoch,
          'amountCents': 100,
          'status': 'Paid',
        },
      ],
    };
  }
}

void main() {
  testWidgets(
    'email cancellation destination requires intentional confirmation; receipt is one dollar',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(700, 2000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final service = BillingHistoryService();
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessMembershipScreen(
            service: service,
            businessId: 'business',
            section: 'cancel',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(service.calls, ['getBusinessMembership']);
      expect(find.text('Billing History'), findsNothing);
      expect(find.text('Change Plan'), findsNothing);
      expect(find.textContaining('Growth Department'), findsNothing);
      expect(find.textContaining('Business Assistant'), findsNothing);
      expect(find.text('Keep My Membership'), findsOneWidget);
      expect(
        find.text('Current plan: Starter — \$99.00/month'),
        findsOneWidget,
      );
      await tester.tap(find.text('Cancel at End of Billing Period'));
      await tester.pumpAndSettle();
      expect(find.text('Schedule Cancellation'), findsOneWidget);
      expect(service.calls, ['getBusinessMembership']);
      await tester.tap(find.text('Go Back'));
      await tester.pumpAndSettle();
      expect(service.calls, ['getBusinessMembership']);
    },
  );
  for (final reconcile in [true, false]) {
    testWidgets('cancellation success requires provider readback: $reconcile', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(390, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final service = BillingHistoryService()..reconcile = reconcile;
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessMembershipScreen(
            service: service,
            businessId: 'business',
            section: 'cancel',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel at End of Billing Period'));
      await tester.pumpAndSettle();
      expect(service.calls, ['getBusinessMembership']);
      await tester.tap(find.text('Schedule Cancellation'));
      await tester.pumpAndSettle();
      expect(service.calls, [
        'getBusinessMembership',
        'changeBusinessMembership',
        'getBusinessMembership',
      ]);
      expect(
        find.text('Cancellation Scheduled'),
        reconcile ? findsOneWidget : findsNothing,
      );
      expect(
        find.text('Reactivate Membership'),
        reconcile ? findsOneWidget : findsNothing,
      );
      expect(find.textContaining('Growth Department'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
