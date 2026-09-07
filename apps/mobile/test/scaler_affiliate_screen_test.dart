import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/scaler/affiliate/scaler_affiliate_screen.dart';
import 'package:flutter_app/services/affiliate_service.dart';

class _NoCallsGateway implements AffiliateGateway {
  int calls = 0;
  @override
  Future<AffiliateEligibility> eligibility() async {
    calls++;
    throw StateError('must not load');
  }

  @override
  Future<AffiliateDashboard> dashboard() async {
    calls++;
    throw StateError('must not load');
  }

  @override
  Future<AffiliateDashboard> join() async {
    calls++;
    throw StateError('must not enroll');
  }
}

void main() {
  testWidgets(
    'Coming Soon makes no eligibility, enrollment or accounting requests',
    (tester) async {
      final gateway = _NoCallsGateway();
      await tester.pumpWidget(
        MaterialApp(home: ScalerAffiliateScreen(service: gateway)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Referral Program — Coming Soon'), findsOneWidget);
      expect(
        find.textContaining('Existing referral records are preserved'),
        findsOneWidget,
      );
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.byType(FilledButton), findsNothing);
      expect(find.textContaining('10%'), findsNothing);
      expect(find.textContaining('Earn with'), findsNothing);
      expect(
        find.textContaining('https://scaledcircle.com/?ref='),
        findsNothing,
      );
      expect(gateway.calls, 0);
      expect(tester.takeException(), isNull);
    },
  );
}
