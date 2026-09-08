import 'package:flutter/material.dart';

String earningsMoney(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';

/// Compact secondary states; never calculates balances from pending work.
class ScalerWalletMetrics extends StatelessWidget {
  const ScalerWalletMetrics({
    super.key,
    required this.awaitingReviewCents,
    required this.payoutPendingCents,
    required this.lifetimeCents,
    this.reviewAmountUnknown = false,
  });
  final int awaitingReviewCents;
  final int payoutPendingCents;
  final int lifetimeCents;
  final bool reviewAmountUnknown;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      _metric(
        'Awaiting Business Review',
        reviewAmountUnknown && awaitingReviewCents == 0
            ? 'Pending assessment'
            : earningsMoney(awaitingReviewCents),
        reviewAmountUnknown
            ? 'Some submitted work still needs a payment assessment.'
            : 'Expected payment; not in your available balance.',
      ),
      if (payoutPendingCents > 0)
        _metric(
          'Payout Pending',
          earningsMoney(payoutPendingCents),
          'A requested cash out is processing.',
        ),
      _metric(
        'Lifetime Earnings',
        earningsMoney(lifetimeCents),
        'All approved, posted work payments.',
      ),
    ],
  );
  Widget _metric(String label, String amount, String detail) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: double.infinity,
          child: Wrap(
            spacing: 16,
            runSpacing: 4,
            alignment: WrapAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(
                amount,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(detail),
      ],
    ),
  );
}
