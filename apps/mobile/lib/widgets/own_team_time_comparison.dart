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
  String finish(Map? value, {bool withMinimum = false}) {
    final n = value?[withMinimum ? 'fieldMinutes' : 'calculatedFieldMinutes'];
    if (n is! num) return 'Not established';
    final total = n.ceil();
    return total < 60 ? '~$total min' : '~${total ~/ 60} hr ${total % 60} min';
  }

  @override
  Widget build(BuildContext context) {
    if (![
          'OwnTeamFixedAreaTimeV2',
          'OwnTeamFixedAreaTimeV3',
        ].contains(data['version']) ||
        data['geometryDigest'] != CampaignAreaGeometry.savedDigest(geometry)) {
      return const Text(
        'Area changed. Recompute team times for this boundary.',
      );
    }
    final rows = (data['rows'] as List? ?? []).whereType<Map>();
    final sectionCount =
        (data['computation'] as Map?)?['connectedLocalSectionCount'];
    final separateSections = sectionCount is num && sectionCount > 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Text(
          data['coveredTargetCount'] is num
              ? 'Estimated time for ${data['coveredTargetCount']} supported targets'
              : 'Estimated time for supported targets',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        Text(
          separateSections
              ? 'Additional travel is not included. The mapped street evidence has $sectionCount disconnected sections, so overall completion time remains unknown.'
              : 'Additional travel is not included. Overall completion time remains unknown.',
        ),
        if (['unavailable', 'allocation_incomplete'].contains(data['status']))
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
        if (separateSections)
          Text(
            'The separate local street sections are not additional campaign Zones or an approved connected execution plan.',
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
                  Text(
                    'Stay together${separateSections ? ' · local field subtotal' : ''}: ${finish(row['stayTogether'] as Map?)}',
                  ),
                  Text(
                    'Split up${separateSections ? ' · local field subtotal' : ''}: ${finish(row['splitUp'] as Map?)}',
                  ),
                  if ((row['splitUp'] as Map?)?['criticalWalkingMinutes']
                      is num)
                    Text(
                      'Split calculation: ${minutes((row['splitUp'] as Map?)?['criticalWalkingMinutes'])} min walking + ${minutes((row['splitUp'] as Map?)?['criticalHandlingMinutes'])} min handling from the longest local allocations.',
                    ),
                  if ((data['currentTeam'] as Map?)?['marketerCount'] ==
                      row['marketerCount'])
                    Text(
                      'Current setting: ${(data['currentTeam'] as Map?)?['coveragePattern'] == 'stay_together' ? 'Stay together' : 'Split up'}',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  Text(
                    'With 15-minute planning minimum — Stay together: ${finish(row['stayTogether'] as Map?, withMinimum: true)} · Split up: ${finish(row['splitUp'] as Map?, withMinimum: true)}',
                  ),
                  Text(
                    separateSections
                        ? 'Calculated local field work for the included targets; not overall team completion'
                        : 'Field-only finish for the included targets',
                  ),
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
                              '${separateSections ? 'Local section ${lane['localSection']} · ' : ''}${lane['targetCount']} targets · ${minutes(lane['walkingMinutes'])} min walking + ${minutes(lane['handlingMinutes'])} min handling · calculated ${finish(lane)}',
                            ),
                          ),
                        ),
                      Text(
                        separateSections
                            ? 'For each local street section, split-up time uses the longest individual allocation. Those local times are added for sequential field work. Transfers and access between sections are unknown.'
                            : 'Split-up finish is the longest individual allocation. Contiguous observed street segments are complementary; access and an execution itinerary are not verified.',
                      ),
                      Text(
                        'Included split components: ${minutes((row['splitUp'] as Map?)?['walkingMinutes'])} min walking + ${minutes((row['splitUp'] as Map?)?['handlingMinutes'])} min handling across all allocations. These are not added again to the field estimate.',
                      ),
                      if ((row['splitUp']
                              as Map?)?['allocatedPersonWorkMinutes']
                          is num)
                        Text(
                          'Total modeled person-work: ${minutes((row['splitUp'] as Map?)?['allocatedPersonWorkMinutes'])} min. This differs from team elapsed time and excludes transfers.',
                        ),
                      const Text(
                        '45 targets/hour · twice supporting network length at 80 m/min',
                      ),
                      Text(
                        'Idealized even division: ${minutes((row['splitUp'] as Map?)?['idealizedEvenDivisionMinutes'])} min. This is not a practical allocation and excludes the planning minimum.',
                      ),
                      const Text(
                        'Stay together retains shared coverage; no automatic headcount speed-up. Individual group-member person-work is not established.',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        const Text(
          'Travel, setup and total session duration remain unknown. This comparison creates no assignment or work record. The campaign planner still uses complete evidence for saved whole Zones; this preview does not establish plan readiness or change work limits.',
        ),
      ],
    );
  }
}
