import 'package:flutter/material.dart';
import '../services/business_operations_service.dart';
import '../models/campaign_planner.dart';

String _attributionText(dynamic rows, String areaId) {
  final matches = operationRows(rows).where((row) => row['zoneId'] == areaId);
  if (matches.isEmpty) return 'Not recorded';
  return matches
      .map((row) {
        final names = operationRows(
          row['people'],
        ).map((p) => p['name']).join(', ');
        final notes = row['notes']?.toString() ?? '';
        return '${names.isEmpty ? 'Not recorded' : names}${notes.isEmpty ? '' : ' — $notes'}';
      })
      .join('; ');
}

class OwnTeamPeoplePicker extends StatelessWidget {
  const OwnTeamPeoplePicker({
    super.key,
    required this.people,
    required this.selected,
    required this.onChanged,
  });
  final List<Map<String, dynamic>> people;
  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;
  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      const Text(
        'Worked by (optional). Confirm the people who actually worked this area.',
      ),
      for (final person in people)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(person['name'].toString()),
          value: selected.contains(person['id']),
          onChanged: (v) {
            final next = {...selected};
            if (v == true) {
              next.add(person['id'].toString());
            } else {
              next.remove(person['id']);
            }
            onChanged(next);
          },
        ),
    ],
  );
}

class OwnTeamAreaWork extends StatefulWidget {
  const OwnTeamAreaWork({
    super.key,
    required this.businessId,
    required this.campaignId,
    this.operation,
    this.onChanged,
  });
  final String businessId, campaignId;
  final Future<Map<String, dynamic>> Function(String, Map<String, dynamic>)?
  operation;
  final VoidCallback? onChanged;
  @override
  State<OwnTeamAreaWork> createState() => _OwnTeamAreaWorkState();
}

