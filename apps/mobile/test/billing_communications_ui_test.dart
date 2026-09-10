import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_membership_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';

class BillingHistoryService extends BusinessWorkspaceService {
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(name);
    return {
      'plan': 'starter',
      'planName': 'Starter',
      'price': 99,
      'addons': [],
      'canCancel': true,
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
      expect(find.text('Billing History'), findsOneWidget);
      expect(find.text('\$1.00 · Paid'), findsOneWidget);
      await tester.tap(find.text('Cancel Membership'));
      await tester.pumpAndSettle();
      expect(find.text('Confirm Cancellation'), findsOneWidget);
      expect(service.calls, ['getBusinessMembership']);
      await tester.tap(find.text('Keep Current Settings'));
      await tester.pumpAndSettle();
      expect(service.calls, ['getBusinessMembership']);
    },
  );
}
