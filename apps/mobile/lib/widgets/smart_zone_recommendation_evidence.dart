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
    if (plan['recommendationContext'] is Map) {
      return _IntelligenceRecommendationEvidence(plan: plan);
    }
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

String advisoryWorkload(num minutes) {
  final total = minutes.round();
  return total < 60 ? '${total}m' : '${total ~/ 60}h ${total % 60}m';
}

class _IntelligenceRecommendationEvidence extends StatelessWidget {
  const _IntelligenceRecommendationEvidence({required this.plan});
  final Map<String, dynamic> plan;

  @override
  Widget build(BuildContext context) {
    final recommendation = plan['recommendationContext'] as Map;
    final evidence = plan['targetEvidence'] is Map
        ? plan['targetEvidence'] as Map
        : const {};
    final valid =
        smartZonePlanCanApply(plan) &&
        (!plan.containsKey('geographicSource') ||
            plan['geographicSource'] != null);
    final zones = (plan['zones'] as List? ?? []).whereType<Map>();
    final minutes =
        recommendation['supportedMinutes'] ?? plan['totalEstimatedMinutes'];
    final meters = zones.fold<double>(
      0,
      (sum, zone) =>
          sum + ((zone['mappedRouteMeters'] as num?)?.toDouble() ?? 0),
    );
    final limitations = <String>{
      for (final value in recommendation['limitations'] as List? ?? [])
        value.toString(),
      for (final value in evidence['limitations'] as List? ?? [])
        value.toString(),
    };
    final signals = (recommendation['signals'] as List? ?? [])
        .whereType<Map>()
        .where((signal) => signal['label'] != null && signal['value'] != null)
        .toList();
    final snapshots = <String>{
      for (final snapshot
          in (evidence['sourceSnapshots'] as List? ?? []).whereType<Map>())
        if (snapshot['dataTimestamp'] != null || snapshot['fetchedAt'] != null)
          '${snapshot['name'] ?? 'Source'}${snapshot['dataTimestamp'] == null ? '' : ' · Source date: ${snapshot['dataTimestamp']}'}${snapshot['fetchedAt'] == null ? '' : ' · Retrieved: ${snapshot['fetchedAt']}'}',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (recommendation['goal'] != null)
          Text(
            'Goal: ${recommendation['goal']}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
        if (recommendation['locationLabel'] != null)
          Text('Location: ${recommendation['locationLabel']}'),
        const SizedBox(height: 12),
        if (!valid) ...[
          const Text(
            "We couldn't find enough reliable data to recommend an area here yet. You can still draw your own area.",
          ),
        ] else ...[
          Text('Why this area', style: Theme.of(context).textTheme.titleSmall),
          for (final reason in recommendation['why'] as List? ?? [])
            Text('• $reason'),
          const SizedBox(height: 12),
          if (minutes is num)
            Text(
              'Estimated field workload: ${advisoryWorkload(minutes)} (advisory)',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          if (recommendation['requestedHours'] is num)
            Text(
              'Requested field workload: ${recommendation['requestedHours']} hours',
            ),
          if (minutes is num &&
              recommendation['requestedHours'] is num &&
              minutes < (recommendation['requestedHours'] as num) * 60)
            const Text(
              'Available evidence supports less than the requested workload. No extra targets have been assumed.',
            ),
          const SizedBox(height: 12),
          Text('Evidence', style: Theme.of(context).textTheme.titleSmall),
          if (evidence['eligibleMappedFeatureCount'] is num)
            Text(
              '${evidence['eligibleMappedFeatureCount']} mapped target features',
            ),
          if (meters > 0)
            Text('~${meters.round()} m supporting street network'),
          const Text('Property Intelligence signals'),
          if (signals.isEmpty)
            const Text(
              'No additional property characteristics were available for this recommendation.',
            ),
          for (final signal in signals)
            Text(
              '${signal['label']}: ${signal['value']}${signal['source'] == null ? '' : ' — ${signal['source']}'}',
            ),
        ],
        const SizedBox(height: 12),
        Text(
          'Confidence and limitations',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const Text(
          'Planning territory and mapped street evidence are not an approved execution route. Mapped features are not verified households, delivery points or a flyer quantity.',
        ),
        for (final limitation in limitations) Text('• $limitation'),
        if (evidence['dataTimestamp'] != null ||
            evidence['fetchedAt'] != null ||
            snapshots.isNotEmpty)
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text('Source and retrieval dates'),
            children: [
              if (evidence['source'] != null)
                Text('Source: ${evidence['source']}'),
              if (evidence['dataTimestamp'] != null)
                Text('Source date: ${evidence['dataTimestamp']}'),
              if (evidence['fetchedAt'] != null)
                Text('Retrieved: ${evidence['fetchedAt']}'),
              if (evidence['dataTimestamp'] == null)
                for (final snapshot in snapshots) Text(snapshot),
            ],
          ),
      ],
    );
  }
}