class _OwnTeamAreaWorkState extends State<OwnTeamAreaWork> {
  final _service = BusinessOperationsService();
  Map<String, dynamic>? _data;
  String? _error;
  String _filter = '';
  bool _busy = false;
  int _generation = 0;
  Future<Map<String, dynamic>> _call(
    String op,
    Map<String, dynamic> input, {
    String? key,
  }) =>
      widget.operation?.call(op, input) ??
      _service.call(widget.businessId, op, input, requestId: key);
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant OwnTeamAreaWork oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.businessId != widget.businessId ||
        oldWidget.campaignId != widget.campaignId) {
      _data = null;
      _filter = '';
      _load();
    }
  }

  Future<void> _load() async {
    final generation = ++_generation;
    try {
      final data = await _call('ownTeamAreaWork', {
        'campaignId': widget.campaignId,
      });
      if (mounted && generation == _generation) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() => _error = 'We couldn’t load team work records.');
      }
    }
  }

  List<Map<String, dynamic>> get _records => operationRows(_data?['records']);
  Map<String, dynamic>? _record(String id) {
    for (final r in _records) {
      if ((r['zoneIds'] as List? ?? []).contains(id) ||
          (id == 'territory' && r['wholeTerritory'] == true)) {
        return r;
      }
    }
    return null;
  }

  Map<String, dynamic>? _work(Map<String, dynamic>? r, String id) {
    for (final w in operationRows(r?['zoneWork'])) {
      if (w['zoneId'] == id) return w;
    }
    return null;
  }

  Future<void> _edit(Map<String, dynamic> area) async {
    final id = area['id'].toString(),
        record = _record(area['id'].toString()),
        work = _work(_record(area['id'].toString()), area['id'].toString());
    final roster = {
      for (final p in operationRows(_data?['people'])) p['id']: p,
      for (final p in operationRows(work?['people'])) p['id']: p,
    }.values.toList();
    var selected = operationRows(
      work?['people'],
    ).map((p) => p['id'].toString()).toSet();
    var notes = work?['notes']?.toString() ?? '';
    var date = DateTime.now(), confirmed = false, saving = false;
    String? error;
    final requestId = _service.requestId();
    final businessId = widget.businessId, campaignId = widget.campaignId;
    await showDialog<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: Text(
            record == null
                ? 'Record who worked this area'
                : 'Correct worked-by record',
          ),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(area['name'].toString()),
                  const Text(
                    'Business-reported. This is not GPS verification or proof of delivery to every household.',
                  ),
                  if (record == null)
                    const Text(
                      'Only part of this area worked? Leave it incomplete. Record only fully completed saved areas; no smaller footprint is inferred.',
                    ),
                  OwnTeamPeoplePicker(
                    people: roster,
                    selected: selected,
                    onChanged: (v) {
                      if (!saving) update(() => selected = v);
                    },
                  ),
                  if (record == null)
                    TextButton(
                      onPressed: saving
                          ? null
                          : () async {
                              final picked = await showDatePicker(
                                context: context,
                                initialDate: date,
                                firstDate: DateTime(2000),
                                lastDate: DateTime.now(),
                              );
                              if (picked != null && context.mounted) {
                                update(
                                  () => date =
                                      DateUtils.isSameDay(
                                        picked,
                                        DateTime.now(),
                                      )
                                      ? DateTime.now()
                                      : DateTime(
                                          picked.year,
                                          picked.month,
                                          picked.day,
                                          23,
                                          59,
                                          59,
                                        ),
                                );
                              }
                            },
                      child: Text(
                        'Date worked: ${campaignPlanningDateLabel(date)}',
                      ),
                    )
                  else
                    Text(
                      'Date worked: ${campaignPlanningDateLabel(record['completedAtMs'])}',
                    ),
                  TextFormField(
                    initialValue: notes,
                    onChanged: (value) => notes = value,
                    enabled: !saving,
                    maxLength: 2000,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Work notes (optional)',
                    ),
                  ),
                  CheckboxListTile(
                    value: confirmed,
                    onChanged: saving
                        ? null
                        : (v) => update(() => confirmed = v == true),
                    title: Text(
                      record == null
                          ? 'I confirm this entire saved area was worked.'
                          : 'I confirm this attribution correction.',
                    ),
                  ),
                  if (error != null) Text(error!),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: !confirmed || saving
                  ? null
                  : () async {
                      if (businessId != widget.businessId ||
                          campaignId != widget.campaignId) {
                        return;
                      }
                      update(() => saving = true);
                      try {
                        final zoneWork = [
                          {
                            'zoneId': id,
                            'personIds': selected.toList(),
                            'notes': notes,
                          },
                        ];
                        await _call(
                          record == null
                              ? 'markMarketingComplete'
                              : 'amendOwnTeamAreaWork',
                          record == null
                              ? {
                                  'campaignId': campaignId,
                                  'completedAtMs': date.millisecondsSinceEpoch,
                                  'confirmed': true,
                                  'wholeTerritory': id == 'territory',
                                  if (id != 'territory') 'zoneIds': [id],
                                  'zoneWork': zoneWork,
                                  'expectedAreaDigests': {
                                    id: area['geometryDigest'],
                                  },
                                }
                              : {
                                  'campaignId': campaignId,
                                  'historyId': record['id'],
                                  'expectedRevision':
                                      record['attributionRevision'],
                                  'zoneWork': zoneWork,
                                },
                          key: requestId,
                        );
                        if (dialog.mounted) Navigator.pop(dialog);
                        if (mounted) {
                          await _load();
                          widget.onChanged?.call();
                        }
                      } catch (_) {
                        if (dialog.mounted) {
                          update(() {
                            saving = false;
                            error =
                                'The record was not confirmed. Retry this request, or cancel and reload before correcting changed records.';
                          });
                        }
                      }
                    },
              child: Text(
                record == null ? 'Record Completion' : 'Save amendment',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addPerson() async {
    final businessId = widget.businessId;
    var name = '';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Add internal marketer'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'People/Crew record only. No login, invitation, paid seat or payment.',
            ),
            TextFormField(
              initialValue: name,
              onChanged: (value) => name = value,
              autofocus: true,
              maxLength: 120,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Add person'),
          ),
        ],
      ),
    );
    final value = name.trim();
    if (accepted != true ||
        value.isEmpty ||
        !mounted ||
        businessId != widget.businessId) {
      return;
    }
    setState(() => _busy = true);
    try {
      await _call('saveResource', {
        'name': value,
        'status': 'active',
        'expectedVersion': 0,
      }, key: _service.requestId());
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Person was not confirmed added. Check People before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        'Own-team area work',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      if (_error != null) ...[
        Text(_error!),
        TextButton(onPressed: _load, child: const Text('Reload work records')),
      ],
      if (_data == null && _error == null) const Text('Loading work records…'),
      if (_data != null) ...[
        if (operationRows(_data?['campaignAssignedPeople']).isNotEmpty)
          Text(
            'Assigned to campaign schedule: ${operationRows(_data?['campaignAssignedPeople']).map((p) => p['name']).join(', ')}. This is campaign-level planning, not proof of work in each area.',
          ),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Filter by marketer or date',
          ),
          onChanged: (v) => setState(() => _filter = v.toLowerCase().trim()),
        ),
        if (_data?['canAddPerson'] == true)
          TextButton(
            onPressed: _busy ? null : _addPerson,
            child: const Text('Add internal marketer'),
          ),
        for (final area in operationRows(_data?['areas'])) _area(area),
      ],
    ],
  );
  Widget _area(Map<String, dynamic> area) {
    final id = area['id'].toString(),
        record = _record(area['id'].toString()),
        work = _work(_record(area['id'].toString()), area['id'].toString());
    final snapshots = operationRows(
      record?['areaSnapshots'],
    ).where((s) => s['zoneId'] == id);
    dynamic recordedDigest;
    if (snapshots.isNotEmpty) {
      recordedDigest = snapshots.first['geometryDigest'];
    } else if (record != null &&
        (id == 'territory' || (record['zoneIds'] as List? ?? []).length == 1)) {
      recordedDigest = record['geometryDigest'];
    }
    final currentBoundary =
        recordedDigest != null && recordedDigest == area['geometryDigest'];
    final names = operationRows(
      work?['people'],
    ).map((p) => p['name']).join(', ');
    final date = record == null
        ? 'Not recorded'
        : campaignPlanningDateLabel(record['completedAtMs']);
    if (_filter.isNotEmpty &&
        !('$names $date').toLowerCase().contains(_filter)) {
      return const SizedBox.shrink();
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              area['name'].toString(),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            if (operationRows(area['assignedPeople']).isNotEmpty)
              Text(
                'Assigned to: ${operationRows(area['assignedPeople']).map((p) => p['name']).join(", ")}',
              ),
            Text('Worked by: ${names.isEmpty ? "Not recorded" : names}'),
            Text('Date worked: $date'),
            if (record != null) ...[
              Text(
                currentBoundary
                    ? 'Business-reported completion'
                    : 'Business-reported on a historical boundary; current boundary match not verified.',
              ),
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: const Text('View work notes and history'),
                children: [
                  Text(
                    work?['notes']?.toString().isNotEmpty == true
                        ? work!['notes'].toString()
                        : 'Notes: Not recorded',
                  ),
                  Text(
                    'Recorded: ${campaignPlanningDateLabel(record['recordedAtMs'])}. This record remains tied to its original completed boundary.',
                  ),
                  for (final amendment in operationRows(record['amendments']))
                    Text(
                      'Amendment ${amendment['revision']} · ${campaignPlanningDateLabel(amendment['recordedAtMs'])}: ${_attributionText(amendment['before'], id)} → ${_attributionText(amendment['after'], id)}',
                    ),
                ],
              ),
            ],
            if (record != null || _data?['canComplete'] == true)
              OutlinedButton(
                onPressed: _busy ? null : () => _edit(area),
                child: Text(
                  record == null
                      ? 'Record who worked this area'
                      : 'Add / correct worked-by record',
                ),
              ),
          ],
        ),
      ),
    );
  }
}
