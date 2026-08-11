import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/platform_billing_service.dart';

class BusinessWalletScreen extends StatefulWidget {
  const BusinessWalletScreen({super.key});

  @override
  State<BusinessWalletScreen> createState() => _BusinessWalletScreenState();
}

class _BusinessWalletScreenState extends State<BusinessWalletScreen> {
  final PlatformBillingService _billingService = PlatformBillingService();
  bool _openingCheckout = false;

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('You must be logged in to view your wallet.')),
      );
    }

    final walletReference = FirebaseFirestore.instance
        .collection('wallets')
        .doc(user.uid);
    final transactionsQuery = walletReference
        .collection('transactions')
        .orderBy('createdAt', descending: true);

    return Scaffold(
      appBar: AppBar(title: const Text('Business Wallet')),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: walletReference.snapshots(),
        builder: (context, walletSnapshot) {
          if (walletSnapshot.hasError) {
            return Center(
              child: Text('Unable to load wallet: ${walletSnapshot.error}'),
            );
          }

          if (!walletSnapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final wallet = walletSnapshot.data!.data() ?? const {};
          final available =
              (wallet['availableCredits'] as num?)?.toDouble() ?? 0.0;
          final reserved =
              (wallet['reservedCredits'] as num?)?.toDouble() ?? 0.0;
          final recordedPaidOut =
              (wallet['totalPaidOut'] as num?)?.toDouble() ?? 0.0;

          return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: transactionsQuery.snapshots(),
            builder: (context, transactionSnapshot) {
              if (transactionSnapshot.hasError) {
                return Center(
                  child: Text(
                    'Unable to load payment activity: '
                    '${transactionSnapshot.error}',
                  ),
                );
              }

              final transactions = transactionSnapshot.data?.docs ?? [];
              final ledgerPaidOut = transactions
                  .where(
                    (transaction) =>
                        transaction.data()['type']?.toString() ==
                        'reserved_payment',
                  )
                  .fold<double>(
                    0.0,
                    (total, transaction) =>
                        total +
                        ((transaction.data()['amount'] as num?)?.toDouble() ??
                            0.0),
                  );
              final paidOut = ledgerPaidOut > recordedPaidOut
                  ? ledgerPaidOut
                  : recordedPaidOut;

              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text(
                    'Campaign Funding',
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Track money available for campaigns, secured for active '
                    'work, and paid to Scalers.',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                  const SizedBox(height: 18),
                  _summaryCards(
                    available: available,
                    reserved: reserved,
                    paidOut: paidOut,
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _openingCheckout
                          ? null
                          : () => _showAddCreditsDialog(user.uid),
                      icon: _openingCheckout
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.add_card_outlined),
                      label: const Text('Add Campaign Credits with Stripe'),
                    ),
                  ),
                  const SizedBox(height: 26),
                  const Text(
                    'Payment Activity',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 10),
                  if (transactionSnapshot.connectionState ==
                          ConnectionState.waiting &&
                      transactions.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (transactions.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(20),
                        child: Text('No wallet activity yet.'),
                      ),
                    )
                  else
                    ...transactions.map(_transactionCard),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _showAddCreditsDialog(String businessId) async {
    final controller = TextEditingController(text: '500');
    final credits = await showDialog<int>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Add campaign credits'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Credits fund Scaler pay and campaign fees. '
              '1 credit equals \$1.',
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Credits',
                helperText: 'Enter 10–10,000',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final value = int.tryParse(controller.text.trim());
              if (value == null || value < 10 || value > 10000) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Enter between 10 and 10,000 credits.'),
                  ),
                );
                return;
              }
              Navigator.pop(dialogContext, value);
            },
            child: const Text('Continue to Stripe'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (credits == null || !mounted) return;

    setState(() => _openingCheckout = true);
    try {
      await _billingService.purchaseCredits(
        businessId: businessId,
        credits: credits,
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Unable to open checkout: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _openingCheckout = false);
    }
  }

  Widget _summaryCards({
    required double available,
    required double reserved,
    required double paidOut,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 700 ? 3 : 2;
        final width = (constraints.maxWidth - ((columns - 1) * 12)) / columns;

        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _summaryCard(
              width: width,
              icon: Icons.account_balance_wallet_outlined,
              label: 'Available',
              amount: available,
            ),
            _summaryCard(
              width: width,
              icon: Icons.lock_outline,
              label: 'Reserved',
              amount: reserved,
            ),
            _summaryCard(
              width: width,
              icon: Icons.payments_outlined,
              label: 'Paid Out',
              amount: paidOut,
            ),
          ],
        );
      },
    );
  }

  Widget _summaryCard({
    required double width,
    required IconData icon,
    required String label,
    required double amount,
  }) {
    return SizedBox(
      width: width,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 20),
          child: Column(
            children: [
              Icon(icon, size: 30),
              const SizedBox(height: 10),
              Text(
                '\$${amount.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(label, textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }

  Widget _transactionCard(
    QueryDocumentSnapshot<Map<String, dynamic>> transaction,
  ) {
    final data = transaction.data();
    final type = data['type']?.toString() ?? '';
    final amount = (data['amount'] as num?)?.toDouble() ?? 0.0;
    final platformFee = (data['platformFee'] as num?)?.toDouble() ?? 0.0;
    final description = data['description']?.toString() ?? '';
    final createdAt = data['createdAt'];

    late final IconData icon;
    late final String title;
    late final String amountPrefix;

    switch (type) {
      case 'reserved_payment':
        icon = Icons.payments_outlined;
        title = 'Paid to Scaler';
        amountPrefix = '-';
        break;
      case 'campaign_reserve':
        icon = Icons.lock_outline;
        title = 'Campaign Funding Reserved';
        amountPrefix = '';
        break;
      case 'promotional_credit':
      case 'deposit':
        icon = Icons.add_card_outlined;
        title = 'Credits Added';
        amountPrefix = '+';
        break;
      default:
        icon = Icons.receipt_long_outlined;
        title = 'Wallet Activity';
        amountPrefix = '';
    }

    final subtitleParts = <String>[
      if (description.isNotEmpty) description,
      if (platformFee > 0) 'Platform fee: \$${platformFee.toStringAsFixed(2)}',
      if (createdAt is Timestamp) _formatTimestamp(createdAt.toDate()),
    ];

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(child: Icon(icon)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: subtitleParts.isEmpty ? null : Text(subtitleParts.join('\n')),
        trailing: Text(
          '$amountPrefix\$${amount.toStringAsFixed(2)}',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        isThreeLine: subtitleParts.length > 1,
      ),
    );
  }

  String _formatTimestamp(DateTime timestamp) {
    final local = timestamp.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final minute = local.minute.toString().padLeft(2, '0');
    final period = local.hour >= 12 ? 'PM' : 'AM';

    return '${local.month}/${local.day}/${local.year} '
        '$hour:$minute $period';
  }
}
