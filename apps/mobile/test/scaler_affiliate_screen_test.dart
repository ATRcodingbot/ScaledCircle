import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/scaler/affiliate/scaler_affiliate_screen.dart';
import 'package:flutter_app/services/affiliate_service.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter_app/screens/public/referral_program_screen.dart';

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
    'public referral policy protects worker pay on phone and desktop',
    (tester) async {
      for (final width in [360.0, 1000.0]) {
        await tester.binding.setSurfaceSize(Size(width, 900));
        await tester.pumpWidget(
          const MaterialApp(home: ReferralProgramScreen()),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Earn 1% from qualifying completed work.'),
          findsOneWidget,
        );
        expect(
          find.text("Your reward does not come out of the Scaler's pay."),
          findsOneWidget,
        );
        expect(
          find.text(ReferralProgramScreen.scalerProtection),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      }
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets(
    'staging referral link and QR capture signup without claiming reward',
    (tester) async {
      final g = _ReadyGateway();
      await tester.pumpWidget(
        MaterialApp(
          home: ScalerAffiliateScreen(service: g, enableAttribution: true),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(QrImageView), findsOneWidget);
      expect(find.textContaining('role=scaler'), findsOneWidget);
      expect(g.joins, 0);
      expect(
        find.text("This does not come out of the Scaler's pay."),
        findsOneWidget,
      );
      expect(find.textContaining('Scaler · Signed up'), findsOneWidget);
      expect(find.text('Businesses Referred'), findsOneWidget);
      expect(find.text('Scalers Referred'), findsOneWidget);
      expect(
        find.text(
          "Paid by ScaledCircle — never deducted from the Scaler's earnings.",
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('referral enrollment is intentional and failure has Retry', (
    tester,
  ) async {
    final g = _ReadyGateway()..joined = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ScalerAffiliateScreen(service: g, enableAttribution: true),
      ),
    );
    await tester.pumpAndSettle();
    final button = find.widgetWithText(FilledButton, 'Create My Referral Link');
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    expect(g.joins, 0);
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(g.joins, 1);
    await tester.pumpWidget(const SizedBox());
    g.fail = true;
    await tester.pumpWidget(
      MaterialApp(
        home: ScalerAffiliateScreen(service: g, enableAttribution: true),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
  });

  testWidgets(
    'Coming Soon makes no eligibility, enrollment or accounting requests',
    (tester) async {
      final gateway = _NoCallsGateway();
      await tester.pumpWidget(
        MaterialApp(
          home: ScalerAffiliateScreen(
            service: gateway,
            enableAttribution: false,
          ),
        ),
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

class _ReadyGateway implements AffiliateGateway {
  int joins = 0;
  bool fail = false;
  bool joined = true;
  @override
  Future<AffiliateEligibility> eligibility() async =>
      AffiliateEligibility.eligible;
  @override
  Future<AffiliateDashboard> dashboard() async {
    if (fail) throw StateError('network');
    return AffiliateDashboard(
      joined: joined,
      referralCode: joined ? 'ABCD2345' : null,
      referrals: const [
        {
          'displayId': 'Referral 1',
          'referredRole': 'scaler',
          'status': 'SIGNED_UP',
        },
      ],
    );
  }

  @override
  Future<AffiliateDashboard> join() async {
    joins++;
    joined = true;
    return dashboard();
  }
}
