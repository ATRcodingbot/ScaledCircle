import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/scaler_cashout_service.dart';
import '../../widgets/scaler_cashout_card.dart';

class ScalerWalletScreen extends StatelessWidget {
  const ScalerWalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('You must be logged in.')),
      );
    }

    final walletReference = FirebaseFirestore.instance
        .collection('wallets')
        .doc(user.uid);

    return Scaffold(
      appBar: AppBar(title: const Text('My Earnings'), centerTitle: true),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: walletReference.snapshots(),
        builder: (context, walletSnapshot) {
          if (walletSnapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.cloud_off_outlined, size: 42),
                    const SizedBox(height: 12),
                    const Text(
                      "We couldn't load your earnings right now.",
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Your balance has not been changed. Check your connection and try again.',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }

          if (walletSnapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final walletData = walletSnapshot.data?.data() ?? <String, dynamic>{};

          final availableBalance =
              (walletData['availableBalance'] as num?)?.toDouble() ?? 0.0;

          final pendingBalance =
              (walletData['pendingBalance'] as num?)?.toDouble() ?? 0.0;

          final totalBalance = availableBalance + pendingBalance;

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Scaler Wallet',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 8),

              const Text(
                'Track earnings from completed Scaled Circle campaigns.',
              ),

              const SizedBox(height: 24),

              if (ScalerCashoutService.enabled) const ScalerCashoutCard(),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Verified Earnings',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 8),

                      Text(
                        '\$${availableBalance.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 8),

                      const Text(
                        'Approved work earnings recorded in your ScaledCircle Wallet. Cash-out is not yet available.',
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: _balanceCard(
                      icon: Icons.hourglass_top_outlined,
                      title: 'Pending',
                      amount: pendingBalance,
                    ),
                  ),

                  const SizedBox(width: 12),

                  Expanded(
                    child: _balanceCard(
                      icon: Icons.account_balance_wallet_outlined,
                      title: 'Total Recorded',
                      amount: totalBalance,
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 30),

              const Text(
                'Earnings Activity',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 12),

              StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: walletReference.collection('transactions').snapshots(),
                builder: (context, transactionSnapshot) {
                  if (transactionSnapshot.hasError) {
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: const Text(
                          "We couldn't load your earnings activity. Your balance has not been changed. Try again shortly.",
                          textAlign: TextAlign.center,
                        ),
                      ),
                    );
                  }

                  if (transactionSnapshot.connectionState ==
                      ConnectionState.waiting) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: CircularProgressIndicator(),
                      ),
                    );
                  }

                  final transactions =
                      List<QueryDocumentSnapshot<Map<String, dynamic>>>.from(
                        transactionSnapshot.data?.docs ?? [],
                      ).where((transaction) {
                        return _isScalerTransaction(transaction.data());
                      }).toList();

                  transactions.sort((a, b) {
                    final aCreated = a.data()['createdAt'];

                    final bCreated = b.data()['createdAt'];

                    if (aCreated is Timestamp && bCreated is Timestamp) {
                      return bCreated.compareTo(aCreated);
                    }

                    if (aCreated is Timestamp) {
                      return -1;
                    }

                    if (bCreated is Timestamp) {
                      return 1;
                    }

                    return 0;
                  });

                  if (transactions.isEmpty) {
                    return const Card(
                      child: Padding(
                        padding: EdgeInsets.all(22),
                        child: Column(
                          children: [
                            Icon(Icons.payments_outlined, size: 44),
                            SizedBox(height: 12),
                            Text(
                              'No earnings yet',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            SizedBox(height: 6),
                            Text(
                              'Verified work earnings will appear here after Business review.',
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  return Column(
                    children: transactions.map((transaction) {
                      return _transactionCard(transaction.data());
                    }).toList(),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _balanceCard({
    required IconData icon,
    required String title,
    required double amount,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, size: 28),

            const SizedBox(height: 8),

            Text(
              '\$${amount.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 4),

            Text(title, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  Widget _transactionCard(Map<String, dynamic> data) {
    final amount = (data['amount'] as num?)?.toDouble() ?? 0.0;

    final type = data['type']?.toString() ?? 'transaction';

    final description =
        data['description']?.toString() ?? _transactionDescription(type);

    final createdAt = data['createdAt'];

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(child: Icon(_transactionIcon(type))),
        title: Text(
          description,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(_formatTimestamp(createdAt)),
        trailing: Text(
          '\$${amount.toStringAsFixed(2)}',
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  bool _isScalerTransaction(Map<String, dynamic> data) {
    final walletSide = data['walletSide']?.toString();

    if (walletSide != null && walletSide.isNotEmpty) {
      return walletSide == 'scaler';
    }

    final type = data['type']?.toString() ?? '';

    // Legacy records predate walletSide. Only known Scaler ledger types are
    // included so business reserves, subscriptions, and credits never appear
    // as earnings when one login is used in both account views.
    return const {
      'scaler_earnings',
      'scaler_payment',
      'payout',
      'withdrawal',
    }.contains(type);
  }

  String _transactionDescription(String type) {
    switch (type) {
      case 'scaler_earnings':
      case 'scaler_payment':
        return 'Campaign Payment';

      case 'payout':
        return 'Campaign Payment';

      case 'deposit':
        return 'Wallet Credit';

      case 'withdrawal':
        return 'Withdrawal';

      default:
        return 'Wallet Activity';
    }
  }

  IconData _transactionIcon(String type) {
    switch (type) {
      case 'scaler_earnings':
      case 'scaler_payment':
      case 'payout':
      case 'deposit':
        return Icons.arrow_downward;

      case 'withdrawal':
        return Icons.arrow_upward;

      default:
        return Icons.receipt_long_outlined;
    }
  }

  String _formatTimestamp(dynamic value) {
    if (value is! Timestamp) {
      return 'Processing';
    }

    final date = value.toDate();

    final hour = date.hour == 0
        ? 12
        : date.hour > 12
        ? date.hour - 12
        : date.hour;

    final minute = date.minute.toString().padLeft(2, '0');

    final period = date.hour >= 12 ? 'PM' : 'AM';

    return '${date.month}/${date.day}/${date.year} '
        '$hour:$minute $period';
  }
}
