import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/affiliate_service.dart';

void main() {
  test('referral code is captured from root and hash-route query strings', () {
    expect(
      AffiliateService.referralCodeFromUri(
        Uri.parse('https://scaledcircle.com/?ref=sc8k2p'),
      ),
      'SC8K2P',
    );
    expect(
      AffiliateService.referralCodeFromUri(
        Uri.parse('https://scaledcircle.com/#/businesses?ref=abc234'),
      ),
      'ABC234',
    );
  });

  test(
    'Business public and pricing screens contain no affiliate disclosures',
    () {
      final business = File(
        'lib/screens/public/business_funnel_screen.dart',
      ).readAsStringSync();
      final pricing = File(
        'lib/screens/business/subscription_screen.dart',
      ).readAsStringSync();
      final forbidden = RegExp(
        r'affiliate|commission percentage|referral discount|ask for a discount',
        caseSensitive: false,
      );
      expect(business, isNot(matches(forbidden)));
      expect(pricing, isNot(matches(forbidden)));
    },
  );

  test(
    'Scaler and Business owner account surfaces link the referral experience',
    () {
      final scaler = File(
        'lib/screens/scaler/dashboard/scaler_dashboard_screen.dart',
      ).readAsStringSync();
      final business = File(
        'lib/screens/business/business_account_screen.dart',
      ).readAsStringSync();
      expect(scaler, contains('Referrals · Private Beta'));
      expect(business, contains("['isOwner'] == true"));
      expect(business, contains('ScalerAffiliateScreen'));
    },
  );

  test('affiliate screen enables attribution without promising income', () {
    final source = File(
      'lib/screens/scaler/affiliate/scaler_affiliate_screen.dart',
    ).readAsStringSync();
    expect(source, contains('this.enableAttribution = true'));
    expect(source, contains('Existing referral records are preserved.'));
    expect(source, isNot(contains('guaranteed income')));
    expect(source, isNot(contains('discount')));
  });

  test(
    'affiliate callable uses production region and refreshes verification',
    () {
      final source = File(
        'lib/services/affiliate_service.dart',
      ).readAsStringSync();
      expect(
        source,
        contains("FirebaseFunctions.instanceFor(region: 'us-east1')"),
      );
      expect(source, contains('await current.reload()'));
      expect(source, contains('getIdToken(true)'));
      expect(source, isNot(contains('FirebaseFunctions.instance;')));
    },
  );
}
