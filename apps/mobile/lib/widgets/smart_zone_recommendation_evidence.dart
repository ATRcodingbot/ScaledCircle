import 'package:flutter/material.dart';

bool smartZonePlanCanApply(Map<String, dynamic> plan) =>
    plan['recommendationStatus'] == 'review_required' &&
    (plan['zones'] as List? ?? []).isNotEmpty &&
    plan['targetEvidence'] is Map &&
    plan['targetEvidence']['measure'] == 'mapped_target_features';

String smartZoneEvidenceQuality(Map<String, dynamic> item) =>
    item['recommendationStatus'] == 'manual_review_required'
    ? 'Manual review required'
    : item['targetEvidence'] is Map &&
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
    final acquisition = plan['geographicAcquisition'] is Map
        ? plan['geographicAcquisition'] as Map
        : const {};
    // Old successful plans may omit acquisition metadata. An explicit missing
    // source or failed acquisition cannot establish a measured target count.
    final providerAvailable =
        (!plan.containsKey('geographicSource') ||
            plan['geographicSource'] != null) &&
        (acquisition['status'] == null || acquisition['status'] == 'success');
    final sourceDate =
        evidence['dataTimestamp'] ?? acquisition['sourceDataTimestamp'];
    final retrievedAt = evidence['fetchedAt'] ?? acquisition['fetchedAt'];
    final recommendedZones = plan['zones'] is List
        ? plan['zones'] as List
        : const [];
    final hasRecommendedInventory =
        supported &&
        providerAvailable &&
        plan['recommendationStatus'] != 'manual_review_required' &&
        recommendedZones.isNotEmpty;
    final quality = plan['quality'] is Map ? plan['quality'] as Map : const {};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          smartZoneEvidenceQuality(plan),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (hasRecommendedInventory &&
            evidence['eligibleMappedFeatureCount'] is num)
          Text(
            '${evidence['eligibleMappedFeatureCount']} mapped target features',
          )
        else if (supported)
          Text(
            providerAvailable
                ? 'Target count for a recommended Zone is unavailable.'
                : 'Target count unavailable.',
          ),
        if (hasRecommendedInventory && plan['totalEstimatedHours'] is num)
          Text('Estimated workload: ${plan['totalEstimatedHours']} hours'),
        if (supported) ...[
          if (providerAvailable)
            Text('Source: ${evidence['source'] ?? 'Not recorded'}'),
          if (providerAvailable || sourceDate != null)
            Text(
              '${providerAvailable ? 'Source date' : 'Incomplete source date'}: ${sourceDate ?? 'Not recorded'}',
            ),
          if (retrievedAt != null)
            Text(
              '${providerAvailable ? 'Retrieved' : 'Retrieval attempt'}: $retrievedAt',
            ),
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
