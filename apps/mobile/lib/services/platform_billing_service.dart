import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:url_launcher/url_launcher.dart';

import 'secure_function_service.dart';

class PlatformBillingService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final SecureFunctionService _secureFunctions = const SecureFunctionService();

  static const String adminWalletId = 'scaled_circle_admin';

  /// Temporary production capability gate. The reviewed funding callables are
  /// not live yet, so drafts must remain safely saved without presenting a
  /// launch action that cannot succeed.
  static const bool authoritativeCampaignFundingAvailable = false;

  static const Map<String, double> subscriptionPrices = {
    'starter': 99.0,
    'growth': 299.0,
    'scale': 499.0,
    'managed_growth': 999.0,
  };

  static const Map<String, int> _subscriptionRanks = {
    'starter': 1,
    'growth': 2,
    'scale': 3,
    'managed_growth': 4,
  };

  Future<Map<String, dynamic>> _callSecureFunction({
    required String businessId,
    required String functionName,
    required Map<String, dynamic> data,
  }) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null || user.uid != businessId) {
      throw Exception('You must be logged in as this business.');
    }

    return _secureFunctions.call(functionName: functionName, data: data);
  }

  // -----------------------------
  // SUBSCRIPTION HELPERS
  // -----------------------------

  double subscriptionPrice(String plan) {
    final price = subscriptionPrices[plan.toLowerCase()];

    if (price == null) {
      throw Exception('Unknown subscription plan.');
    }

    return price;
  }

  int subscriptionRank(String plan) {
    final rank = _subscriptionRanks[plan.toLowerCase()];

    if (rank == null) {
      throw Exception('Unknown subscription plan.');
    }

    return rank;
  }

  bool isUpgrade({required String currentPlan, required String targetPlan}) {
    return subscriptionRank(targetPlan) > subscriptionRank(currentPlan);
  }

  double calculateUpgradePrice({
    required String currentPlan,
    required String targetPlan,
  }) {
    if (!isUpgrade(currentPlan: currentPlan, targetPlan: targetPlan)) {
      throw Exception('Only upgrades are supported.');
    }

    return subscriptionPrice(targetPlan) - subscriptionPrice(currentPlan);
  }

  // -----------------------------
  // SUBSCRIPTION PURCHASE
  // -----------------------------

  Future<bool> purchaseSubscription({
    required String businessId,
    required String plan,
    bool manageExisting = false,
  }) async {
    final result = await _callSecureFunction(
      businessId: businessId,
      functionName: manageExisting
          ? 'createBillingPortalSession'
          : 'createSubscriptionCheckoutSession',
      data: {'plan': plan.toLowerCase()},
    );
    final url = result['url']?.toString();
    if (url == null || url.isEmpty) return result['comped'] == true;
    final opened = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
      webOnlyWindowName: '_self',
    );
    if (!opened) throw Exception('Unable to open secure Stripe checkout.');
    return false;
  }

  Future<void> purchaseCredits({
    required String businessId,
    required int credits,
  }) async {
    final result = await _callSecureFunction(
      businessId: businessId,
      functionName: 'createCreditCheckoutSession',
      data: {'credits': credits},
    );
    await _openStripeUrl(result['url']);
  }

  Future<void> fundCampaignWithCard({
    required String businessId,
    required String campaignId,
  }) async {
    final result = await _callSecureFunction(
      businessId: businessId,
      functionName: 'createCampaignFundingCheckoutSession',
      data: {'campaignId': campaignId},
    );
    if (result['alreadyFunded'] == true) return;
    await _openStripeUrl(result['url']);
  }

  Future<Map<String, dynamic>> marketplacePolicy({
    required String businessId,
  }) {
    return _callSecureFunction(
      businessId: businessId,
      functionName: 'getMarketplacePolicy',
      data: const {},
    );
  }

  /// Server-authoritative marketplace quote. Flutter formats returned cents;
  /// it never owns the platform-fee policy.
  Future<Map<String, double>> campaignQuoteEstimate(double workerBudget) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw Exception('You must be logged in.');
    final result = await _callSecureFunction(
      businessId: user.uid,
      functionName: 'quoteCampaignFunding',
      data: {'workerAmountCents': (workerBudget * 100).round()},
    );
    final workerAmountCents = (result['workerAmountCents'] as num?)?.toInt();
    final platformFeeCents = (result['platformFeeCents'] as num?)?.toInt();
    final businessChargeCents = (result['businessChargeCents'] as num?)?.toInt();
    if (workerAmountCents == null || platformFeeCents == null ||
        businessChargeCents == null) {
      throw Exception('Marketplace pricing policy is unavailable.');
    }
    return {
      'workerBudget': workerAmountCents / 100,
      'platformFee': platformFeeCents / 100,
      'totalCharge': businessChargeCents / 100,
    };
  }

  Future<void> publishFundedCampaign({
    required String businessId,
    required String campaignId,
  }) async {
    await _callSecureFunction(
      businessId: businessId,
      functionName: 'publishFundedCampaign',
      data: {'campaignId': campaignId},
    );
  }

  Future<void> _openStripeUrl(dynamic rawUrl) async {
    final url = rawUrl?.toString() ?? '';
    if (url.isEmpty) throw Exception('Stripe checkout is unavailable.');
    final opened = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
      webOnlyWindowName: '_self',
    );
    if (!opened) throw Exception('Unable to open secure Stripe checkout.');
  }

  Future<Map<String, dynamic>> ensureBillingEntitlement({
    required String businessId,
  }) {
    return _callSecureFunction(
      businessId: businessId,
      functionName: 'ensureBillingEntitlement',
      data: const {},
    );
  }

  Future<String> createStarterFreeMonthPromotion({
    required String businessId,
  }) async {
    final result = await _callSecureFunction(
      businessId: businessId,
      functionName: 'createStarterFreeMonthPromotion',
      data: const {},
    );
    final code = result['code']?.toString() ?? '';
    if (code.isEmpty) {
      throw Exception('Stripe did not return the promotion code.');
    }
    return code;
  }

  Future<bool> hasActiveSubscription({required String businessId}) async {
    final snap = await _firestore.collection('wallets').doc(businessId).get();

    final data = snap.data();

    if (data == null) {
      return false;
    }

    final status = data['subscriptionStatus']?.toString().toLowerCase();

    final expires = data['subscriptionExpiresAt'];

    if (status != 'active') {
      return false;
    }

    if (expires is! Timestamp) {
      return false;
    }

    return expires.toDate().isAfter(DateTime.now());
  }

}
