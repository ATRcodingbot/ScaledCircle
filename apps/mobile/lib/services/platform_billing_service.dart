import 'package:cloud_firestore/cloud_firestore.dart';

class PlatformBillingService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static const String adminWalletId = 'scaled_circle_admin';

  static const double campaignFeeRate = 0.10;

  static const Map<String, double> subscriptionPrices = {
    'starter': 99.0,
    'growth': 299.0,
    'scale': 499.0,
  };

  double calculateCampaignFee(double workerBudget) {
    if (workerBudget <= 0.0) {
      return 0.0;
    }

    return workerBudget * campaignFeeRate;
  }

  double calculateCampaignTotal(double workerBudget) {
    return workerBudget + calculateCampaignFee(workerBudget);
  }

  double subscriptionPrice(String plan) {
    final price = subscriptionPrices[plan];

    if (price == null) {
      throw Exception('Unknown subscription plan.');
    }

    return price;
  }

  Future<bool> hasActiveSubscription({required String businessId}) async {
    final walletSnapshot = await _firestore
        .collection('wallets')
        .doc(businessId)
        .get();

    if (!walletSnapshot.exists) {
      return false;
    }

    final data = walletSnapshot.data();

    if (data == null) {
      return false;
    }

    if (data['subscriptionStatus']?.toString() != 'active') {
      return false;
    }

    final expiresAt = data['subscriptionExpiresAt'];

    if (expiresAt is! Timestamp) {
      return false;
    }

    return expiresAt.toDate().isAfter(DateTime.now());
  }

  Future<void> purchaseSubscription({
    required String businessId,
    required String plan,
  }) async {
    final price = subscriptionPrice(plan);

    final businessWalletReference = _firestore
        .collection('wallets')
        .doc(businessId);

    final adminWalletReference = _firestore
        .collection('wallets')
        .doc(adminWalletId);

    final businessTransactionReference = businessWalletReference
        .collection('transactions')
        .doc();

    final adminTransactionReference = adminWalletReference
        .collection('transactions')
        .doc();

    final platformTransactionReference = _firestore
        .collection('platformTransactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final businessSnapshot = await transaction.get(businessWalletReference);

      final adminSnapshot = await transaction.get(adminWalletReference);

      if (!businessSnapshot.exists) {
        throw Exception('Business wallet does not exist.');
      }

      final businessData = businessSnapshot.data();

      if (businessData == null) {
        throw Exception('Business wallet data is invalid.');
      }

      final availableCredits =
          (businessData['availableCredits'] as num?)?.toDouble() ?? 0.0;

      if (availableCredits < price) {
        throw Exception('Not enough credits to purchase this subscription.');
      }

      final adminData = adminSnapshot.data();

      final adminRevenue =
          (adminData?['availableBalance'] as num?)?.toDouble() ?? 0.0;

      final newBusinessBalance = availableCredits - price;

      final newAdminBalance = adminRevenue + price;

      final now = DateTime.now();

      final expirationDate = DateTime(
        now.year,
        now.month + 1,
        now.day,
        now.hour,
        now.minute,
      );

      transaction.update(businessWalletReference, {
        'availableCredits': newBusinessBalance,
        'balance': newBusinessBalance,
        'subscriptionPlan': plan,
        'subscriptionPrice': price,
        'subscriptionStatus': 'active',
        'subscriptionStartedAt': FieldValue.serverTimestamp(),
        'subscriptionExpiresAt': Timestamp.fromDate(expirationDate),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      transaction.set(adminWalletReference, {
        'ownerId': adminWalletId,
        'ownerType': 'admin',
        'availableBalance': newAdminBalance,
        'balance': newAdminBalance,
        'updatedAt': FieldValue.serverTimestamp(),
        if (!adminSnapshot.exists) 'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      transaction.set(businessTransactionReference, {
        'type': 'subscription_payment',
        'amount': price,
        'subscriptionPlan': plan,
        'description': 'Scaled Circle monthly subscription.',
        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(adminTransactionReference, {
        'type': 'subscription_revenue',
        'amount': price,
        'businessId': businessId,
        'subscriptionPlan': plan,
        'description': 'Scaled Circle subscription revenue.',
        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(platformTransactionReference, {
        'type': 'subscription_revenue',
        'businessId': businessId,
        'amount': price,
        'subscriptionPlan': plan,
        'status': 'completed',
        'createdAt': FieldValue.serverTimestamp(),
      });
    });
  }

  Future<Map<String, double>> fundCampaign({
    required String businessId,
    required String campaignId,
    required double workerBudget,
    required String description,
  }) async {
    if (workerBudget <= 0.0) {
      throw Exception('Worker budget must be greater than zero.');
    }

    final activeSubscription = await hasActiveSubscription(
      businessId: businessId,
    );

    if (!activeSubscription) {
      throw Exception(
        'An active Scaled Circle subscription is required to publish campaigns.',
      );
    }

    final platformFee = calculateCampaignFee(workerBudget);

    final totalCharge = workerBudget + platformFee;

    final businessWalletReference = _firestore
        .collection('wallets')
        .doc(businessId);

    final adminWalletReference = _firestore
        .collection('wallets')
        .doc(adminWalletId);

    final reserveTransactionReference = businessWalletReference
        .collection('transactions')
        .doc();

    final feeTransactionReference = businessWalletReference
        .collection('transactions')
        .doc();

    final adminTransactionReference = adminWalletReference
        .collection('transactions')
        .doc();

    final platformTransactionReference = _firestore
        .collection('platformTransactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final businessSnapshot = await transaction.get(businessWalletReference);

      final adminSnapshot = await transaction.get(adminWalletReference);

      if (!businessSnapshot.exists) {
        throw Exception('Business wallet does not exist.');
      }

      final businessData = businessSnapshot.data();

      if (businessData == null) {
        throw Exception('Business wallet data is invalid.');
      }

      final availableCredits =
          (businessData['availableCredits'] as num?)?.toDouble() ?? 0.0;

      final reservedCredits =
          (businessData['reservedCredits'] as num?)?.toDouble() ?? 0.0;

      if (availableCredits < totalCharge) {
        throw Exception(
          'Insufficient credits. '
          '${totalCharge.toStringAsFixed(2)} credits are required.',
        );
      }

      final adminData = adminSnapshot.data();

      final adminBalance =
          (adminData?['availableBalance'] as num?)?.toDouble() ?? 0.0;

      final newAvailableCredits = availableCredits - totalCharge;

      final newReservedCredits = reservedCredits + workerBudget;

      final newAdminBalance = adminBalance + platformFee;

      transaction.update(businessWalletReference, {
        'availableCredits': newAvailableCredits,
        'reservedCredits': newReservedCredits,
        'balance': newAvailableCredits,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      transaction.set(adminWalletReference, {
        'ownerId': adminWalletId,
        'ownerType': 'admin',
        'availableBalance': newAdminBalance,
        'balance': newAdminBalance,
        'campaignRevenue': FieldValue.increment(platformFee),
        'updatedAt': FieldValue.serverTimestamp(),
        if (!adminSnapshot.exists) 'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      transaction.set(reserveTransactionReference, {
        'type': 'campaign_reserve',
        'amount': workerBudget,
        'campaignId': campaignId,
        'description': description,
        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(feeTransactionReference, {
        'type': 'campaign_platform_fee',
        'amount': platformFee,
        'campaignId': campaignId,
        'feeRate': campaignFeeRate,
        'description': 'Scaled Circle campaign fee.',
        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(adminTransactionReference, {
        'type': 'campaign_fee_revenue',
        'amount': platformFee,
        'businessId': businessId,
        'campaignId': campaignId,
        'feeRate': campaignFeeRate,
        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(platformTransactionReference, {
        'type': 'campaign_fee',
        'businessId': businessId,
        'campaignId': campaignId,
        'workerBudget': workerBudget,
        'feeRate': campaignFeeRate,
        'platformFee': platformFee,
        'totalCharged': totalCharge,
        'status': 'completed',
        'createdAt': FieldValue.serverTimestamp(),
      });
    });

    return {
      'workerBudget': workerBudget,
      'platformFee': platformFee,
      'totalCharge': totalCharge,
    };
  }
}
