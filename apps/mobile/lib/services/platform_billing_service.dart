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
    final newPlan = plan.toLowerCase();

    final targetPrice = subscriptionPrice(newPlan);

    final walletRef = _firestore.collection('wallets').doc(businessId);

    final subscriptionRef = _firestore
        .collection('businessSubscriptions')
        .doc(businessId);

    final adminWalletRef = _firestore.collection('wallets').doc(adminWalletId);

    await _firestore.runTransaction((transaction) async {
      final walletSnapshot = await transaction.get(walletRef);

      if (!walletSnapshot.exists) {
        throw Exception('Business wallet does not exist.');
      }

      final wallet = walletSnapshot.data();

      if (wallet == null) {
        throw Exception('Invalid wallet data.');
      }

      final credits = (wallet['availableCredits'] as num?)?.toDouble() ?? 0.0;

      final currentPlan = wallet['subscriptionPlan']?.toString().toLowerCase();

      final status = wallet['subscriptionStatus']?.toString().toLowerCase();

      final expires = wallet['subscriptionExpiresAt'];

      final active =
          status == 'active' &&
          expires is Timestamp &&
          expires.toDate().isAfter(DateTime.now());

      double charge = targetPrice;

      bool upgrade = false;

      if (active && currentPlan != null) {
        final currentRank = subscriptionRank(currentPlan);

        final targetRank = subscriptionRank(newPlan);

        if (targetRank == currentRank) {
          throw Exception('This plan is already active.');
        }

        if (targetRank < currentRank) {
          throw Exception('Downgrades are not available.');
        }

        charge = calculateUpgradePrice(
          currentPlan: currentPlan,
          targetPlan: newPlan,
        );

        upgrade = true;
      }

      if (credits < charge) {
        throw Exception(
          'Insufficient credits. '
          '${charge.toStringAsFixed(0)} required.',
        );
      }

      final expiration = active
          ? expires
          : Timestamp.fromDate(DateTime.now().add(const Duration(days: 30)));

      final remaining = credits - charge;

      transaction.update(walletRef, {
        'availableCredits': remaining,

        'balance': remaining,

        'subscriptionPlan': newPlan,

        'subscriptionPrice': targetPrice,

        'subscriptionStatus': 'active',

        'subscriptionExpiresAt': expiration,

        if (upgrade) 'previousSubscriptionPlan': currentPlan,

        if (upgrade) 'subscriptionUpgradedAt': FieldValue.serverTimestamp(),

        if (!upgrade) 'subscriptionStartedAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      transaction.set(subscriptionRef, {
        'businessId': businessId,

        'plan': newPlan,

        'planId': newPlan,

        'price': targetPrice,

        'status': 'active',

        'expiresAt': expiration,

        if (upgrade) 'previousPlan': currentPlan,

        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      final transactionRef = walletRef.collection('transactions').doc();

      transaction.set(transactionRef, {
        'type': upgrade ? 'subscription_upgrade' : 'subscription_payment',

        'amount': charge,

        'subscriptionPlan': newPlan,

        'subscriptionFullPrice': targetPrice,

        'previousSubscriptionPlan': currentPlan,

        'description': upgrade
            ? 'Scaled Circle subscription upgrade'
            : 'Scaled Circle subscription purchase',

        'createdAt': FieldValue.serverTimestamp(),
      });

      final adminSnapshot = await transaction.get(adminWalletRef);

      final adminBalance =
          (adminSnapshot.data()?['availableBalance'] as num?)?.toDouble() ??
          0.0;

      transaction.set(adminWalletRef, {
        'ownerId': adminWalletId,

        'ownerType': 'admin',

        'availableBalance': adminBalance + charge,

        'balance': adminBalance + charge,

        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });
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

  Future<Map<String, double>> fundCampaign({
    required String businessId,
    required String campaignId,
    required double workerBudget,
    required String description,
  }) async {
    if (workerBudget <= 0) {
      throw Exception('Worker budget must be greater than zero.');
    }

    final active = await hasActiveSubscription(businessId: businessId);

    if (!active) {
      throw Exception(
        'An active subscription is required to publish campaigns.',
      );
    }

    final platformFee = calculateCampaignFee(workerBudget);

    final totalCharge = workerBudget + platformFee;

    final walletRef = _firestore.collection('wallets').doc(businessId);

    final adminRef = _firestore.collection('wallets').doc(adminWalletId);

    await _firestore.runTransaction((transaction) async {
      final walletSnap = await transaction.get(walletRef);

      final wallet = walletSnap.data();

      if (wallet == null) {
        throw Exception('Business wallet does not exist.');
      }

      final available = (wallet['availableCredits'] as num?)?.toDouble() ?? 0.0;

      final reserved = (wallet['reservedCredits'] as num?)?.toDouble() ?? 0.0;

      if (available < totalCharge) {
        throw Exception('Insufficient credits.');
      }

      transaction.update(walletRef, {
        'availableCredits': available - totalCharge,

        'reservedCredits': reserved + workerBudget,

        'balance': available - totalCharge,

        'updatedAt': FieldValue.serverTimestamp(),
      });

      final transactionRef = walletRef.collection('transactions').doc();

      transaction.set(transactionRef, {
        'type': 'campaign_reserve',

        'amount': workerBudget,

        'campaignId': campaignId,

        'description': description,

        'createdAt': FieldValue.serverTimestamp(),
      });

      final adminSnap = await transaction.get(adminRef);

      final adminBalance =
          (adminSnap.data()?['availableBalance'] as num?)?.toDouble() ?? 0.0;

      transaction.set(adminRef, {
        'ownerId': adminWalletId,

        'ownerType': 'admin',

        'availableBalance': adminBalance + platformFee,

        'balance': adminBalance + platformFee,

        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    return {
      'workerBudget': workerBudget,

      'platformFee': platformFee,

      'totalCharge': totalCharge,
    };
  }
}
