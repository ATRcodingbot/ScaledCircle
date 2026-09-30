import 'package:flutter/material.dart';
import '../models/campaign_area_geometry.dart';

/// Read-only server projection. Changing crew size never expands the boundary.
class OwnTeamTimeComparison extends StatelessWidget {
  const OwnTeamTimeComparison({
    super.key,
    required this.data,
    required this.geometry,
  });
  final Map data;
  final dynamic geometry;
  String minutes(dynamic n) => n is num ? n.toStringAsFixed(1) : 'Unavailable';
  String finish(Map? value, {bool withMinimum = false}) =>
      value?[withMinimum ? 'fieldMinutes' : 'calculatedFieldMinutes'] is num
      ? '~${(value![withMinimum ? 'fieldMinutes' : 'calculatedFieldMinutes'] as num).ceil()} min'
      : 'Not established';

  @override
  Widget build(BuildContext context) {
    if (data['version'] != 'OwnTeamFixedAreaTimeV2' ||
        data['geometryDigest'] != CampaignAreaGeometry.savedDigest(geometry)) {
      return const Text(
        'Area changed. Recompute team times for this boundary.',
      );
    }
    final rows = (data['rows'] as List? ?? []).whereType<Map>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Text(
          'Estimated time for supported targets',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (data['status'] == 'unavailable')
          Text(
            data['reason']?.toString() ?? 'Team time evidence is unavailable.',
          ),
        if (data['coveredTargetCount'] is num) ...[
          Text(
            '${data['coveredTargetCount']} street-supported mapped targets included in every comparison',
          ),
          Text(
            'One-person baseline: ${minutes(data['walkingMinutes'])} min walking + ${minutes(data['handlingMinutes'])} min handling',
          ),
        ],
        Text(
          'Other observations: ${data['unclassifiedCount'] ?? 'Unknown'} unclassified mapped features · ${data['unmatchedPropertyCount'] ?? 'Unknown'} unmatched property records. Property records are not separate delivery stops.',
        ),
        Text(
          data['fullAreaWorkloadEstablished'] == true
              ? 'Field-only estimate for the supported mapped inventory; total session time is unverified.'
              : 'Known-target subset only. Full area completion time: Not established.',
        ),
        const Text(
          'Calculated times round up to whole minutes. The 15-minute planning minimum is shown separately; the 30-minute minimum campaign request is a separate input rule.',
        ),
        for (final row in rows)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${row['marketerCount']} ${row['marketerCount'] == 1 ? 'marketer' : 'marketers'}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text('Stay together: ${finish(row['stayTogether'] as Map?)}'),
                  Text('Split up: ${finish(row['splitUp'] as Map?)}'),
                  if ((data['currentTeam'] as Map?)?['marketerCount'] ==
                      row['marketerCount'])
                    Text(
                      'Current setting: ${(data['currentTeam'] as Map?)?['coveragePattern'] == 'stay_together' ? 'Stay together' : 'Split up'}',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  Text(
                    'With 15-minute planning minimum — Stay together: ${finish(row['stayTogether'] as Map?, withMinimum: true)} · Split up: ${finish(row['splitUp'] as Map?, withMinimum: true)}',
                  ),
                  const Text('Field-only finish for the included targets'),
                  if ((row['splitUp'] as Map?)?['subdivisionEstablished'] !=
                      true)
                    const Text(
                      'No supported local subdivision. Extra marketers do not establish a shorter finish.',
                    ),
                  ExpansionTile(
                    title: const Text('View included work and allocation'),
                    children: [
                      for (final lane
                          in ((row['splitUp'] as Map?)?['allocations']
                                      as List? ??
                                  [])
                              .whereType<Map>())
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Text(
                              '${lane['targetCount']} targets · ${minutes(lane['walkingMinutes'])} min walking + ${minutes(lane['handlingMinutes'])} min handling · calculated ${finish(lane)} · ${finish(lane, withMinimum: true)} with planning minimum',
                            ),
                          ),
                        ),
                      const Text(
                        'Split-up finish is the longest individual allocation. Contiguous observed street segments are complementary; access and an execution itinerary are not verified.',
                      ),
                      Text(
                        'Included split components: ${minutes((row['splitUp'] as Map?)?['walkingMinutes'])} min walking + ${minutes((row['splitUp'] as Map?)?['handlingMinutes'])} min handling across all allocations. These are not added again to the longest allocation.',
                      ),
                      const Text(
                        '45 targets/hour · twice supporting network length at 80 m/min',
                      ),
                      Text(
                        'Idealized even division: ${minutes((row['splitUp'] as Map?)?['idealizedEvenDivisionMinutes'])} min. This is not a practical allocation and excludes the planning minimum.',
                      ),
                      const Text(
                        'Stay together retains shared coverage; no automatic headcount speed-up.',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        const Text(
          'Travel, setup and total session duration remain unknown. This comparison creates no assignment or work record.',
        ),
      ],
    );
  }
}
