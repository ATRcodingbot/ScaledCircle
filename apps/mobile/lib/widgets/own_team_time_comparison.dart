import 'package:flutter/material.dart';
import '../models/campaign_area_geometry.dart';

/// Read-only server projection. Changing crew size never expands the boundary.
class OwnTeamTimeComparison extends StatefulWidget {
  const OwnTeamTimeComparison({
    super.key,
    required this.data,
    required this.geometry,
    this.sessionHours,
  });
  final Map data;
  final dynamic geometry;
  final num? sessionHours;
  String minutes(dynamic n) => n is num ? n.toStringAsFixed(1) : 'Unavailable';
  String finish(Map? value, {bool withMinimum = false}) {
    final n = value?[withMinimum ? 'fieldMinutes' : 'calculatedFieldMinutes'];
    if (n is! num) return 'Not established';
    final total = n.ceil();
    return total < 60 ? '~$total min' : '~${total ~/ 60} hr ${total % 60} min';
  }

  @override
  State<OwnTeamTimeComparison> createState() => OwnTeamTimeComparisonState();
}

/// These choices live only in this preview. They select already-authorized
/// server rows, never call an acquisition endpoint or write campaign settings.
class OwnTeamTimeComparisonState extends State<OwnTeamTimeComparison> {
  late final TextEditingController _crew;
  late int _count;
  late String _mode;
  String? _inputError;

  /// Read only at explicit acceptance; changing a control never writes or loads.
  Map<String, dynamic> get selectedSettings {
    if (_inputError != null) {
      throw const FormatException(
        'Enter a positive whole number of marketers.',
      );
    }
    return {'marketerCount': _count, 'coveragePattern': _mode};
  }

  Map get data => widget.data;
  dynamic get geometry => widget.geometry;
  String minutes(dynamic n) => widget.minutes(n);
  String finish(Map? v, {bool withMinimum = false}) =>
      widget.finish(v, withMinimum: withMinimum);

  @override
  void initState() {
    super.initState();
    _crew = TextEditingController();
    _resetSelection();
  }

  void _resetSelection() {
    final current = data['currentTeam'] as Map?;
    _count = current?['marketerCount'] is int && current!['marketerCount'] > 0
        ? current['marketerCount'] as int
        : 1;
    _mode = current?['coveragePattern'] == 'stay_together'
        ? 'stay_together'
        : 'split_streets';
    _crew.text = '$_count';
    _inputError = null;
  }

  @override
  void didUpdateWidget(OwnTeamTimeComparison oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A new response can have the same geometry but different targets/model.
    // Do not carry selections or row references across a response replacement.
    if (!identical(oldWidget.data, data) ||
        CampaignAreaGeometry.savedDigest(oldWidget.geometry) !=
            CampaignAreaGeometry.savedDigest(geometry)) {
      _resetSelection();
    }
  }

  void _selectCount(String text) {
    final value = int.tryParse(text.trim());
    setState(() {
      if (value == null || value < 1 || value > 9007199254740991) {
        _inputError = 'Enter a positive whole number of marketers.';
      } else {
        _count = value;
        _inputError = null;
      }
    });
  }

  @override
  void dispose() {
    _crew.dispose();
    super.dispose();
  }

