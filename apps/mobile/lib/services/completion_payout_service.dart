import 'package:cloud_firestore/cloud_firestore.dart';

import 'payout_calculation_service.dart';
import 'secure_function_service.dart';

class CompletionPayoutService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  final PayoutCalculationService _payoutService = PayoutCalculationService();

  final SecureFunctionService _secureFunctions = const SecureFunctionService();

  Future<Map<String, dynamic>> createPendingPayout({
    required String businessId,
    required String scalerId,
    required String campaignId,
    required String zoneId,
    required int assignedHomes,
    required int completedHomes,
    required double basePay,
    double completionBonus = 0.0,
  }) async {
    final double completionPercentage;

    if (assignedHomes <= 0) {
      completionPercentage = 0.0;
    } else {
      completionPercentage =
          (completedHomes.toDouble() / assignedHomes.toDouble()) * 100.0;
    }

    final payoutResult = _payoutService.calculatePayout(
      completionPercentage: completionPercentage,
      completionBonus: completionBonus,
      basePay: basePay,
    );

    final basePayout = (payoutResult['basePayout'] as num? ?? 0).toDouble();

    final bonus = (payoutResult['bonus'] as num? ?? 0).toDouble();

    final totalPayout = (payoutResult['totalPayout'] as num? ?? 0).toDouble();

    final payoutStatus = payoutResult['status']?.toString() ?? 'unknown';

    final payoutReference = _firestore.collection('payouts').doc(zoneId);

    final scalerWalletReference = _firestore
        .collection('wallets')
        .doc(scalerId);

    await _firestore.runTransaction((transaction) async {
      final existingPayoutSnapshot = await transaction.get(payoutReference);

      final scalerWalletSnapshot = await transaction.get(scalerWalletReference);

      final existingPayoutData = existingPayoutSnapshot.data();

      /*
         * A paid payout is final.
         *
         * Never let a later submission overwrite
         * a payout that has already been settled.
         */
      if (existingPayoutSnapshot.exists &&
          existingPayoutData?['status'] == 'paid') {
        throw Exception('This zone has already been paid.');
      }

      final scalerWalletData = scalerWalletSnapshot.data();

      final currentPendingBalance =
          (scalerWalletData?['pendingBalance'] as num?)?.toDouble() ?? 0.0;

      double previousPendingAmount = 0.0;

      if (existingPayoutSnapshot.exists &&
          existingPayoutData != null &&
          existingPayoutData['status'] == 'pending_review') {
        previousPendingAmount =
            (existingPayoutData['totalPayout'] as num?)?.toDouble() ?? 0.0;
      }

      final adjustedPendingBalance =
          currentPendingBalance - previousPendingAmount + totalPayout;

      transaction.set(payoutReference, {
        'businessId': businessId,
        'scalerId': scalerId,
        'campaignId': campaignId,
        'zoneId': zoneId,
        'assignedHomes': assignedHomes,
        'completedHomes': completedHomes,
        'completionPercentage': completionPercentage,
        'basePay': basePay,
        'basePayout': basePayout,
        'bonus': bonus,
        'totalPayout': totalPayout,
        'calculationStatus': payoutStatus,
        'status': 'pending_review',

        if (existingPayoutData?['createdAt'] != null)
          'createdAt': existingPayoutData!['createdAt']
        else
          'createdAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      transaction.set(scalerWalletReference, {
        'ownerId': scalerId,

        if (!scalerWalletSnapshot.exists) 'ownerType': 'scaler',

        'pendingBalance': adjustedPendingBalance < 0.0
            ? 0.0
            : adjustedPendingBalance,

        'updatedAt': FieldValue.serverTimestamp(),

        if (!scalerWalletSnapshot.exists)
          'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });

    return {
      'payoutId': payoutReference.id,
      'completionPercentage': completionPercentage,
      'basePayout': basePayout,
      'bonus': bonus,
      'totalPayout': totalPayout,
      'status': 'pending_review',
    };
  }

  Future<Map<String, dynamic>> approvePayout({
    required String payoutId,
    bool releaseBonus = false,
  }) async {
    return _secureFunctions.call(
      functionName: 'approveZonePayout',
      data: {'payoutId': payoutId, 'releaseBonus': releaseBonus},
    );
  }

  Future<void> approvePayoutLegacy({required String payoutId}) async {
    final payoutReference = _firestore.collection('payouts').doc(payoutId);

    /*
     * Deterministic transaction IDs prevent
     * duplicate ledger entries.
     */
    final globalTransactionReference = _firestore
        .collection('walletTransactions')
        .doc(payoutId);

    await _firestore.runTransaction((transaction) async {
      /*
         * Read payout first so we know which
         * wallets/campaign/zone to load.
         */
      final payoutSnapshot = await transaction.get(payoutReference);

      if (!payoutSnapshot.exists) {
        throw Exception('Payout record does not exist.');
      }

      final data = payoutSnapshot.data();

      if (data == null) {
        throw Exception('Payout record is invalid.');
      }

      final status = data['status']?.toString() ?? 'pending_review';

      /*
         * This is the idempotency protection.
         */
      if (status == 'paid') {
        throw Exception('This payout has already been paid.');
      }

      if (status != 'pending_review') {
        throw Exception(
          'This payout cannot be approved from its current status.',
        );
      }

      final businessId = data['businessId']?.toString();

      final scalerId = data['scalerId']?.toString();

      final campaignId = data['campaignId']?.toString();

      final zoneId = data['zoneId']?.toString();

      final totalPayout = (data['totalPayout'] as num? ?? 0).toDouble();

      if (businessId == null ||
          businessId.isEmpty ||
          scalerId == null ||
          scalerId.isEmpty ||
          campaignId == null ||
          campaignId.isEmpty ||
          zoneId == null ||
          zoneId.isEmpty) {
        throw Exception('Payout record is missing required information.');
      }

      if (totalPayout <= 0.0) {
        throw Exception('This completion does not qualify for payment.');
      }

      final businessWalletReference = _firestore
          .collection('wallets')
          .doc(businessId);

      final scalerWalletReference = _firestore
          .collection('wallets')
          .doc(scalerId);

      final campaignReference = _firestore
          .collection('campaigns')
          .doc(campaignId);

      final zoneReference = _firestore.collection('campaignZones').doc(zoneId);

      final businessLedgerReference = businessWalletReference
          .collection('transactions')
          .doc('payout_$payoutId');

      final scalerLedgerReference = scalerWalletReference
          .collection('transactions')
          .doc('payout_$payoutId');

      /*
         * All remaining reads happen before
         * any writes.
         */
      final businessWalletSnapshot = await transaction.get(
        businessWalletReference,
      );

      final scalerWalletSnapshot = await transaction.get(scalerWalletReference);

      final campaignSnapshot = await transaction.get(campaignReference);

      final zoneSnapshot = await transaction.get(zoneReference);

      if (!businessWalletSnapshot.exists) {
        throw Exception('Business wallet does not exist.');
      }

      if (!campaignSnapshot.exists) {
        throw Exception('Campaign does not exist.');
      }

      if (!zoneSnapshot.exists) {
        throw Exception('Campaign zone does not exist.');
      }

      final businessWalletData = businessWalletSnapshot.data();

      final scalerWalletData = scalerWalletSnapshot.data();

      final campaignData = campaignSnapshot.data();

      if (businessWalletData == null) {
        throw Exception('Business wallet data is invalid.');
      }

      if (campaignData == null) {
        throw Exception('Campaign data is invalid.');
      }

      final reservedCredits =
          (businessWalletData['reservedCredits'] as num?)?.toDouble() ?? 0.0;

      if (reservedCredits < totalPayout) {
        throw Exception(
          'The campaign does not have enough reserved credits to pay this Scaler.',
        );
      }

      final campaignReservedBudget =
          (campaignData['reservedWorkerBudget'] as num?)?.toDouble() ?? 0.0;

      if (campaignReservedBudget < totalPayout) {
        throw Exception(
          'The campaign reserved worker budget is insufficient for this payout.',
        );
      }

      final currentScalerBalance =
          (scalerWalletData?['availableBalance'] as num?)?.toDouble() ?? 0.0;

      final pendingBalance =
          (scalerWalletData?['pendingBalance'] as num?)?.toDouble() ?? 0.0;

      final newReservedCredits = reservedCredits - totalPayout;

      final newCampaignReservedBudget = campaignReservedBudget - totalPayout;

      final newScalerBalance = currentScalerBalance + totalPayout;

      final newPendingBalance = pendingBalance - totalPayout;

      /*
         * BUSINESS WALLET
         *
         * Reserved money is consumed.
         * Available credits do not change,
         * because the money was already removed
         * from availableCredits when reserved.
         */
      transaction.update(businessWalletReference, {
        'reservedCredits': newReservedCredits < 0.0 ? 0.0 : newReservedCredits,

        'updatedAt': FieldValue.serverTimestamp(),
      });

      /*
         * SCALER WALLET
         */
      transaction.set(scalerWalletReference, {
        'ownerId': scalerId,

        if (!scalerWalletSnapshot.exists) 'ownerType': 'scaler',

        'availableBalance': newScalerBalance,

        if (!scalerWalletSnapshot.exists ||
            scalerWalletData?['ownerType']?.toString() != 'business')
          'balance': newScalerBalance,

        'pendingBalance': newPendingBalance < 0.0 ? 0.0 : newPendingBalance,

        'updatedAt': FieldValue.serverTimestamp(),

        if (!scalerWalletSnapshot.exists)
          'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      /*
         * CAMPAIGN RESERVE
         *
         * This now tracks the actual money
         * that remains locked.
         */
      transaction.update(campaignReference, {
        'reservedWorkerBudget': newCampaignReservedBudget < 0.0
            ? 0.0
            : newCampaignReservedBudget,

        'totalPaidOut': FieldValue.increment(totalPayout),

        'fundingUpdatedAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      /*
         * PAYOUT
         */
      transaction.update(payoutReference, {
        'status': 'paid',

        'approvedAt': FieldValue.serverTimestamp(),

        'paidAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      /*
         * ZONE
         */
      transaction.update(zoneReference, {
        'status': 'completed',

        'paymentStatus': 'paid',

        'payoutAmount': totalPayout,

        'completedAt': FieldValue.serverTimestamp(),

        'paidAt': FieldValue.serverTimestamp(),

        'updatedAt': FieldValue.serverTimestamp(),
      });

      /*
         * GLOBAL PAYMENT RECORD
         */
      transaction.set(globalTransactionReference, {
        'type': 'scaler_payment',

        'payoutId': payoutId,

        'businessId': businessId,

        'scalerId': scalerId,

        'campaignId': campaignId,

        'zoneId': zoneId,

        'amount': totalPayout,

        'source': 'reserved_credits',

        'status': 'completed',

        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      /*
         * BUSINESS LEDGER
         */
      transaction.set(businessLedgerReference, {
        'type': 'reserved_payment',

        'walletSide': 'business',

        'payoutId': payoutId,

        'amount': totalPayout,

        'campaignId': campaignId,

        'zoneId': zoneId,

        'scalerId': scalerId,

        'description': 'Scaler payment released from reserved campaign funds.',

        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      /*
         * SCALER LEDGER
         */
      transaction.set(scalerLedgerReference, {
        'type': 'scaler_earnings',

        'walletSide': 'scaler',

        'payoutId': payoutId,

        'amount': totalPayout,

        'campaignId': campaignId,

        'zoneId': zoneId,

        'businessId': businessId,

        'description': 'Scaler earnings received from completed campaign work.',

        'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });
  }

  Future<void> requestRedo({
    required String payoutId,
    required String feedback,
  }) async {
    await _secureFunctions.call(
      functionName: 'requestZoneRedo',
      data: {'payoutId': payoutId, 'feedback': feedback},
    );
  }

  Future<void> dropScaler({required String payoutId}) async {
    await _secureFunctions.call(
      functionName: 'dropZoneScaler',
      data: {'payoutId': payoutId},
    );
  }
}
