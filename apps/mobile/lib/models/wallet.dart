class Wallet {
  final String id;

  final String ownerId;

  final String ownerType;
  // business or scaler

  final double balance;

  final DateTime? createdAt;

  final DateTime? updatedAt;

  Wallet({
    required this.id,
    required this.ownerId,
    required this.ownerType,
    required this.balance,
    this.createdAt,
    this.updatedAt,
  });

  factory Wallet.fromMap(String id, Map<String, dynamic> data) {
    return Wallet(
      id: id,
      ownerId: data['ownerId']?.toString() ?? '',
      ownerType: data['ownerType']?.toString() ?? '',
      balance: (data['balance'] as num?)?.toDouble() ?? 0,
      createdAt: data['createdAt'] as DateTime?,
      updatedAt: data['updatedAt'] as DateTime?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'ownerId': ownerId,
      'ownerType': ownerType,
      'balance': balance,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }

  Wallet copyWith({double? balance, DateTime? updatedAt}) {
    return Wallet(
      id: id,
      ownerId: ownerId,
      ownerType: ownerType,
      balance: balance ?? this.balance,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
