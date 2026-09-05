import 'package:flutter/material.dart';

/// Display-only projections: TEST availability never contributes to earnings.
class ScalerWalletMetrics extends StatelessWidget {
  const ScalerWalletMetrics({
    super.key,
    this.testAvailable,
    required this.pendingEarnings,
    required this.recordedEarnings,
  });
  final double? testAvailable;
  final double pendingEarnings;
  final double recordedEarnings;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final cards = <Widget>[
        if (testAvailable != null)
          _metric(
            Icons.payments_outlined,
            'Available',
            testAvailable!,
            'TEST funds only',
          ),
        _metric(
          Icons.hourglass_top_outlined,
          'Pending',
          pendingEarnings,
          'Campaign earnings',
        ),
        _metric(
          Icons.account_balance_wallet_outlined,
          'Total Recorded',
          recordedEarnings,
          'Campaign earnings',
        ),
      ];
      final columns = constraints.maxWidth < 480 ? 1 : cards.length;
      final width = (constraints.maxWidth - 12 * (columns - 1)) / columns;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final card in cards) SizedBox(width: width, child: card),
        ],
      );
    },
  );

  Widget _metric(IconData icon, String title, double amount, String caption) =>
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Icon(icon, size: 28),
              const SizedBox(height: 8),
              Text(
                '\$${amount.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(title, textAlign: TextAlign.center),
              const SizedBox(height: 4),
              Text(
                caption,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
      );
}
