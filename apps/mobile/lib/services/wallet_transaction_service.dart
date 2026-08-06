import 'package:cloud_firestore/cloud_firestore.dart';

class WalletTransactionService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<void> createScalerPayment({
    required String businessId,
    required String scalerId,
    required String campaignId,
    required double amount,
  }) async {
    if (amount <= 0.0) {
      throw Exception('Payment amount must be greater than zero.');
    }

    final businessWalletReference = _firestore
        .collection('wallets')
        .doc(businessId);

    final scalerWalletReference = _firestore
        .collection('wallets')
        .doc(scalerId);

    final transactionReference = _firestore
        .collection('walletTransactions')
        .doc();

    final businessLedgerReference = businessWalletReference
        .collection('transactions')
        .doc();

    final scalerLedgerReference = scalerWalletReference
        .collection('transactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final businessSnapshot = await transaction.get(businessWalletReference);

      if (!businessSnapshot.exists) {
        throw Exception('Business wallet does not exist.');
      }

      final businessData = businessSnapshot.data();

      if (businessData == null) {
        throw Exception('Business wallet data is invalid.');
      }

      final scalerSnapshot = await transaction.get(scalerWalletReference);

      final scalerData = scalerSnapshot.data();

      final reservedCredits =
          (businessData['reservedCredits'] as num?)?.toDouble() ?? 0.0;

      if (reservedCredits < amount) {
        throw Exception(
          'The campaign does not have enough reserved credits '
          'to pay this Scaler.',
        );
      }

      final currentScalerBalance =
          (scalerData?['availableBalance'] as num?)?.toDouble() ??
          (scalerData?['balance'] as num?)?.toDouble() ??
          0.0;

      final newReservedCredits = reservedCredits - amount;

      final newScalerBalance = currentScalerBalance + amount;

      transaction.update(businessWalletReference, {
        'reservedCredits': newReservedCredits,

        'updatedAt': FieldValue.serverTimestamp(),
      });

      transaction.set(scalerWalletReference, {
        'ownerId': scalerId,

        'ownerType': 'scaler',

        'availableBalance': newScalerBalance,

        'balance': newScalerBalance,

        'pendingBalance': scalerData?['pendingBalance'] ?? 0.0,

        'updatedAt': FieldValue.serverTimestamp(),

        if (!scalerSnapshot.exists) 'createdAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      transaction.set(transactionReference, {
        'type': 'scaler_payment',

        'businessId': businessId,

        'scalerId': scalerId,

        'campaignId': campaignId,

        'amount': amount,

        'source': 'reserved_credits',

        'status': 'completed',

        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(businessLedgerReference, {
        'type': 'reserved_payment',

        'amount': amount,

        'campaignId': campaignId,

        'scalerId': scalerId,

        'description': 'Scaler payment released from reserved campaign funds.',

        'createdAt': FieldValue.serverTimestamp(),
      });

      transaction.set(scalerLedgerReference, {
        'type': 'scaler_earnings',

        'amount': amount,

        'campaignId': campaignId,

        'businessId': businessId,

        'description': 'Scaler earnings received from completed campaign work.',

        'createdAt': FieldValue.serverTimestamp(),
      });
    });
  }
}
