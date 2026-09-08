import 'package:flutter/material.dart';

/// Displays server-returned coverage and eligibility. It never calculates pay.
class CompletionPaySummary extends StatelessWidget {
  const CompletionPaySummary({
    super.key,
    required this.evidence,
    this.submitted = false,
  });
  final Map<String, dynamic> evidence;
  final bool submitted;

  @override
  Widget build(BuildContext context) {
    final estimate = Map<String, dynamic>.from(
      evidence['estimate'] as Map? ?? {},
    );
    final policy = Map<String, dynamic>.from(evidence['policy'] as Map? ?? {});
    final percent = estimate['coveragePercentage'];
    final base = policy['baseEligibility']?.toString();
    final eligible = base == 'Eligible';
    final technical = policy['baseProtected'] == true;
    final bonus = policy['acceptedBonusAmountCents'];
    final bonusEarned = policy['coverageBonusEligible'] == true;
    String money(dynamic cents) => cents is num
        ? '\$${(cents / 100).toStringAsFixed(2)}'
        : 'Pending review';
    Widget line(String name, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Wrap(
        spacing: 12,
        runSpacing: 3,
        children: [
          Text('$name:', style: const TextStyle(fontWeight: FontWeight.w600)),
          Text(value),
        ],
      ),
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Route Coverage Estimate',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            Text(
              percent is num && percent.isFinite
                  ? '${percent.toStringAsFixed(2)}%'
                  : 'Calculating',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            line(
              'Base Pay',
              '${money(policy['baseAmountCents'])} — ${eligible
                  ? 'Secured · pending Business review'
                  : technical
                  ? 'Protected · technical review required'
                  : 'Not yet eligible'}',
            ),
            line('Base threshold', '${policy['baseThreshold'] ?? 80}%'),
            line(
              'Coverage Bonus',
              bonus is num && bonus > 0
                  ? '+${money(bonus)} — ${technical
                        ? 'Pending'
                        : bonusEarned
                        ? 'Earned · pending Business review'
                        : 'Not earned'}'
                  : 'No additional bonus accepted',
            ),
            if (bonus is num && bonus > 0)
              line('Bonus threshold', '${policy['bonusThreshold'] ?? 95}%'),
            line(
              'Expected after Business approval',
              money(policy['payableAmountCents']),
            ),
            Text(
              submitted
                  ? 'Awaiting Business Review'
                  : 'Aim for 100%. Final evidence and Business review apply.',
            ),
            const Text(
              'Route proximity estimate, not verified household coverage. No earnings have been posted by this submission.',
            ),
          ],
        ),
      ),
    );
  }
}
