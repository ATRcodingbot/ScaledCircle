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

  static const Map<String, int> _subscriptionRanks = {
    'starter': 1,
    'growth': 2,
    'scale': 3,
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
    final normalizedPlan = plan.toLowerCase();

    final price = subscriptionPrices[normalizedPlan];

    if (price == null) {
      throw Exception('Unknown subscription plan.');
    }

    return price;
  }

  int subscriptionRank(String plan) {
    final normalizedPlan = plan.toLowerCase();

    final rank = _subscriptionRanks[normalizedPlan];

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
    final normalizedCurrentPlan = currentPlan.toLowerCase();

    final normalizedTargetPlan = targetPlan.toLowerCase();

    if (normalizedCurrentPlan == normalizedTargetPlan) {
      return 0.0;
    }

    if (!isUpgrade(
      currentPlan: normalizedCurrentPlan,
      targetPlan: normalizedTargetPlan,
    )) {
      throw Exception(
        'Downgrading an active subscription is not currently supported.',
      );
    }

    final currentPrice = subscriptionPrice(normalizedCurrentPlan);

    final targetPrice = subscriptionPrice(normalizedTargetPlan);

    return targetPrice - currentPrice;
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

  Future<Map<String, dynamic>> getSubscriptionQuote({
    required String businessId,
    required String targetPlan,
  }) async {
    final normalizedTargetPlan = targetPlan.toLowerCase();

    final targetPrice = subscriptionPrice(normalizedTargetPlan);

    final walletSnapshot = await _firestore
        .collection('wallets')
        .doc(businessId)
        .get();

    if (!walletSnapshot.exists) {
      return {
        'targetPlan': normalizedTargetPlan,
        'targetPrice': targetPrice,
        'charge': targetPrice,
        'isUpgrade': false,
        'isCurrentPlan': false,
        'isDowngrade': false,
        'currentPlan': null,
        'expiresAt': null,
      };
    }

    final data = walletSnapshot.data() ?? {};

    final currentPlan = data['subscriptionPlan']?.toString().toLowerCase();

    final status = data['subscriptionStatus']?.toString().toLowerCase();

    final expiresAt = data['subscriptionExpiresAt'];

    final active =
        status == 'active' &&
        expiresAt is Timestamp &&
        expiresAt.toDate().isAfter(DateTime.now());

    if (!active ||
        currentPlan == null ||
        currentPlan.isEmpty ||
        !_subscriptionRanks.containsKey(currentPlan)) {
      return {
        'targetPlan': normalizedTargetPlan,
        'targetPrice': targetPrice,
        'charge': targetPrice,
        'isUpgrade': false,
        'isCurrentPlan': false,
        'isDowngrade': false,
        'currentPlan': currentPlan,
        'expiresAt': expiresAt,
      };
    }

    final currentRank = subscriptionRank(currentPlan);

    final targetRank = subscriptionRank(normalizedTargetPlan);

    if (currentRank == targetRank) {
      return {
        'targetPlan': normalizedTargetPlan,
        'targetPrice': targetPrice,
        'charge': 0.0,
        'isUpgrade': false,
        'isCurrentPlan': true,
        'isDowngrade': false,
        'currentPlan': currentPlan,
        'expiresAt': expiresAt,
      };
    }

    if (targetRank < currentRank) {
      return {
        'targetPlan': normalizedTargetPlan,
        'targetPrice': targetPrice,
        'charge': 0.0,
        'isUpgrade': false,
        'isCurrentPlan': false,
        'isDowngrade': true,
        'currentPlan': currentPlan,
        'expiresAt': expiresAt,
      };
    }

    return {
      'targetPlan': normalizedTargetPlan,
      'targetPrice': targetPrice,
      'charge': targetPrice - subscriptionPrice(currentPlan),
      'isUpgrade': true,
      'isCurrentPlan': false,
      'isDowngrade': false,
      'currentPlan': currentPlan,
      'expiresAt': expiresAt,
    };
  }

  Future<void> purchaseSubscription({
    required String businessId,
    required String plan,
  }) async {
    final normalizedPlan = plan.toLowerCase();

    final targetPrice = subscriptionPrice(normalizedPlan);

    final businessWalletReference = _firestore
        .collection('wallets')
        .doc(businessId);

    final businessSubscriptionReference = _firestore
        .collection('businessSubscriptions')
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

      final currentPlan = businessData['subscriptionPlan']
          ?.toString()
          .toLowerCase();

      final currentStatus = businessData['subscriptionStatus']
          ?.toString()
          .toLowerCase();

      final currentExpiresAt = businessData['subscriptionExpiresAt'];

      final currentlyActive =
          currentStatus == 'active' &&
          currentExpiresAt is Timestamp &&
          currentExpiresAt.toDate().isAfter(DateTime.now());

      double amountToCharge = targetPrice;

      bool upgrading = false;

      Timestamp expirationTimestamp;

      if (currentlyActive &&
          currentPlan != null &&
          currentPlan.isNotEmpty &&
          _subscriptionRanks.containsKey(currentPlan)) {
        final currentRank = subscriptionRank(currentPlan);

        final targetRank = subscriptionRank(normalizedPlan);

        if (currentRank == targetRank) {
          throw Exception(
            'The ${_planName(normalizedPlan)} plan is already active.',
          );
        }

        if (targetRank < currentRank) {
          throw Exception(
            'Downgrading an active subscription is not currently supported.',
          );
        }

        upgrading = true;

        amountToCharge = targetPrice - subscriptionPrice(currentPlan);

        expirationTimestamp = currentExpiresAt;
      } else {
        final now = DateTime.now();

        final expirationDate = DateTime(
          now.year,
          now.month + 1,
          now.day,
          now.hour,
          now.minute,
        );

        expirationTimestamp = Timestamp.fromDate(expirationDate);
      }

      if (amountToCharge <= 0.0) {
        throw Exception('The subscription charge is invalid.');
      }

      if (availableCredits < amountToCharge) {
        throw Exception(
          'Not enough credits. '
          '${amountToCharge.toStringAsFixed(0)} credits are required.',
        );
      }

      final adminData = adminSnapshot.data();

      final adminRevenue =
          (adminData?['availableBalance'] as num?)?.toDouble() ?? 0.0;

      final newBusinessBalance = availableCredits - amountToCharge;

      final newAdminBalance = adminRevenue + amountToCharge;

      final walletUpdate = <String, dynamic>{
        'availableCredits': newBusinessBalance,
        'balance': newBusinessBalance,
        'subscriptionPlan': normalizedPlan,
        'subscriptionPrice': targetPrice,
        'subscriptionStatus': 'active',
        'subscriptionExpiresAt': expirationTimestamp,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (upgrading) {
        walletUpdate['subscriptionUpgradedAt'] = FieldValue.serverTimestamp();

        walletUpdate['previousSubscriptionPlan'] = currentPlan;
      } else {
        walletUpdate['subscriptionStartedAt'] = FieldValue.serverTimestamp();
      }

      transaction.update(businessWalletReference, walletUpdate);

      transaction.set(businessSubscriptionReference, {
        'businessId': businessId,
        'plan': normalizedPlan,
        'planId': normalizedPlan,
        'price': targetPrice,
        'status': 'active',
        'expiresAt': expirationTimestamp,
        'updatedAt': FieldValue.serverTimestamp(),
        if (upgrading) 'upgradedAt': FieldValue.serverTimestamp(),
        if (upgrading) 'previousPlan': currentPlan,
        if (!upgrading) 'startedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      transaction.set(adminWalletReference, {
        'ownerId': adminWalletId,
        'ownerType': 'admin',
        'availableBalance': newAdminBalance,
        'balance': newAdminBalance,
        'subscriptionRevenue': FieldValue.increment(amountToCharge),
        'updatedAt': FieldValue.serverTimestamp(),
        if (!adminSnapshot.exists) 'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      transaction.set(businessTransactionReference, {
        'type': upgrading ? 'subscription_upgrade' : 'subscription_payment',
        'amount': amountToCharge,
        'subscriptionPlan': normalizedPlan,
        'subscriptionFullPrice': targetPrice,
        'previousSubscriptionPlan': currentPlan,
        'description': upgrading
            ? 'Scaled Circle subscription upgrade.'
            : 'Scaled Circle monthly subscription.',
        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(adminTransactionReference, {
        'type': upgrading
            ? 'subscription_upgrade_revenue'
            : 'subscription_revenue',
        'amount': amountToCharge,
        'businessId': businessId,
        'subscriptionPlan': normalizedPlan,
        'subscriptionFullPrice': targetPrice,
        'previousSubscriptionPlan': currentPlan,
        'description': upgrading
            ? 'Scaled Circle subscription upgrade revenue.'
            : 'Scaled Circle subscription revenue.',
        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(platformTransactionReference, {
        'type': upgrading ? 'subscription_upgrade' : 'subscription_revenue',
        'businessId': businessId,
        'amount': amountToCharge,
        'subscriptionPlan': normalizedPlan,
        'subscriptionFullPrice': targetPrice,
        'previousSubscriptionPlan': currentPlan,
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
        'An active Scaled Circle subscription is required '
        'to publish campaigns.',
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
        throw Exception('Business wallet is invalid.');
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

  String _planName(String plan) {
    switch (plan) {
      case 'starter':
        return 'Starter';

      case 'growth':
        return 'Growth';

      case 'scale':
        return 'Scale';

      default:
        return plan;
    }
  }
}
