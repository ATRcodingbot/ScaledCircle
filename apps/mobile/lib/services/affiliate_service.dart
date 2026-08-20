import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

enum AffiliateEligibility { pending, unverified, eligible }

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

abstract interface class AffiliateGateway {
  Future<AffiliateEligibility> eligibility();
  Future<AffiliateDashboard> dashboard();
  Future<AffiliateDashboard> join();
}

class AffiliateService implements AffiliateGateway {
  AffiliateService({
    FirebaseFunctions? functions,
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
  }) : _functions =
           functions ?? FirebaseFunctions.instanceFor(region: 'us-east1'),
       _auth = auth ?? FirebaseAuth.instance,
       _firestore = firestore ?? FirebaseFirestore.instance;

  static const termsVersion = 'scaler-affiliate-v1-2026-08-20';
  final FirebaseFunctions _functions;
  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  @override
  Future<AffiliateEligibility> eligibility() async {
    final current = _auth.currentUser;
    if (current == null) {
      throw StateError('A signed-in Scaler is required.');
    }
    await current.reload();
    final refreshed = _auth.currentUser;
    await refreshed?.getIdToken(true);
    final profile = await _firestore.collection('users').doc(current.uid).get();
    final data = profile.data() ?? const <String, dynamic>{};
    final role = data['role']?.toString().toLowerCase();
    if (role != 'scaler') {
      throw StateError('The referral program is available only to Scalers.');
    }
    final approved = data['active'] == true || data['betaAccess'] == 'approved';
    if (!approved) return AffiliateEligibility.pending;
    if (refreshed?.emailVerified != true) {
      return AffiliateEligibility.unverified;
    }
    return AffiliateEligibility.eligible;
  }

  static String? referralCodeFromUri(Uri uri) {
    final direct = uri.queryParameters['ref']?.trim();
    if (direct != null && direct.isNotEmpty) return direct.toUpperCase();
    final fragment = uri.fragment;
    final queryIndex = fragment.indexOf('?');
    if (queryIndex < 0) return null;
    return Uri.splitQueryString(
      fragment.substring(queryIndex + 1),
    )['ref']?.trim().toUpperCase();
  }

  @override
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

  @override
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