  bool _rowMatches(Map row, Map? value, String mode) {
    final binding = data['binding'] as Map?;
    if (binding == null) {
      return data['version'] == 'OwnTeamFixedAreaTimeV2';
    } // Legacy V2 compatibility; V3 always supplies evidence/model bindings.
    final rowBinding = value?['binding'] as Map?;
    return ['targetSetDigest', 'evidenceDigest', 'workloadModelVersion'].every(
          (key) =>
              binding[key] is String && (binding[key] as String).isNotEmpty,
        ) &&
        binding['geometryDigest'] == data['geometryDigest'] &&
        binding['comparisonVersion'] == data['version'] &&
        rowBinding != null &&
        (row['coveredTargetCount'] == null ||
            row['coveredTargetCount'] == data['coveredTargetCount']) &&
        binding.entries.every((e) => rowBinding[e.key] == e.value) &&
        rowBinding['marketerCount'] == row['marketerCount'] &&
        rowBinding['coveragePattern'] == mode;
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
    final rows = (data['rows'] as List? ?? []).whereType<Map>().where(
      (row) =>
          _rowMatches(row, row['stayTogether'] as Map?, 'stay_together') &&
          _rowMatches(row, row['splitUp'] as Map?, 'split_streets'),
    );
    final sectionCount =
        (data['computation'] as Map?)?['connectedLocalSectionCount'];
    final separateSections = sectionCount is num && sectionCount > 1;
    final selectedRow = rows
        .where((r) => r['marketerCount'] == _count)
        .firstOrNull;
    final selected =
        selectedRow?[_mode == 'stay_together' ? 'stayTogether' : 'splitUp']
            as Map?;
    final walking = _mode == 'split_streets'
        ? (selected?['criticalWalkingMinutes'])
        : (selected?['walkingMinutes'] ?? data['walkingMinutes']);
    final handling = _mode == 'split_streets'
        ? (selected?['criticalHandlingMinutes'])
        : (selected?['handlingMinutes'] ?? data['handlingMinutes']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 16),
        Text(
          'Plan your team’s time',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const Text(
          'Unsaved comparison. Changing these controls does not save campaign settings.',
        ),
        if (widget.sessionHours != null)
          Text(
            'Requested session: ${widget.sessionHours} hr per person — separate from the estimate below.',
          ),
        const SizedBox(height: 12),
        const Text('How many marketers?'),
        TextFormField(
          key: const ValueKey('preview-marketer-count'),
          controller: _crew,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Marketers',
            errorText: _inputError,
          ),
          onChanged: _selectCount,
        ),
        Wrap(
          spacing: 8,
          children: [
            for (final n in [1, 2, 3, 4])
              ChoiceChip(
                label: Text('$n'),
                selected: _inputError == null && _count == n,
                onSelected: (_) {
                  _crew.text = '$n';
                  _selectCount('$n');
                },
              ),
          ],
        ),
        const Text('How will they cover the area?'),
        RadioGroup<String>(
          groupValue: _mode,
          onChanged: (value) {
            if (value != null) setState(() => _mode = value);
          },
          child: Column(
            children: [
              for (final option in const {
                'split_streets': 'Split up — cover different properties',
                'stay_together': 'Stay together — visit the same properties',
              }.entries)
                RadioListTile<String>(
                  key: ValueKey('preview-mode-${option.key}'),
                  value: option.key,
                  selected: _mode == option.key,
                  title: Text(option.value),
                  contentPadding: EdgeInsets.zero,
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          data['coveredTargetCount'] is num
              ? 'Estimated time for ${data['coveredTargetCount']} supported targets'
              : 'Estimated time for supported targets',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        Text(
          'Current setting: $_count ${_count == 1 ? 'marketer' : 'marketers'} · ${_mode == 'stay_together' ? 'Stay together' : 'Split up'}',
        ),
        Text(
          _inputError != null
              ? 'Enter a valid crew size to see its estimate.'
              : finish(selected),
          key: const ValueKey('selected-team-time'),
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        if (selected == null && _inputError == null)
          const Text(
            'A calculation for this crew size is not available in this preview. Your selection is retained; no shorter time is assumed.',
          ),
        if (_inputError == null &&
            selected != null &&
            selected['fieldMinutes'] != selected['calculatedFieldMinutes'])
          Text(
            'Planning duration with the 15-minute minimum: ${finish(selected, withMinimum: true)}',
          ),
        Text(
          separateSections
              ? 'Additional travel is not included. The mapped street evidence has $sectionCount disconnected sections, so overall completion time remains unknown.'
              : 'Additional travel is not included. Overall completion time remains unknown.',
        ),
        if (['unavailable', 'allocation_incomplete'].contains(data['status']))
          Text(
            'A crew allocation could not be established from this evidence. The boundary and supported observations have not changed.',
          ),
        if (data['coveredTargetCount'] is num)
          Text(
            '${data['coveredTargetCount']} street-supported mapped targets included; changing crew size does not change this scope.',
          ),
        if (selected != null && _inputError == null)
          Text(
            walking is num && handling is num
                ? 'Included in this subtotal: ${minutes(walking)} min walking + ${minutes(handling)} min handling.'
                : 'Walking and handling breakdown unavailable for this selected crew.',
          ),
        Text(
          data['fullAreaWorkloadEstablished'] == true
              ? 'Field-only estimate for the supported mapped inventory; total session time is unverified.'
              : 'Known-target subset only. Full area completion time: Not established.',
        ),

        ExpansionTile(
          title: const Text('Compare crew sizes'),
          children: [
            if (data['coveredTargetCount'] is num) ...[
              Text(
                'One-person baseline: ${minutes(data['walkingMinutes'])} min walking + ${minutes(data['handlingMinutes'])} min handling',
              ),
            ],
            Text(
              'Other observations: ${data['unclassifiedCount'] ?? 'Unknown'} unclassified mapped features · ${data['unmatchedPropertyCount'] ?? 'Unknown'} unmatched property records. Property records are not separate delivery stops.',
            ),

            if (data['reason'] != null)
              Text('Calculation detail: ${data['reason']}'),
            if (separateSections)
              const Text(
                'The separate local street sections are not additional campaign Zones or an approved connected execution plan.',
              ),
            const Text(
              'Calculated times round up to whole minutes. The 15-minute planning minimum is shown only when it changes the duration; the 30-minute minimum campaign request is a separate input rule.',
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
                          'Split calculation: ${minutes((row['splitUp'] as Map?)?['criticalWalkingMinutes'])} min walking + ${minutes((row['splitUp'] as Map?)?['criticalHandlingMinutes'])} min handling. Each local section uses its slowest marketer’s time.',
                        ),
                      if ((row['stayTogether'] as Map?)?['fieldMinutes'] !=
                              (row['stayTogether']
                                  as Map?)?['calculatedFieldMinutes'] ||
                          (row['splitUp'] as Map?)?['fieldMinutes'] !=
                              (row['splitUp']
                                  as Map?)?['calculatedFieldMinutes'])
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
                                padding: const EdgeInsets.symmetric(
                                  vertical: 4,
                                ),
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
                              'Combined work across all marketers: ${minutes((row['splitUp'] as Map?)?['allocatedPersonWorkMinutes'])} min. This differs from team elapsed time and excludes transfers.',
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
          ],
        ),
        const Text(
          'Preview only: this creates no assignment or work record and does not establish work-start readiness.',
        ),
      ],
    );
  }
}
