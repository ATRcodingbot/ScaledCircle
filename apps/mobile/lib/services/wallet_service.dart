import 'package:cloud_firestore/cloud_firestore.dart';

class WalletService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<void> createWallet({
    required String userId,
    required String ownerType,
  }) async {
    final walletReference = _firestore.collection('wallets').doc(userId);

    final walletSnapshot = await walletReference.get();

    if (walletSnapshot.exists) {
      return;
    }

    await walletReference.set({
      'ownerId': userId,
      'ownerType': ownerType,

      // General compatibility balance.
      'balance': 0.0,

      // Business wallet fields.
      'availableCredits': 0.0,
      'reservedCredits': 0.0,
      'totalPaidOut': 0.0,

      // Scaler wallet fields.
      'availableBalance': 0.0,
      'pendingBalance': 0.0,

      // Promotional testing fields.
      'promotionalCreditsGranted': 0.0,

      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<double> getBalance(String userId) async {
    final snapshot = await _firestore.collection('wallets').doc(userId).get();

    if (!snapshot.exists) {
      return 0.0;
    }

    final data = snapshot.data();

    if (data == null) {
      return 0.0;
    }

    final ownerType = data['ownerType']?.toString();

    if (ownerType == 'business') {
      return (data['availableCredits'] as num?)?.toDouble() ??
          (data['balance'] as num?)?.toDouble() ??
          0.0;
    }

    if (ownerType == 'scaler') {
      return (data['availableBalance'] as num?)?.toDouble() ??
          (data['balance'] as num?)?.toDouble() ??
          0.0;
    }

    return (data['balance'] as num?)?.toDouble() ?? 0.0;
  }

  Future<double> getAvailableCredits(String businessId) async {
    final snapshot = await _firestore
        .collection('wallets')
        .doc(businessId)
        .get();

    if (!snapshot.exists) {
      return 0.0;
    }

    final data = snapshot.data();

    return (data?['availableCredits'] as num?)?.toDouble() ??
        (data?['balance'] as num?)?.toDouble() ??
        0.0;
  }

  Future<double> getReservedCredits(String businessId) async {
    final snapshot = await _firestore
        .collection('wallets')
        .doc(businessId)
        .get();

    if (!snapshot.exists) {
      return 0.0;
    }

    final data = snapshot.data();

    return (data?['reservedCredits'] as num?)?.toDouble() ?? 0.0;
  }

  Future<double> getScalerBalance(String scalerId) async {
    final snapshot = await _firestore.collection('wallets').doc(scalerId).get();

    if (!snapshot.exists) {
      return 0.0;
    }

    final data = snapshot.data();

    return (data?['availableBalance'] as num?)?.toDouble() ?? 0.0;
  }

  Future<void> addCredits({
    required String userId,
    required double amount,
    required String description,
  }) async {
    if (amount <= 0.0) {
      throw Exception('Credit amount must be greater than zero.');
    }

    final walletReference = _firestore.collection('wallets').doc(userId);

    final transactionReference = walletReference
        .collection('transactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final walletSnapshot = await transaction.get(walletReference);

      if (!walletSnapshot.exists) {
        throw Exception('Wallet does not exist.');
      }

      final walletData = walletSnapshot.data();

      if (walletData == null) {
        throw Exception('Wallet data is invalid.');
      }

      final ownerType = walletData['ownerType']?.toString();

      final currentBalance = (walletData['balance'] as num?)?.toDouble() ?? 0.0;

      final currentAvailableCredits =
          (walletData['availableCredits'] as num?)?.toDouble() ??
          currentBalance;

      final currentAvailableBalance =
          (walletData['availableBalance'] as num?)?.toDouble() ??
          currentBalance;

      if (ownerType == 'business') {
        final newAvailableCredits = currentAvailableCredits + amount;

        transaction.update(walletReference, {
          'availableCredits': newAvailableCredits,
          'balance': newAvailableCredits,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } else if (ownerType == 'scaler') {
        final newAvailableBalance = currentAvailableBalance + amount;

        transaction.update(walletReference, {
          'availableBalance': newAvailableBalance,
          'balance': newAvailableBalance,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } else {
        transaction.update(walletReference, {
          'balance': currentBalance + amount,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }

      transaction.set(transactionReference, {
        'type': 'deposit',
        'amount': amount,
        'description': description,
        'createdAt': FieldValue.serverTimestamp(),
      });
    });
  }

  Future<void> grantPromotionalCredits({
    required String businessId,
    required double amount,
    required String promoKey,
    required String description,
  }) async {
    if (amount <= 0.0) {
      throw Exception('Promotional credit amount must be greater than zero.');
    }

    if (promoKey.trim().isEmpty) {
      throw Exception('A promotional credit key is required.');
    }

    final walletReference = _firestore.collection('wallets').doc(businessId);

    final redemptionReference = walletReference
        .collection('promoRedemptions')
        .doc(promoKey);

    final transactionReference = walletReference
        .collection('transactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final walletSnapshot = await transaction.get(walletReference);

      final redemptionSnapshot = await transaction.get(redemptionReference);

      // Prevent the same promotional grant
      // from being redeemed twice.
      if (redemptionSnapshot.exists) {
        return;
      }

      if (!walletSnapshot.exists) {
        transaction.set(walletReference, {
          'ownerId': businessId,
          'ownerType': 'business',
          'balance': amount,
          'availableCredits': amount,
          'reservedCredits': 0.0,
          'totalPaidOut': 0.0,
          'availableBalance': 0.0,
          'pendingBalance': 0.0,
          'promotionalCreditsGranted': amount,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } else {
        final data = walletSnapshot.data();

        if (data == null) {
          throw Exception('Business wallet data is invalid.');
        }

        final ownerType = data['ownerType']?.toString();

        if (ownerType != null &&
            ownerType.isNotEmpty &&
            ownerType != 'business') {
          throw Exception(
            'Promotional business credits cannot be added to this wallet.',
          );
        }

        final availableCredits =
            (data['availableCredits'] as num?)?.toDouble() ??
            (data['balance'] as num?)?.toDouble() ??
            0.0;

        final promotionalCreditsGranted =
            (data['promotionalCreditsGranted'] as num?)?.toDouble() ?? 0.0;

        final newAvailableCredits = availableCredits + amount;

        transaction.set(walletReference, {
          'ownerId': businessId,
          'ownerType': 'business',
          'availableCredits': newAvailableCredits,
          'balance': newAvailableCredits,
          'promotionalCreditsGranted': promotionalCreditsGranted + amount,
          'updatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }

      transaction.set(redemptionReference, {
        'promoKey': promoKey,
        'amount': amount,
        'description': description,
        'cashValue': 0.0,
        'developmentOnly': true,
        'redeemedAt': FieldValue.serverTimestamp(),
      });

      transaction.set(transactionReference, {
        'type': 'promotional_credit',
        'amount': amount,
        'promoKey': promoKey,
        'description': description,
        'cashValue': 0.0,
        'developmentOnly': true,
        'createdAt': FieldValue.serverTimestamp(),
      });
    });
  }

  Future<void> reserveCredits({
    required String businessId,
    required double amount,
    required String description,
    String? campaignId,
    String? zoneId,
  }) async {
    if (amount <= 0.0) {
      throw Exception('Reserve amount must be greater than zero.');
    }

    final walletReference = _firestore.collection('wallets').doc(businessId);

    final transactionReference = walletReference
        .collection('transactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final walletSnapshot = await transaction.get(walletReference);

      if (!walletSnapshot.exists) {
        throw Exception('Business wallet does not exist.');
      }

      final data = walletSnapshot.data();

      if (data == null) {
        throw Exception('Business wallet is invalid.');
      }

      final availableCredits =
          (data['availableCredits'] as num?)?.toDouble() ??
          (data['balance'] as num?)?.toDouble() ??
          0.0;

      final reservedCredits =
          (data['reservedCredits'] as num?)?.toDouble() ?? 0.0;

      if (availableCredits < amount) {
        throw Exception('Insufficient available credits.');
      }

      final newAvailableCredits = availableCredits - amount;

      final newReservedCredits = reservedCredits + amount;

      transaction.update(walletReference, {
        'availableCredits': newAvailableCredits,
        'reservedCredits': newReservedCredits,
        'balance': newAvailableCredits,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      transaction.set(transactionReference, {
        'type': 'campaign_reserve',
        'amount': amount,
        'description': description,
        'campaignId': campaignId,
        'zoneId': zoneId,
        'createdAt': FieldValue.serverTimestamp(),
      });
    });
  }

  Future<void> releaseReservedCredits({
    required String businessId,
    required double amount,
    required String description,
    String? campaignId,
    String? zoneId,
  }) async {
    if (amount <= 0.0) {
      throw Exception('Release amount must be greater than zero.');
    }

    final walletReference = _firestore.collection('wallets').doc(businessId);

    final transactionReference = walletReference
        .collection('transactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final walletSnapshot = await transaction.get(walletReference);

      if (!walletSnapshot.exists) {
        throw Exception('Business wallet does not exist.');
      }

      final data = walletSnapshot.data();

      if (data == null) {
        throw Exception('Business wallet is invalid.');
      }

      final availableCredits =
          (data['availableCredits'] as num?)?.toDouble() ?? 0.0;

      final reservedCredits =
          (data['reservedCredits'] as num?)?.toDouble() ?? 0.0;

      if (reservedCredits < amount) {
        throw Exception('Not enough reserved credits.');
      }

      final newAvailableCredits = availableCredits + amount;

      final newReservedCredits = reservedCredits - amount;

      transaction.update(walletReference, {
        'availableCredits': newAvailableCredits,
        'reservedCredits': newReservedCredits,
        'balance': newAvailableCredits,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      transaction.set(transactionReference, {
        'type': 'reserve_release',
        'amount': amount,
        'description': description,
        'campaignId': campaignId,
        'zoneId': zoneId,
        'createdAt': FieldValue.serverTimestamp(),
      });
    });
  }

  Future<void> subtractCredits({
    required String userId,
    required double amount,
    required String description,
  }) async {
    if (amount <= 0.0) {
      throw Exception('Amount must be greater than zero.');
    }

    final walletReference = _firestore.collection('wallets').doc(userId);

    final transactionReference = walletReference
        .collection('transactions')
        .doc();

    await _firestore.runTransaction((transaction) async {
      final walletSnapshot = await transaction.get(walletReference);

      if (!walletSnapshot.exists) {
        throw Exception('Wallet does not exist.');
      }

      final data = walletSnapshot.data();

      if (data == null) {
        throw Exception('Wallet is invalid.');
      }

      final ownerType = data['ownerType']?.toString();

      if (ownerType == 'business') {
        final availableCredits =
            (data['availableCredits'] as num?)?.toDouble() ??
            (data['balance'] as num?)?.toDouble() ??
            0.0;

        if (availableCredits < amount) {
          throw Exception('Insufficient credits.');
        }

        final newAvailableCredits = availableCredits - amount;

        transaction.update(walletReference, {
          'availableCredits': newAvailableCredits,
          'balance': newAvailableCredits,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } else {
        final availableBalance =
            (data['availableBalance'] as num?)?.toDouble() ??
            (data['balance'] as num?)?.toDouble() ??
            0.0;

        if (availableBalance < amount) {
          throw Exception('Insufficient balance.');
        }

        final newAvailableBalance = availableBalance - amount;

        transaction.update(walletReference, {
          'availableBalance': newAvailableBalance,
          'balance': newAvailableBalance,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }

      transaction.set(transactionReference, {
        'type': 'withdrawal',
        'amount': amount,
        'description': description,
        'createdAt': FieldValue.serverTimestamp(),
      });
    });
  }
}
