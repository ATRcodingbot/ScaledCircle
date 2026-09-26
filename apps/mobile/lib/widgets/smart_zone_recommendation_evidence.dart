import 'package:flutter/material.dart';

bool smartZonePlanCanApply(Map<String, dynamic> plan) =>
    plan['recommendationStatus'] == 'review_required' &&
    (plan['zones'] as List? ?? []).isNotEmpty &&
    plan['targetEvidence'] is Map &&
    plan['targetEvidence']['measure'] == 'mapped_target_features';

String smartZoneEvidenceQuality(Map<String, dynamic> item) =>
    item['targetEvidence'] is Map &&
        item['targetEvidence']['measure'] == 'mapped_target_features'
    ? 'Review Recommended Area'
    : 'Basic Area Estimate';

class SmartZoneRecommendationEvidence extends StatelessWidget {
  const SmartZoneRecommendationEvidence({super.key, required this.plan});
  final Map<String, dynamic> plan;
  @override
  Widget build(BuildContext context) {
    final evidence = plan['targetEvidence'] is Map
        ? plan['targetEvidence'] as Map
        : const {};
    final supported = evidence['measure'] == 'mapped_target_features';
    final quality = plan['quality'] is Map ? plan['quality'] as Map : const {};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          smartZoneEvidenceQuality(plan),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (supported && evidence['eligibleMappedFeatureCount'] is num)
          Text(
            '${evidence['eligibleMappedFeatureCount']} mapped target features',
          ),
        if (supported && plan['totalEstimatedHours'] is num)
          Text('Estimated workload: ${plan['totalEstimatedHours']} hours'),
        if (supported) ...[
          Text('Source: ${evidence['source'] ?? 'Not recorded'}'),
          Text('Source date: ${evidence['dataTimestamp'] ?? 'Not recorded'}'),
          if (evidence['fetchedAt'] != null)
            Text('Retrieved: ${evidence['fetchedAt']}'),
          const Text(
            'Mapped features are not verified accessible delivery points or a material quantity.',
          ),
        ] else
          const Text(
            'There is not enough reliable target and route evidence to recommend a practical Zone. Review the area manually.',
          ),
        if (plan['explanation'] != null) Text(plan['explanation'].toString()),
        for (final reason in quality['reasons'] as List? ?? [])
          Text(reason.toString()),
        for (final limitation in evidence['limitations'] as List? ?? [])
          Text(limitation.toString()),
      ],
    );
  }
}
