import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/scaler/affiliate/scaler_affiliate_screen.dart';
import 'package:flutter_app/services/affiliate_service.dart';

class _FakeAffiliateGateway implements AffiliateGateway {
  _FakeAffiliateGateway({
    required this.access,
    this.value = const AffiliateDashboard(joined: false),
    this.failure,
  });

  final AffiliateEligibility access;
  final AffiliateDashboard value;
  final Object? failure;
  int joinCalls = 0;

  @override
  Future<AffiliateEligibility> eligibility() async {
    if (failure != null) throw failure!;
    return access;
  }

  @override
  Future<AffiliateDashboard> dashboard() async => value;

  @override
  Future<AffiliateDashboard> join() async {
    joinCalls += 1;
    return const AffiliateDashboard(
      joined: true,
      referralCode: 'SC8K2P',
      commissionRateBps: 1000,
    );
  }
}

Future<void> _pump(WidgetTester tester, AffiliateGateway gateway) async {
  await tester.pumpWidget(
    MaterialApp(home: ScalerAffiliateScreen(service: gateway)),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('approved verified Scaler without profile sees join state', (
    tester,
  ) async {
    await _pump(
      tester,
      _FakeAffiliateGateway(access: AffiliateEligibility.eligible),
    );
    await tester.scrollUntilVisible(find.text('Join Referral Program'), 240);
    expect(find.text('Join Referral Program'), findsOneWidget);
    expect(find.textContaining('Start at 10%'), findsOneWidget);
  });

  testWidgets('pending Scaler sees rollout information, not an error', (
    tester,
  ) async {
    await _pump(
      tester,
      _FakeAffiliateGateway(access: AffiliateEligibility.pending),
    );
    expect(find.textContaining('becomes available after'), findsOneWidget);
    expect(find.textContaining('temporarily unavailable'), findsNothing);
  });

  testWidgets('approved unverified Scaler sees verify action', (tester) async {
    await _pump(
      tester,
      _FakeAffiliateGateway(access: AffiliateEligibility.unverified),
    );
    expect(find.text('VERIFY YOUR EMAIL TO JOIN'), findsOneWidget);
    expect(find.text('Verify Email'), findsOneWidget);
  });

  testWidgets('enrolled Scaler sees referral link without Phase 2 dollars', (
    tester,
  ) async {
    await _pump(
      tester,
      _FakeAffiliateGateway(
        access: AffiliateEligibility.eligible,
        value: const AffiliateDashboard(
          joined: true,
          referralCode: 'SC8K2P',
          commissionRateBps: 1000,
        ),
      ),
    );
    expect(find.text('Your rate: 10%'), findsOneWidget);
    expect(find.text('https://scaledcircle.com/?ref=SC8K2P'), findsOneWidget);
    expect(find.textContaining(r'$'), findsNothing);
  });

  testWidgets('real loading failure shows retry and back actions', (
    tester,
  ) async {
    await _pump(
      tester,
      _FakeAffiliateGateway(
        access: AffiliateEligibility.eligible,
        failure: StateError('network'),
      ),
    );
    expect(
      find.text('Referral details are temporarily unavailable.'),
      findsOneWidget,
    );
    expect(find.text('Try Again'), findsOneWidget);
    expect(find.text('Back'), findsOneWidget);
  });

  testWidgets('join creates one profile request and renders enrolled state', (
    tester,
  ) async {
    final gateway = _FakeAffiliateGateway(
      access: AffiliateEligibility.eligible,
    );
    await _pump(tester, gateway);
    await tester.scrollUntilVisible(find.byType(CheckboxListTile), 240);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.scrollUntilVisible(find.text('Join Referral Program'), 160);
    await tester.tap(find.text('Join Referral Program'));
    await tester.pumpAndSettle();
    expect(gateway.joinCalls, 1);
    expect(find.text('Your rate: 10%'), findsOneWidget);
  });
}
