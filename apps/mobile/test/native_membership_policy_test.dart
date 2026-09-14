import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_membership_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';
import 'package:flutter_app/widgets/starter_intro_offer_card.dart';

class ExistingMembership extends BusinessWorkspaceService {
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    calls.add(name);
    return {
      'paidAccess': true,
      'planName': 'Managed Growth',
      'price': 999,
      'monthlyCents': 99900,
      'seatStatus': 'verified',
      'seatsUsed': 1,
      'seatLimit': 10,
      'seatsAvailable': 9,
      'addons': [],
      'canCancel': true,
      'status': 'active',
      'periodEndMs': DateTime(2026, 10, 10).millisecondsSinceEpoch,
      'billingHistoryStatus': 'verified',
      'billingHistory': [
        {
          'description': 'Starter membership',
          'amountCents': 100,
          'status': 'Paid',
        },
      ],
    };
  }
}

void main() {
  testWidgets(
    'native deep-linked billing shows existing state without purchase or portal',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final service = ExistingMembership();
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessMembershipScreen(
            service: service,
            businessId: 'owner',
            section: 'addons',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Managed Growth'), findsOneWidget);
      expect(find.text('1 of 10 seats used'), findsOneWidget);
      expect(find.textContaining('Next renewal: \$999.00'), findsOneWidget);
      expect(
        find.textContaining('Starter membership · \$1.00 · Paid'),
        findsOneWidget,
      );
      expect(find.text('Change Plan'), findsNothing);
      expect(find.text('Payment Methods & Billing Records'), findsNothing);
      expect(find.text('Review Plan & Add-on Changes'), findsNothing);
      expect(find.text('Cancel Membership'), findsOneWidget);
      expect(service.calls, ['getBusinessMembership']);
      await tester.tap(find.text('Cancel Membership'));
      await tester.pumpAndSettle();
      expect(find.text('Cancel at End of Billing Period'), findsOneWidget);
      expect(service.calls, ['getBusinessMembership', 'getBusinessMembership']);
    },
  );

  testWidgets('native intro offer neither advertises nor requests checkout', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: StarterIntroOfferCard(
          businessId: 'owner',
          call: (name, data) async {
            calls++;
            return {'eligible': true};
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.textContaining('Try your first month'), findsNothing);
  });

  test(
    'native service rejects digital purchase and reactivation before callable invocation',
    () async {
      final service = BusinessWorkspaceService();
      for (final name in [
        'createSubscriptionCheckoutSession',
        'createBillingPortalSession',
      ]) {
        await expectLater(service.call(name), throwsStateError);
      }
      for (final action in ['changePlan', 'changeSelection', 'reactivate']) {
        await expectLater(
          service.call('changeBusinessMembership', {'action': action}),
          throwsStateError,
        );
      }
    },
  );
}
