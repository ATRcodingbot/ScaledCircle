import 'dart:convert';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../../services/business_operations_service.dart';
import 'business_email_setup_controls.dart';

Future<bool> editEmailAvailability(
  BuildContext context,
  Map data, {
  BusinessOperationsService? serviceOverride,
}) async {
  final service = serviceOverride ?? BusinessOperationsService(),
      business = data['businessId'].toString();
  final now = DateTime.now().millisecondsSinceEpoch;
  final roster = await service.call(business, 'load', {
    'fromMs': now,
    'toMs': now + 30 * 86400000,
  });
  if (!context.mounted) return false;
  final saved =
          (roster.containsKey('schedulingAvailability')
                  ? roster['schedulingAvailability']
                  : data['schedulingAvailability'])
              as Map?,
      settings = saved?['settings'] as Map? ?? {};
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
  String? error, submittedPayload, submissionId;
  final route = DialogRoute<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setLocal) => PopScope(
        canPop: !busy,
        child: AlertDialog(
          title: const Text('Appointment availability'),
          content: SizedBox(
            width: 520,
            child: AbsorbPointer(
              absorbing: busy,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Save Business hours independently of Email assistance. No appointment or email is created.',
                    ),
                    emailZone(
                      fields['timeZone']!.text,
                      (v) => setLocal(() {
                        fields['timeZone']!.text = v;
                        error = null;
                      }),
                    ),
                    emailDays(
                      fields['days']!.text,
                      (v) => setLocal(() {
                        fields['days']!.text = v;
                        error = null;
                      }),
                    ),
                    emailTime(
                      dialog,
                      'Working hours start',
                      fields['opensMinute']!.text,
                      (v) => setLocal(() {
                        fields['opensMinute']!.text = v;
                        error = null;
                      }),
                    ),
                    emailTime(
                      dialog,
                      'Working hours end',
                      fields['closesMinute']!.text,
                      (v) => setLocal(() {
                        fields['closesMinute']!.text = v;
                        error = null;
                      }),
                    ),
                    for (final entry in {
                      'durationMinutes': 'Appointment duration (minutes)',
                      'bufferMinutes': 'Buffer before and after (minutes)',
                    }.entries)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: TextField(
                          controller: fields[entry.key],
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setLocal(() => error = null),
                          decoration: InputDecoration(labelText: entry.value),
                        ),
                      ),
                    const Text(
                      'Assign appointments to specific staff — Optional',
                    ),
                    const Text(
                      'Leave unselected to use Business availability and assign someone later. Unassigned offers remain tentative until an available person is assigned and the appointment is confirmed.',
                    ),
                    for (final person in roster['people'] as List? ?? [])
                      CheckboxListTile(
                        value: selected.contains(person['id']),
                        title: Text('${person['name']}'),
                        onChanged: busy
                            ? null
                            : (value) => setLocal(() {
                                error = null;
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
                          : (value) => setLocal(() {
                              location = value;
                              error = null;
                            }),
                    ),
                    if (error != null) Text(error!),
                  ],
                ),
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
                      if (busy) return;
                      setLocal(() {
                        busy = true;
                        error = null;
                      });
                      try {
                        final input = <String, dynamic>{
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
                        };
                        final value = input['settings'] as Map;
                        if (value['opensMinute'] >= value['closesMinute']) {
                          throw const FormatException(
                            'Working hours must end after they start.',
                          );
                        }
                        if (value['durationMinutes'] < 5 ||
                            value['durationMinutes'] > 480) {
                          throw const FormatException(
                            'Choose an appointment duration from 5 to 480 minutes.',
                          );
                        }
                        if (value['bufferMinutes'] < 0 ||
                            value['bufferMinutes'] > 120) {
                          throw const FormatException(
                            'Choose buffers from 0 to 120 minutes.',
                          );
                        }
                        final payload = jsonEncode(input);
                        if (submittedPayload != payload) {
                          submittedPayload = payload;
                          submissionId = service.requestId();
                        }
                        final result = await service.call(
                          business,
                          'saveSchedulingAvailability',
                          input,
                          requestId: submissionId,
                        );
                        final availability = result['availability'];
                        if (result['saved'] != true ||
                            availability is! Map ||
                            availability['businessId'] != business ||
                            availability['version'] is! num ||
                            availability['settings'] is! Map) {
                          throw StateError('Save result was not confirmed');
                        }
                        data['schedulingAvailability'] = availability;
                        if (dialog.mounted) {
                          setLocal(() => busy = false);
                          Navigator.pop(dialog, true);
                        }
                      } catch (failure) {
                        if (!dialog.mounted) return;
                        setLocal(() {
                          busy = false;
                          error = availabilitySaveError(failure);
                        });
                      }
                    },
              child: Text(busy ? 'Saving…' : 'Save availability'),
            ),
          ],
        ),
      ),
    ),
  );
  final result = await Navigator.of(context, rootNavigator: true).push(route);
  await route.completed;
  for (final field in fields.values) {
    field.dispose();
  }
  return result == true;
}

String availabilitySaveError(Object failure) {
  if (failure is FormatException) {
    return failure.message.startsWith('Working hours') ||
            failure.message.startsWith('Choose ')
        ? failure.message
        : 'Enter whole numbers for appointment duration and buffers.';
  }
  if (failure is FirebaseFunctionsException) {
    switch (failure.code) {
      case 'aborted':
        return 'Availability changed since you opened it. Your entries are kept here. Cancel and reopen to review the latest saved hours before saving again.';
      case 'permission-denied':
        return 'You need Schedule-edit permission to save availability and assignment permission to change staff. Ask your Business owner.';
      case 'failed-precondition':
        return 'A selected person may no longer be available, or Business access has changed. Reopen to load the current staff, or leave staff unselected.';
      case 'invalid-argument':
        const safe = [
          'Choose your scheduling time zone.',
          'Choose at least one valid working day.',
          'Working hours must end after they start.',
          'Choose an appointment duration from 5 to 480 minutes.',
          'Choose buffers from 0 to 120 minutes.',
          'This person is selected twice through a linked crew record.',
        ];
        if (safe.contains(failure.message)) return failure.message!;
        return 'Check the entered days, hours, duration and buffers. Your entries are kept here.';
    }
  }
  return 'We could not confirm the save. Your entries are kept here. Retry without changing them to safely check the same request.';
}
