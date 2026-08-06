class CreditTransaction {
  final String id;

  final String walletId;

  final String ownerId;

  final String type;
  // deposit
  // campaign_hold
  // worker_payment
  // bonus
  // refund

  final double amount;

  final String description;

  final String? campaignId;

  final String? zoneId;

  final DateTime? createdAt;

  CreditTransaction({
    required this.id,
    required this.walletId,
    required this.ownerId,
    required this.type,
    required this.amount,
    required this.description,
    this.campaignId,
    this.zoneId,
    this.createdAt,
  });

  factory CreditTransaction.fromMap(String id, Map<String, dynamic> data) {
    return CreditTransaction(
      id: id,

      walletId: data['walletId']?.toString() ?? '',

      ownerId: data['ownerId']?.toString() ?? '',

      type: data['type']?.toString() ?? '',

      amount: (data['amount'] as num?)?.toDouble() ?? 0,

      description: data['description']?.toString() ?? '',

      campaignId: data['campaignId']?.toString(),

      zoneId: data['zoneId']?.toString(),

      createdAt: data['createdAt'] as DateTime?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'walletId': walletId,

      'ownerId': ownerId,

      'type': type,

      'amount': amount,

      'description': description,

      'campaignId': campaignId,

      'zoneId': zoneId,

      'createdAt': createdAt,
    };
  }
}
