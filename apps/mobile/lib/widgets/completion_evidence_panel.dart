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
          'Route Coverage Estimate: ${estimate['coveragePercentage'] is num ? '${(estimate['coveragePercentage'] as num).toStringAsFixed(1)}%' : 'CALCULATING'}',
        ),
        Text(
          '${meters(estimate['coveredMeters'])} of ${meters(estimate['denominatorMeters'])} unique assigned route; ${meters(estimate['remainingMeters'])} remaining.',
        ),
        const Text(
          'GPS proximity estimate, not verified homes or proof of both sides of a street. Repeated passes do not add credit.',
        ),
        Text('Planned walk: ${meters(estimate['plannedWalkingMeters'])}'),
        Text('GPS proof points: ${evidence['proofCount'] ?? 0}'),
        const Text(
          'Automatic GPS route evidence — manual progress marks are optional.',
        ),
        Text(
          'Access exceptions: ${(evidence['accessExceptions'] as List? ?? []).isEmpty ? 'None recorded' : evidence['accessExceptions']}',
        ),
        const Text(
          'Do not enter inaccessible, unsafe or unauthorized locations. Document restrictions for exception review; they do not automatically earn credit.',
        ),
        Text(
          'Start: ${evidence['startedAt'] ?? 'Not started'} · End: ${evidence['endedAt'] ?? 'Not ended'}',
        ),
        Text('Accepted base compensation: ${money(policy['baseAmountCents'])}'),
        Text('Base eligibility: ${policy['baseEligibility'] ?? 'HELD'}'),
        Text('Bonus: ${policy['bonusStatus'] ?? 'Not activated'}'),
        Text('Exact payable amount: ${money(policy['payableAmountCents'])}'),
        if (evidence['historicalCalculatedAmountCents'] != null)
          Text(
            'Historical calculation: ${money(evidence['historicalCalculatedAmountCents'])} — not approved or posted.',
          ),
        Text(
          policy['reason']?.toString() ??
              'Eligibility unavailable. Retry before proceeding.',
        ),
      ],
    );
  }
}
