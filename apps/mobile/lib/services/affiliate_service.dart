import 'package:cloud_functions/cloud_functions.dart';

class AffiliateDashboard {
  const AffiliateDashboard({
    required this.joined,
    this.referralCode,
    this.commissionRateBps,
    this.referralCount = 0,
  });

  final bool joined;
  final String? referralCode;
  final int? commissionRateBps;
  final int referralCount;
}

class AffiliateService {
  AffiliateService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instance;

  static const termsVersion = 'scaler-affiliate-v1-2026-08-20';
  final FirebaseFunctions _functions;

  static String? referralCodeFromUri(Uri uri) {
    final direct = uri.queryParameters['ref']?.trim();
    if (direct != null && direct.isNotEmpty) return direct.toUpperCase();
    final fragment = uri.fragment;
    final queryIndex = fragment.indexOf('?');
    if (queryIndex < 0) return null;
    return Uri.splitQueryString(fragment.substring(queryIndex + 1))['ref']
        ?.trim()
        .toUpperCase();
  }

  Future<AffiliateDashboard> dashboard() async {
    final result = await _functions
        .httpsCallable('getScalerAffiliateDashboard')
        .call<Map<String, dynamic>>();
    final data = Map<String, dynamic>.from(result.data);
    return AffiliateDashboard(
      joined: data['joined'] == true,
      referralCode: data['referralCode']?.toString(),
      commissionRateBps: (data['commissionRateBps'] as num?)?.toInt(),
      referralCount: (data['referrals'] as List?)?.length ?? 0,
    );
  }

  Future<AffiliateDashboard> join() async {
    await _functions.httpsCallable('joinScalerAffiliateProgram').call({
      'termsVersion': termsVersion,
    });
    return dashboard();
  }

  Future<void> recordBusinessAttribution({
    required String referralCode,
    required int capturedAtMillis,
  }) async {
    await _functions.httpsCallable('recordBusinessReferralAttribution').call({
      'referralCode': referralCode,
      'capturedAtMillis': capturedAtMillis,
    });
  }
}
