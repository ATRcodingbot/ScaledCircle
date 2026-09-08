import 'package:flutter/material.dart';

class AutomaticCanvassingProgress extends StatelessWidget {
  const AutomaticCanvassingProgress({
    super.key,
    required this.progress,
    required this.contract,
  });
  final Map<String, dynamic> progress, contract;
  @override
  Widget build(BuildContext context) {
    final raw = progress['coveragePercentage'];
    final reliable =
        progress['state'] == 'available' &&
        raw is num &&
        raw.isFinite &&
        progress['reliable'] != false;
    final percent = reliable ? raw.toDouble() : null;
    final base = contract['baseAmountCents'],
        bonus = contract['bonusAmountCents'];
    final hasBonus = bonus is num && bonus > 0;
    String money(dynamic value) => value is num
        ? '\$${(value / 100).toStringAsFixed(2)}'
        : 'Awaiting accepted contract';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Route Coverage Estimate: ${percent == null ? 'Calculating…' : '${percent.toStringAsFixed(1)}%'}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Text(
              'Progress updates automatically from accepted GPS evidence.',
            ),
            const SizedBox(height: 12),
            Text('Base Pay: ${money(base)}'),
            const Text('Base secured at: 80%'),
            if (hasBonus) ...[
              Text('Coverage Bonus: +${money(bonus)}'),
              const Text('Bonus threshold: 95%'),
            ] else
              const Text(
                'Coverage Bonus: No additional bonus in this accepted contract',
              ),
            const Text('Goal: 100%'),
            const SizedBox(height: 12),
            if (percent == null)
              const Text(
                'Coverage is being verified. Your route continues to record while tracking is active.',
              )
            else if (percent < 80)
              const Text('Keep going to secure base pay')
            else ...[
              const Text('Base Pay Secured ✓'),
              if (percent < 95 && hasBonus)
                const Text('Continue to 95% for your bonus')
              else if (hasBonus)
                const Text('Coverage Bonus Earned ✓'),
              const Text('Aim for 100%'),
            ],
            const SizedBox(height: 8),
            const Text(
              'Reaching a coverage threshold is provisional. Finalization, evidence checks and Business review still apply. This is not a count of households serviced.',
            ),
          ],
        ),
      ),
    );
  }
}
