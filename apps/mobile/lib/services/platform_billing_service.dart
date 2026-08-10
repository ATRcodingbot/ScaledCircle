import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

class PlatformBillingService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static const String adminWalletId = 'scaled_circle_admin';

  static const double campaignFeeRate = 0.10;

  static const Map<String, double> subscriptionPrices = {
    'starter': 99.0,
    'growth': 299.0,
    'scale': 499.0,
  };

  static const Map<String, int> _subscriptionRanks = {
    'starter': 1,
    'growth': 2,
    'scale': 3,
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

    final idToken = await user.getIdToken();

    if (idToken == null || idToken.isEmpty) {
      throw Exception('Unable to authenticate the request.');
    }

    final endpoint = Uri.parse(
      'https://us-east1-scaled-circle.cloudfunctions.net/$functionName',
    );

    try {
      final response = await http.post(
        endpoint,
        headers: {
          'Authorization': 'Bearer $idToken',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'data': data}),
      );

      final responseBody = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body) as Map<String, dynamic>;
      final callableError = responseBody['error'];

      if (response.statusCode < 200 ||
          response.statusCode >= 300 ||
          callableError != null) {
        final message = callableError is Map
            ? callableError['message']?.toString()
            : null;

        throw Exception(message ?? 'The secure service request failed.');
      }

      final result = responseBody['result'] ?? responseBody['data'];

      return result is Map
          ? Map<String, dynamic>.from(result)
          : <String, dynamic>{};
    } on FormatException {
      throw Exception('The secure service returned an invalid response.');
    } on http.ClientException catch (error) {
      throw Exception('Unable to reach the secure service: $error');
    }
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

  Future<void> purchaseSubscription({
    required String businessId,
    required String plan,
  }) async {
    await _callSecureFunction(
      businessId: businessId,
      functionName: 'purchaseSubscription',
      data: {'plan': plan.toLowerCase()},
    );
  }

  // -----------------------------
  // CAMPAIGN FEES
  // -----------------------------

  double calculateCampaignFee(double workerBudget) {
    return workerBudget * campaignFeeRate;
  }

  double calculateCampaignTotal(double workerBudget) {
    return workerBudget + calculateCampaignFee(workerBudget);
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

  // -----------------------------
  // CAMPAIGN FUNDING
  // -----------------------------

  Future<Map<String, double>> fundCampaign({
    required String businessId,
    required String campaignId,
    required double workerBudget,
    required String description,
  }) async {
    if (workerBudget <= 0) {
      throw Exception('Worker budget must be greater than zero.');
    }

    final result = await _callSecureFunction(
      businessId: businessId,
      functionName: 'fundCampaign',
      data: {
        'campaignId': campaignId,
        'description': description,
      },
    );

    final fundedWorkerBudget = (result['workerBudget'] as num?)?.toDouble();
    final fundedPlatformFee = (result['platformFee'] as num?)?.toDouble();
    final fundedTotalCharge = (result['totalCharge'] as num?)?.toDouble();

    if (fundedWorkerBudget == null ||
        fundedPlatformFee == null ||
        fundedTotalCharge == null) {
      throw Exception('The campaign funding response is incomplete.');
    }

    return {
      'workerBudget': fundedWorkerBudget,
      'platformFee': fundedPlatformFee,
      'totalCharge': fundedTotalCharge,
    };
  }
}
