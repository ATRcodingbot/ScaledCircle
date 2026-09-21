import 'package:flutter/material.dart';
import '../../services/business_operations_service.dart';
import 'business_email_setup_controls.dart';

Future<bool> editEmailAvailability(BuildContext context, Map data) async {
  final service = BusinessOperationsService(),
      business = data['businessId'].toString();
  final now = DateTime.now().millisecondsSinceEpoch;
  final roster = await service.call(business, 'load', {
    'fromMs': now,
    'toMs': now + 30 * 86400000,
  });
  if (!context.mounted) return false;
  final saved = data['schedulingAvailability'] as Map?,
      settings = data['schedulingAvailability']?['settings'] as Map? ?? {};
  final fields = <String, TextEditingController>{
    for (final entry in {
      'timeZone':
          settings['timeZone'] ?? data['timeZone'] ?? 'America/New_York',
      'days': (settings['days'] as List? ?? [1, 2, 3, 4, 5]).join(','),
      'opensMinute': settings['opensMinute'] ?? 540,
      'closesMinute': settings['closesMinute'] ?? 1020,
      'durationMinutes': settings['durationMinutes'] ?? 15,
      'bufferMinutes': settings['bufferMinutes'] ?? 5,
    }.entries)
      entry.key: TextEditingController(text: entry.value.toString()),
  };
  final selected = Set<String>.from(settings['assignedPeople'] as List? ?? []);
  bool location = settings['locationRequired'] == true, busy = false;
  String? error;
  final result = await showDialog<bool>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setLocal) => AlertDialog(
        title: const Text('Appointment availability'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Review timezone, hours and actual staff. Unsaved values are proposals, not approved availability. No appointment or email is created.',
                ),
                emailZone(
                  fields['timeZone']!.text,
                  (v) => setLocal(() => fields['timeZone']!.text = v),
                ),
                emailDays(
                  fields['days']!.text,
                  (v) => setLocal(() => fields['days']!.text = v),
                ),
                emailTime(
                  dialog,
                  'Working hours start',
                  fields['opensMinute']!.text,
                  (v) => setLocal(() => fields['opensMinute']!.text = v),
                ),
                emailTime(
                  dialog,
                  'Working hours end',
                  fields['closesMinute']!.text,
                  (v) => setLocal(() => fields['closesMinute']!.text = v),
                ),
                for (final entry in {
                  'durationMinutes': 'Appointment duration (minutes)',
                  'bufferMinutes': 'Buffer before and after (minutes)',
                }.entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: TextField(
                      controller: fields[entry.key],
                      decoration: InputDecoration(labelText: entry.value),
                    ),
                  ),
                const Text('Available staff'),
                for (final person in roster['people'] as List? ?? [])
                  CheckboxListTile(
                    value: selected.contains(person['id']),
                    title: Text('${person['name']}'),
                    onChanged: busy
                        ? null
                        : (value) => setLocal(() {
                            if (value == true) {
                              selected.add(person['id'].toString());
                            } else {
                              selected.remove(person['id']);
                            }
                          }),
                  ),
                SwitchListTile(
                  value: location,
                  title: const Text('Require appointment location'),
                  onChanged: busy
                      ? null
                      : (value) => setLocal(() => location = value),
                ),
                if (error != null) Text(error!),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: busy ? null : () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: busy
                ? null
                : () async {
                    setLocal(() => busy = true);
                    try {
                      await service.call(
                        business,
                        'saveSchedulingAvailability',
                        {
                          'expectedVersion': saved?['version'] ?? 0,
                          'settings': {
                            'timeZone': fields['timeZone']!.text.trim(),
                            'days': fields['days']!.text
                                .split(',')
                                .map((d) => int.parse(d.trim()))
                                .toList(),
                            for (final key in [
                              'opensMinute',
                              'closesMinute',
                              'durationMinutes',
                              'bufferMinutes',
                            ])
                              key: int.parse(fields[key]!.text.trim()),
                            'assignedPeople': selected.toList(),
                            'locationRequired': location,
                          },
                        },
                      );
                      if (dialog.mounted) Navigator.pop(dialog, true);
                    } catch (_) {
                      setLocal(() {
                        busy = false;
                        error =
                            'Availability was not saved. Check the timezone, hours and current staff, then retry.';
                      });
                    }
                  },
            child: const Text('Save availability'),
          ),
        ],
      ),
    ),
  );
  for (final field in fields.values) {
    field.dispose();
  }
  return result == true;
}
