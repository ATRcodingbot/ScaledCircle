import 'package:flutter/material.dart';

String jobRoomScalerName(
  Map<String, dynamic> data,
  Map<String, dynamic> completion,
) {
  final labels = data['participantLabels'];
  final people = labels is Map
      ? (labels['participants'] as List? ?? [])
      : const [];
  final room = data['room'] as Map? ?? const {};
  final uid = completion['scalerId'] ?? room['scalerId'];
  for (final person in people.whereType<Map>()) {
    if (person['uid'] != uid) continue;
    final name = person['displayName']?.toString().trim() ?? '';
    if (name.isNotEmpty) return name;
  }
  return 'Assigned Scaler — name unavailable';
}

/// Displays recorded results; never computes compensation from coverage.
class JobRoomCompletionResult extends StatelessWidget {
  const JobRoomCompletionResult({
    super.key,
    required this.completion,
    required this.evidence,
    required this.compensation,
  });
  final Map<String, dynamic> completion;
  final Map<String, dynamic> evidence;
  final Map<String, dynamic> compensation;

  @override
  Widget build(BuildContext context) {
    final approved =
        completion['status'] == 'approved' ||
        completion['reviewStatus'] == 'approved';
    final estimate = evidence['estimate'] as Map? ?? const {};
    final policy = evidence['policy'] as Map? ?? const {};
    final earning = completion['earning'] as Map? ?? const {};
    final coverage = estimate['coveragePercentage'];
    String money(dynamic value) => value is num && value.isFinite && value >= 0
        ? '\$${(value / 100).toStringAsFixed(2)}'
        : 'Not available';
    final total = approved
        ? earning['amountCents'] ?? completion['approvedTransferAmountCents']
        : policy['payableAmountCents'];
    final base = approved
        ? earning['baseAmountCents']
        : policy['payableBaseAmountCents'];
    final bonus = approved
        ? earning['bonusAmountCents']
        : policy['bonusAmountCents'];
    Widget line(String title, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.labelLarge),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        line(
          'Route Coverage Estimate',
          coverage is num &&
                  coverage.isFinite &&
                  coverage >= 0 &&
                  coverage <= 100
              ? '${coverage.toStringAsFixed(2)}%'
              : 'Not available',
        ),
        line(
          base is num ? 'Base Pay' : 'Accepted Base Pay',
          money(base ?? compensation['baseAmountCents']),
        ),
        line(
          'Coverage Bonus',
          bonus == 0 ? '\$0.00 · Not earned' : money(bonus),
        ),
        line(
          approved ? 'Total Approved' : 'Expected after approval',
          money(total),
        ),
        if (!approved)
          const Text('Payment remains subject to Business review.'),
      ],
    );
  }
}
