import 'package:flutter/material.dart';

/// All amounts and return status come from the authoritative settlement.
class ReserveSettlementPanel extends StatelessWidget {
  const ReserveSettlementPanel({super.key, required this.settlement});
  final Map<String, dynamic> settlement;
  @override
  Widget build(BuildContext context) {
    String money(dynamic value) => value is num
        ? '\$${(value / 100).toStringAsFixed(2)}'
        : 'Pending review';
    final status = settlement['returnStatus'];
    final returned = status == 'refunded';
    final preview = status == 'preview';
    final attention = status == 'refund_attention_required';
    final amount = settlement['businessReturnCents'];
    Widget row(String label, dynamic value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Wrap(
        spacing: 12,
        children: [
          Text(label),
          Text(
            money(value),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              preview ? 'Cost after approval' : 'Final campaign cost',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            row('Scaler Pay', settlement['earnedWorkerCents']),
            Text(
              (settlement['unusedWorkerCents'] as num? ?? 0) > 0
                  ? 'Only approved compensation is charged.'
                  : 'Full accepted compensation earned.',
            ),
            row('ScaledCircle Fee', settlement['earnedFeeCents']),
            row(
              amount == 0
                  ? 'No return due'
                  : returned
                  ? 'Returned to You'
                  : preview
                  ? 'Expected return after approval'
                  : attention
                  ? 'Return needs attention'
                  : 'Return pending',
              amount,
            ),
            row('Total Final Cost', settlement['finalCostCents']),
            if (amount is num && amount > 0)
              Text(
                amount == 0
                    ? 'No return due'
                    : returned
                    ? 'Your unused pay reserve and associated fee were refunded to the original payment method.'
                    : preview
                    ? 'Unused pay and its associated fee will be refunded after approval.'
                    : attention
                    ? 'The payment provider could not finish the refund. Your return remains owed and needs support review.'
                    : 'The refund is awaiting payment-provider confirmation. It is not yet returned money.',
              ),
          ],
        ),
      ),
    );
  }
}
