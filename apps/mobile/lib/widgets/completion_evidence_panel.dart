import 'local_work_time.dart';
import 'package:flutter/material.dart';
import 'active_route_guidance.dart';

/// Read-only server evidence. Never derives money or household counts locally.
class CompletionEvidencePanel extends StatelessWidget {
  const CompletionEvidencePanel({
    super.key,
    required this.evidence,
    this.tilesEnabled = true,
  });
  final Map<String, dynamic> evidence;
  final bool tilesEnabled;
  @override
  Widget build(BuildContext context) {
    final estimate = Map<String, dynamic>.from(
      evidence['estimate'] as Map? ?? {},
    );
    final policy = Map<String, dynamic>.from(evidence['policy'] as Map? ?? {});
    String money(dynamic value) => value is num
        ? '\$${(value / 100).toStringAsFixed(2)}'
        : 'HELD — not authorized';
    String localTime(dynamic value) =>
        localWorkTime(context, DateTime.tryParse(value?.toString() ?? ''));
    String meters(dynamic value) =>
        value is num ? '${value.toStringAsFixed(1)} m' : 'Unknown';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ActiveRouteGuidance(
          automaticGps: true,
          zone: {
            'serviceArea': evidence['corridor'],
            'executionRoute': evidence['route'],
          },
          location: null,
          progress: {...estimate, 'path': evidence['path']},
          tilesEnabled: tilesEnabled,
        ),
        Text(
          'Start: ${localTime(evidence['startedAt'])} · End: ${localTime(evidence['endedAt'])}',
        ),
        ExpansionTile(
          title: const Text('Evidence Details'),
          children: [
            Text(
              'Route Coverage Estimate: ${estimate['coveragePercentage'] is num ? '${(estimate['coveragePercentage'] as num).toStringAsFixed(1)}%' : 'CALCULATING'}',
            ),
            Text(
              '${meters(estimate['coveredMeters'])} of ${meters(estimate['denominatorMeters'])} unique assigned route; ${meters(estimate['remainingMeters'])} remaining.',
            ),
            const Text(
              'GPS proximity estimate, not verified homes or proof of both sides of a street. Repeated passes do not add credit.',
            ),
            for (final n
                in (evidence['workNotes'] as List? ?? []).whereType<Map>())
              Text(
                '${n['kind'] == 'access'
                    ? 'Access issue'
                    : n['kind'] == 'safety'
                    ? 'Safety issue'
                    : 'Scaler note'}: ${n['note']}',
              ),
            Text('Planned walk: ${meters(estimate['plannedWalkingMeters'])}'),
            Text('GPS proof points: ${evidence['proofCount'] ?? 0}'),
            const Text(
              'Automatic GPS route evidence — no manual progress report required.',
            ),
            Text(
              'Access exceptions: ${(evidence['accessExceptions'] as List? ?? []).isEmpty ? 'None recorded' : evidence['accessExceptions']}',
            ),
            const Text(
              'Do not enter inaccessible, unsafe or unauthorized locations. Document restrictions for exception review; they do not automatically earn credit.',
            ),
            Text('Times are shown in your local time zone.'),
            const Text(
              'Minimum for base eligibility: 80%. Bonus threshold: 95%. Aim for 100%.',
            ),
            Text(
              'Accepted base compensation: ${money(policy['baseAmountCents'])}',
            ),
            if (policy['acceptedBonusAmountCents'] != null)
              Text(
                'Accepted coverage bonus: ${money(policy['acceptedBonusAmountCents'])}',
              ),
            Text('Base eligibility: ${policy['baseEligibility'] ?? 'HELD'}'),
            if (policy['baseProtected'] == true)
              Text(
                'Protected base: ${money(policy['baseAmountCents'])} — held for technical review; not reduced or automatically paid.',
              ),
            Text(
              'Bonus: ${(policy['bonusStatus'] ?? 'Not activated').toString().replaceAll('â€”', '—')}',
            ),
            Text(
              'Held payable amount before approval: ${money(policy['payableAmountCents'])}',
            ),
            if (evidence['historicalCalculatedAmountCents'] != null)
              Text(
                'Historical calculation: ${money(evidence['historicalCalculatedAmountCents'])} — not approved or posted.',
              ),
            Text(
              policy['reason']?.toString() ??
                  'Eligibility unavailable. Retry before proceeding.',
            ),
          ],
        ),
      ],
    );
  }
}
