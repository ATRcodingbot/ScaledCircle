import 'package:flutter/material.dart';
import '../../services/business_email_service.dart';
import 'business_email_availability.dart';
import 'business_email_permission.dart';

/// Owner settings for the existing, server-authoritative Email policy.
/// Preparing preferences is distinct from authorizing execution.
class BusinessEmailAssistanceScreen extends StatefulWidget {
  const BusinessEmailAssistanceScreen({super.key, required this.service});
  final BusinessEmailService service;
  @override
  State<BusinessEmailAssistanceScreen> createState() => _AssistanceState();
}

class _AssistanceState extends State<BusinessEmailAssistanceScreen> {
  Map<String, dynamic>? data;
  final fields = <String, TextEditingController>{};
  final choices = <String, bool>{};
  bool busy = false;
  String? feedback;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController field(String key) =>
      fields.putIfAbsent(key, () => TextEditingController());
  Future<void> load() async {
    try {
      final result = await widget.service.call('loadAssistance');
      if (!mounted) return;
      final p = Map<String, dynamic>.from(
        result['policy']?['policy'] as Map? ?? {},
      );
      for (final key in [
        'businessName',
        'voice',
        'timeZone',
        'mailingAddress',
        'inquiryLabel',
        'inquiryFilterDescription',
      ]) {
        field(key).text =
            (p[key] ??
                    (key == 'businessName'
                        ? result['workspaceName']
                        : key == 'timeZone'
                        ? result['timeZone']
                        : null) ??
                    '')
                .toString();
      }
      for (final key in ['services', 'claims', 'destinations']) {
        field(key).text = (p[key] as List? ?? []).join('\n');
      }
      field('initialPerDay').text = '${p['limits']?['initialPerDay'] ?? 1}';
      field('followupsPerContact').text =
          '${p['limits']?['followupsPerContact'] ?? 1}';
      field('followupIntervalHours').text =
          '${p['limits']?['followupIntervalHours'] ?? 120}';
      field('sendingDays').text = (p['sendingDays'] as List? ?? [1, 2, 3, 4, 5])
          .join(',');
      field('opensMinute').text = '${p['opensMinute'] ?? 540}';
      field('closesMinute').text = '${p['closesMinute'] ?? 1020}';
      field('expiresAt').text = p['expiresAt'] == null
          ? ''
          : DateTime.fromMillisecondsSinceEpoch(
              (p['expiresAt'] as num).toInt(),
              isUtc: true,
            ).toIso8601String();
      for (final kind in ['introduction', 'followup']) {
        field('${kind}Subject').text =
            '${p['templates']?[kind]?['subject'] ?? ''}';
        field('${kind}Body').text = '${p['templates']?[kind]?['body'] ?? ''}';
      }
      for (final key in [
        'introductionsEnabled',
        'followupsEnabled',
        'modelAssistance',
        'modelDataConsent',
        'bookingEnabled',
        'newInquiriesEnabled',
        'inquiryRoutingConfirmed',
      ]) {
        choices[key] = p[key] == true;
      }
      choices['push'] = p['notifications']?['push'] == true;
      choices['email'] = p['notifications']?['email'] == true;
      field('quietStart').text =
          '${p['notifications']?['quietStartMinute'] ?? 1260}';
      field('quietEnd').text =
          '${p['notifications']?['quietEndMinute'] ?? 480}';
      setState(() {
        data = result;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          feedback =
              'Email assistance settings could not be loaded. Try again.';
        });
      }
    }
  }

  int number(String key) => int.parse(field(key).text.trim());
  Map<String, dynamic> policy() {
    final expiryText = field('expiresAt').text.trim();
    if (!expiryText.endsWith('Z')) {
      throw const FormatException('Use an explicit UTC expiry ending in Z.');
    }
    final available = data?['schedulingAvailability'] as Map?;
    return {
      'autonomyMode': 'bounded_managed',
      'replyMode': 'approval_required',
      for (final k in [
        'businessName',
        'voice',
        'timeZone',
        'mailingAddress',
        'inquiryLabel',
        'inquiryFilterDescription',
      ])
        k: field(k).text.trim(),
      for (final k in ['services', 'claims', 'destinations'])
        k: field(k).text
            .split('\n')
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .toList(),
      'audiences': ['consented', 'requested'],
      'expiresAt': DateTime.parse(expiryText).millisecondsSinceEpoch,
      'limits': {
        for (final k in [
          'initialPerDay',
          'followupsPerContact',
          'followupIntervalHours',
        ])
          k: number(k),
      },
      'sendingDays': field(
        'sendingDays',
      ).text.split(',').map((s) => int.parse(s.trim())).toList(),
      'opensMinute': number('opensMinute'),
      'closesMinute': number('closesMinute'),
      for (final k in [
        'introductionsEnabled',
        'followupsEnabled',
        'modelAssistance',
        'modelDataConsent',
        'bookingEnabled',
        'newInquiriesEnabled',
        'inquiryRoutingConfirmed',
      ])
        k: choices[k] == true,
      'notifications': {
        'push': choices['push'] == true,
        'email': choices['email'] == true,
        'quietStartMinute': number('quietStart'),
        'quietEndMinute': number('quietEnd'),
      },
      'availabilityRevision': available?['version'],
      'schedulingRules': available?['settings'],
      'templates': {
        for (final kind in ['introduction', 'followup'])
          kind: {
            'subject': field('${kind}Subject').text.trim(),
            'body': field('${kind}Body').text.trim(),
          },
      },
    };
  }

  Future<void> act(String action) async {
    if (busy) return;
    if (action != 'prepare') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(
            action == 'activate'
                ? 'Authorize these exact Email settings?'
                : '$action email assistance?',
          ),
          content: Text(
            'Workspace: ${data?['workspaceName']}\nSender: ${data?['sender']}\nOnly recipients with separately recorded permission are eligible. Replies still require your exact approval. This does not change Social authority or your subscription.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Confirm'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final result = await widget.service.call('manageAssistance', {
        'action': action,
        'expectedVersion': data?['policy']?['version'] ?? 0,
        'requestId': 'email_settings_${DateTime.now().microsecondsSinceEpoch}',
        if (action == 'prepare' || action == 'activate') 'policy': policy(),
        'confirm': action != 'prepare',
      });
      await load();
      if (mounted) {
        setState(() {
          feedback = result['status'] == 'prepared'
              ? 'Preferences saved. Automatic sending is not authorized.'
              : 'Saved state: ${result['status']}';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          feedback =
              'Settings were not activated. Check the saved prerequisites and values, then try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  Widget input(String key, String label, {int lines = 1}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: TextField(
      controller: field(key),
      minLines: lines,
      maxLines: lines + 2,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );
  Widget choice(String key, String title, String detail) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    value: choices[key] == true,
    onChanged: busy ? null : (v) => setState(() => choices[key] = v),
    title: Text(title),
    subtitle: Text(detail),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Email assistance')),
    body: data == null
        ? Center(
            child: feedback == null
                ? const CircularProgressIndicator()
                : TextButton(onPressed: load, child: Text(feedback!)),
          )
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                '${data!['workspaceName']} · ${data!['sender'] ?? 'No mailbox connected'}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              Text(
                'Saved status: ${data!['policy']?['status'] ?? 'Not authorized'}',
              ),
              const Text(
                'Preparing preferences does not authorize sending. Public listings, research and a CRM stage do not establish recipient permission.',
              ),
              if (data!['canPreparePilot'] == true &&
                  data!['pilotStatus'] == 'not_prepared')
                OutlinedButton(
                  onPressed: busy
                      ? null
                      : () async {
                          final confirmed = await showDialog<bool>(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: const Text(
                                'Prepare the approved shared pilot?',
                              ),
                              content: const Text(
                                'Prepare ScaledCircle and Attractive Remodel only: USD 1 total, 100 model requests total, seven days from activation. This does not start the clock, authorize either owner, or send email.',
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () =>
                                      Navigator.pop(context, false),
                                  child: const Text('Cancel'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.pop(context, true),
                                  child: const Text('Prepare inactive pilot'),
                                ),
                              ],
                            ),
                          );
                          if (confirmed != true || !mounted) return;
                          setState(() => busy = true);
                          try {
                            await widget.service.call(
                              'prepareAssistanceEnrollment',
                              {'confirm': true},
                            );
                            if (!mounted) return;
                            setState(
                              () => feedback =
                                  'Pilot prepared. No activation clock or sending started.',
                            );
                            await load();
                          } catch (_) {
                            if (mounted) {
                              setState(
                                () => feedback =
                                    'Pilot preparation could not be confirmed. Reload before retrying.',
                              );
                            }
                          } finally {
                            if (mounted) setState(() => busy = false);
                          }
                        },
                  child: const Text('Prepare approved pilot (Admin)'),
                ),
              if (feedback != null)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(feedback!),
                ),
              ...((data!['blockers'] as List? ?? []).map(
                (b) => ListTile(
                  leading: const Icon(Icons.info_outline),
                  title: Text(
                    (data!['blockerMessages'] as Map?)?[b]?.toString() ??
                        'Prerequisite needs attention: $b',
                  ),
                ),
              )),
              if (data!['canManage'] == true) ...[
                for (final contact in data!['contacts'] as List? ?? [])
                  ListTile(
                    title: Text('${contact['name']} · ${contact['email']}'),
                    subtitle: Text(
                      'Recipient permission: ${contact['permissionStatus']}',
                    ),
                    trailing: TextButton(
                      onPressed: busy
                          ? null
                          : () async {
                              if (await recordEmailPermission(
                                context,
                                widget.service,
                                contact,
                              )) {
                                await load();
                              }
                            },
                      child: const Text('Record permission'),
                    ),
                  ),
                input('businessName', 'Business name'),
                input(
                  'services',
                  'Permitted services/topics — one per line',
                  lines: 2,
                ),
                input('voice', 'Business voice'),
                input(
                  'claims',
                  'Supported facts only — one per line',
                  lines: 2,
                ),
                input(
                  'destinations',
                  'Approved HTTPS destinations — one per line',
                  lines: 2,
                ),
                input(
                  'timeZone',
                  'Workspace timezone (for example America/New_York)',
                ),
                input(
                  'expiresAt',
                  'Exact policy expiry in UTC (YYYY-MM-DDTHH:mm:ssZ)',
                ),
                input('sendingDays', 'Allowed weekdays: Monday=1 … Sunday=7'),
                input(
                  'opensMinute',
                  'Send window start: minutes after local midnight',
                ),
                input(
                  'closesMinute',
                  'Send window end: minutes after local midnight',
                ),
                choice(
                  'introductionsEnabled',
                  'Automatic introductions',
                  'Only the exact approved introduction to eligible consenting/requesting contacts.',
                ),
                input(
                  'initialPerDay',
                  'Maximum automatic messages per day (0–20)',
                ),
                input('introductionSubject', 'Approved introduction subject'),
                input(
                  'introductionBody',
                  'Exact approved introduction',
                  lines: 3,
                ),
                choice(
                  'followupsEnabled',
                  'Bounded follow-ups',
                  'Stops when a reply or opt-out arrives; no uncertain-send retries.',
                ),
                input(
                  'followupsPerContact',
                  'Maximum follow-ups per contact (0–3)',
                ),
                input(
                  'followupIntervalHours',
                  'Minimum hours between follow-ups (at least 120)',
                ),
                input('followupSubject', 'Approved follow-up subject'),
                input('followupBody', 'Exact approved follow-up', lines: 3),
                input(
                  'mailingAddress',
                  'Authorized public Business mailing address',
                ),
                choice(
                  'newInquiriesEnabled',
                  'Read new inquiries',
                  'Only the Gmail label below, after your saved authorization. Historical inbox import is excluded.',
                ),
                input(
                  'inquiryLabel',
                  'Existing Gmail inquiry label (letters, numbers, underscore or hyphen)',
                ),
                const Text(
                  'In Gmail, create a filter for the inquiry address or other exact criteria you want monitored, and choose Apply label using the label above. Do not select “Also apply to matching conversations.” This one-time filter routes future matching mail automatically. ScaledCircle does not create or change Gmail filters and does not monitor the rest of your inbox. Replies in already-linked conversations are checked independently, even without this label.',
                ),
                input(
                  'inquiryFilterDescription',
                  'Describe the exact Gmail filter coverage',
                  lines: 2,
                ),
                choice(
                  'inquiryRoutingConfirmed',
                  'I saved this automatic Gmail filter',
                  'The coverage is owner-confirmed; ScaledCircle cannot inspect Gmail filter settings with its current permissions.',
                ),
                choice(
                  'modelAssistance',
                  'Suggest replies for my approval',
                  'No automatic replies. Relevant conversation text and approved Business context would be processed by OpenAI.',
                ),
                const Text(
                  'The pilot uses gpt-4.1-mini with response storage disabled. This is not zero retention: provider abuse-monitoring logs may be retained for up to 30 days. Data sharing for training is disabled. Suggestions remain gated until the data-use review is complete. Manual replies continue without model assistance.',
                ),
                choice(
                  'modelDataConsent',
                  'I agree to the described model processing',
                  'Applies only to this Business and the bounded pilot. No tools or unrelated mailbox content.',
                ),
                choice(
                  'push',
                  'Owner push alerts',
                  'Minimal notification text opens the authenticated conversation.',
                ),
                choice(
                  'email',
                  'Owner account-email alerts',
                  'Sent to your verified owner account; no private conversation body in the alert.',
                ),
                input(
                  'quietStart',
                  'Quiet hours start: minutes after local midnight',
                ),
                input(
                  'quietEnd',
                  'Quiet hours end: minutes after local midnight',
                ),
                choice(
                  'bookingEnabled',
                  'Schedule assistance',
                  'Uses saved staff availability and buffers. Tentative offers are not appointments. Conflicts or ambiguous acceptance require review.',
                ),
                OutlinedButton(
                  onPressed: busy
                      ? null
                      : () async {
                          try {
                            if (await editEmailAvailability(context, data!)) {
                              await load();
                            }
                          } catch (_) {
                            if (mounted) {
                              setState(
                                () => feedback =
                                    'Availability could not be loaded.',
                              );
                            }
                          }
                        },
                  child: const Text('Set appointment availability'),
                ),
                Text(
                  'Saved availability: ${data!['schedulingAvailability'] == null ? 'Not configured — save working hours in Schedule before authorization.' : 'Version ${data!['schedulingAvailability']['version']}'}',
                ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: busy ? null : () => act('prepare'),
                      child: const Text('Save preferences'),
                    ),
                    FilledButton(
                      onPressed:
                          busy || (data!['blockers'] as List? ?? []).isNotEmpty
                          ? null
                          : () => act('activate'),
                      child: const Text('Authorize email assistance'),
                    ),
                    if (data!['policy']?['status'] == 'paused')
                      TextButton(
                        onPressed:
                            busy ||
                                (data!['blockers'] as List? ?? []).isNotEmpty
                            ? null
                            : () => act('resume'),
                        child: const Text('Resume automatic sending'),
                      ),
                    if (data!['policy'] != null) ...[
                      TextButton(
                        onPressed: busy ? null : () => act('pause'),
                        child: const Text('Pause automatic sending'),
                      ),
                      TextButton(
                        onPressed: busy ? null : () => act('revoke'),
                        child: const Text('Revoke assistance'),
                      ),
                    ],
                  ],
                ),
              ],
            ],
          ),
  );
}
