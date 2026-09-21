import 'package:flutter/material.dart';
import '../../services/business_email_service.dart';
import 'business_email_availability.dart';
import 'business_email_permission.dart';
import 'business_email_setup_controls.dart';

/// A proposal is never authorization. All execution authority remains server-side.
class BusinessEmailAssistanceScreen extends StatefulWidget {
  const BusinessEmailAssistanceScreen({
    super.key,
    required this.service,
    this.availabilityEditor,
  });
  final BusinessEmailService service;
  final Future<bool> Function(BuildContext, Map)? availabilityEditor;
  @override
  State<BusinessEmailAssistanceScreen> createState() => _AssistanceState();
}

class _AssistanceState extends State<BusinessEmailAssistanceScreen> {
  Map<String, dynamic>? data;
  final fields = <String, TextEditingController>{};
  final choices = <String, bool>{};
  bool busy = false, dirty = false, editingAvailability = false;
  final panels = List.generate(5, (_) => ExpansibleController());
  final pageScroll = ScrollController();
  String mailboxMode = 'conversations';
  String? feedback;
  int section = 0;
  TextEditingController field(String k) =>
      fields.putIfAbsent(k, () => TextEditingController());
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    pageScroll.dispose();
    for (final c in panels) {
      c.dispose();
    }
    for (final f in fields.values) {
      f.dispose();
    }
    super.dispose();
  }

  Future<void> load({bool preserve = false}) async {
    try {
      final result = await widget.service.call('loadAssistance');
      if (!mounted) return;
      if (!preserve) {
        final p = Map<String, dynamic>.from(
          result['policy']?['policy'] as Map? ?? {},
        );
        final proposal = result['proposal']?['values'] as Map? ?? {};
        final test = result['proposal']?['controlled'] as Map? ?? {};
        mailboxMode =
            p['mailboxMode']?.toString() ??
            (p.isNotEmpty
                ? (p['newInquiriesEnabled'] == true
                      ? 'labels'
                      : 'conversations')
                : result['proposal']?['recommendedMailboxMode']?.toString() ??
                      'conversations');
        for (final k in [
          'businessName',
          'voice',
          'timeZone',
          'mailingAddress',
          'inquiryLabel',
          'inquiryFilterDescription',
          'ownerStopLocal',
        ]) {
          field(k).text =
              '${p[k] ?? proposal[k] ?? (k == 'businessName'
                      ? result['workspaceName']
                      : k == 'timeZone'
                      ? 'America/New_York'
                      : k == 'inquiryLabel'
                      ? test['label']
                      : k == 'inquiryFilterDescription'
                      ? test['filter']
                      : null) ?? ''}';
        }
        for (final k in ['services', 'claims', 'destinations']) {
          field(k).text = (p[k] as List? ?? proposal[k] as List? ?? []).join(
            '\n',
          );
        }
        for (final e in {
          'initialPerDay': 1,
          'followupsPerContact': 0,
          'followupIntervalHours': 120,
        }.entries) {
          field(e.key).text = '${p['limits']?[e.key] ?? e.value}';
        }
        field('sendingDays').text =
            (p['sendingDays'] as List? ?? [1, 2, 3, 4, 5]).join(',');
        for (final e in {'opensMinute': 540, 'closesMinute': 1020}.entries) {
          field(e.key).text = '${p[e.key] ?? e.value}';
        }
        for (final kind in ['introduction', 'followup']) {
          field('${kind}Subject').text =
              '${p['templates']?[kind]?['subject'] ?? proposal['templates']?[kind]?['subject'] ?? (kind == 'introduction' ? test['subject'] : null) ?? ''}';
          field('${kind}Body').text =
              '${p['templates']?[kind]?['body'] ?? proposal['templates']?[kind]?['body'] ?? (kind == 'introduction' ? test['body'] : null) ?? ''}';
        }
        for (final k in [
          'introductionsEnabled',
          'followupsEnabled',
          'modelAssistance',
          'modelDataConsent',
          'bookingEnabled',
          'newInquiriesEnabled',
          'inquiryRoutingConfirmed',
        ]) {
          choices[k] = p[k] == true;
        }
        for (final k in ['push', 'email']) {
          choices[k] = p['notifications']?[k] == true;
        }
        field('quietStart').text =
            '${p['notifications']?['quietStartMinute'] ?? 1260}';
        field('quietEnd').text =
            '${p['notifications']?['quietEndMinute'] ?? 480}';
        dirty = false;
      }
      setState(() => data = result);
    } catch (_) {
      if (mounted) {
        setState(
          () => feedback =
              'Settings could not be loaded. Your edits are retained. Try again.',
        );
      }
    }
  }

  void changed() {
    setState(() => dirty = true);
  }

  void setField(String k, String v) {
    setState(() {
      field(k).text = v;
      dirty = true;
    });
  }

  Map<String, dynamic> policy() => {
    'mailboxMode': mailboxMode,
    'historyMode': 'future',
    'autonomyMode': 'bounded_managed',
    'replyMode': 'approval_required',
    'termMode': 'shared_pilot',
    'expiresAt': null,
    'ownerStopLocal': field('ownerStopLocal').text.isEmpty
        ? null
        : field('ownerStopLocal').text,
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
    'limits': {
      for (final k in [
        'initialPerDay',
        'followupsPerContact',
        'followupIntervalHours',
      ])
        k: int.parse(field(k).text),
    },
    'sendingDays': field(
      'sendingDays',
    ).text.split(',').where((s) => s.isNotEmpty).map(int.parse).toList(),
    'opensMinute': int.parse(field('opensMinute').text),
    'closesMinute': int.parse(field('closesMinute').text),
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
      'quietStartMinute': int.parse(field('quietStart').text),
      'quietEndMinute': int.parse(field('quietEnd').text),
    },
    'availabilityRevision': data?['schedulingAvailability']?['version'],
    'schedulingRules': data?['schedulingAvailability']?['settings'],
    'templates': {
      for (final k in ['introduction', 'followup'])
        k: {
          'subject': field('${k}Subject').text.trim(),
          'body': field('${k}Body').text.trim(),
        },
    },
  };
  Future<void> act(String action) async {
    if (busy) return;
    if (action != 'prepare') {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(
            action == 'activate'
                ? 'Authorize reviewed Email preferences?'
                : '$action email assistance?',
          ),
          content: Text(
            '${data?['workspaceName']} · ${data?['sender']}\nCoverage: $mailboxMode. New messages from authorization only; no historical import, Spam, Trash, Sent or attachments.\nOnly separately permitted recipients are eligible. Suggested replies require exact approval. No Social or subscription changes.',
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
      if (ok != true) return;
    }
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final r = await widget.service.call('manageAssistance', {
        'action': action,
        'expectedVersion': data?['policy']?['version'] ?? 0,
        'requestId': 'email_settings_${DateTime.now().microsecondsSinceEpoch}',
        if (action == 'prepare' || action == 'activate') 'policy': policy(),
        'confirm': action != 'prepare',
      });
      await load();
      if (mounted) {
        setState(
          () => feedback = r['status'] == 'prepared'
              ? 'Preferences saved — assistance is not active.'
              : 'Saved state: ${r['status']}',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => feedback =
              'Could not save this change. Your edits are retained. Check the required Business fields and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget input(String k, String title, {int lines = 1}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: TextField(
      controller: field(k),
      minLines: lines,
      maxLines: lines + 3,
      onChanged: (_) => changed(),
      decoration: InputDecoration(
        labelText: title,
        border: const OutlineInputBorder(),
      ),
    ),
  );
  Widget toggle(String k, String title, String detail) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    value: choices[k] == true,
    onChanged: busy
        ? null
        : (v) => setState(() {
            choices[k] = v;
            dirty = true;
          }),
    title: Text(title),
    subtitle: Text(detail),
  );
  Widget origin(String k) => const SizedBox.shrink();
  Widget time(String k, String label) =>
      emailTime(context, label, field(k).text, (v) => setField(k, v));
  Widget panel(int n, String title, String summary, List<Widget> children) =>
      Card(
        child: ExpansionTile(
          key: ValueKey('section_$n'),
          controller: panels[n],
          maintainState: true,
          initiallyExpanded: section == n,
          onExpansionChanged: (v) {
            if (v) {
              for (var i = 0; i < panels.length; i++) {
                if (i != n && panels[i].isExpanded) panels[i].collapse();
              }
              section = n;
            }
          },
          title: Text(title),
          subtitle: Text(summary),
          childrenPadding: const EdgeInsets.all(16),
          children: children,
        ),
      );
  String on(String k) => choices[k] == true ? 'On' : 'Off';
  String hours(String a, String b) =>
      '${emailTimeLabel(context, field(a).text)}–${emailTimeLabel(context, field(b).text)}';
  String get days => field('sendingDays').text
      .split(',')
      .where((x) => int.tryParse(x) != null)
      .map(
        (x) => const [
          'Mon',
          'Tue',
          'Wed',
          'Thu',
          'Fri',
          'Sat',
          'Sun',
        ][int.parse(x) - 1],
      )
      .join(', ');
  String get zone =>
      emailTimezones[field('timeZone').text] ?? field('timeZone').text;
  Future<void> earlierStop() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 17, minute: 0),
    );
    if (time == null || !mounted) return;
    String two(int n) => n.toString().padLeft(2, '0');
    setField(
      'ownerStopLocal',
      '${date.year}-${two(date.month)}-${two(date.day)}T${two(time.hour)}:${two(time.minute)}',
    );
  }

  Future<void> permissions() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(c).height * .8,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'Recipient permissions',
                style: Theme.of(c).textTheme.titleLarge,
              ),
              const Text(
                'Record only actual permission for this pilot and its message scope. A proposal or previous Google demonstration is not consent. If the proposed recipient is absent, add that contact through Business → Schedule → Customers, then reload here.',
              ),
              for (final contact in data?['contacts'] as List? ?? [])
                ListTile(
                  title: Text('${contact['name']} · ${contact['email']}'),
                  subtitle: Text('Permission: ${contact['permissionStatus']}'),
                  trailing: TextButton(
                    onPressed: () async {
                      if (await recordEmailPermission(
                        c,
                        widget.service,
                        contact,
                      )) {
                        await load(preserve: true);
                      }
                    },
                    child: const Text('Record permission'),
                  ),
                ),
              TextButton(
                onPressed: () => Navigator.pop(c),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> review() {
    final test = data?['proposal']?['controlled'] as Map?;
    final recipient = test?['recipient'];
    final matches = (data?['contacts'] as List? ?? [])
        .where((c) => c['email'] == recipient)
        .toList();
    final permission = matches.isEmpty
        ? 'Not recorded'
        : matches.first['permissionStatus'];
    return [
      Text(
        'Business: ${field('businessName').text}\nSender: ${data?['sender']}',
      ),
      Text(
        'Coverage: ${mailboxMode == 'inbox'
            ? 'Whole Inbox'
            : mailboxMode == 'labels'
            ? 'Selected label'
            : 'Existing conversations only'} · New inquiry intake: ${on('newInquiriesEnabled')}\nFuture messages from authorization; historical Inbox review is not enabled.',
      ),
      if (mailboxMode == 'labels')
        Text(
          'Label: ${field('inquiryLabel').text}\nFilter: ${field('inquiryFilterDescription').text}\nFilter owner-confirmed: ${choices['inquiryRoutingConfirmed'] == true ? 'Yes' : 'No'}',
        ),
      if (test != null)
        Text('Proposed recipient: $recipient\nPilot permission: $permission'),
      Text(
        'Subject: ${field('introductionSubject').text}\n${field('introductionBody').text}',
      ),
      Text(
        'Introductions: ${on('introductionsEnabled')}, at most ${field('initialPerDay').text}/day\nFollow-ups: ${on('followupsEnabled')}, at most ${field('followupsPerContact').text}/contact\nSending: $days · ${hours('opensMinute', 'closesMinute')} · $zone\nQuiet hours: ${hours('quietStart', 'quietEnd')}',
      ),
      Text(
        'Owner email alerts: ${on('email')} → ${data?['ownerEmail'] ?? 'Verified owner account'}\nPush alerts: ${on('push')} · ${data?['pushReady'] == true ? 'Registered device' : 'No ready registered device'}\nSuggested replies: ${on('modelAssistance')} — exact-message approval required\nModel consent: ${on('modelDataConsent')}',
      ),
      Text(
        'Schedule assistance: ${on('bookingEnabled')}\n${availabilitySummary()}',
      ),
      const Text(
        'Non-model access: up to seven days from owner authorization, with no renewal and any earlier saved expiry preserved. The separate inference allowance is USD 1 / 100 requests TOTAL across both Businesses over its shared seven-day term; non-model authorization does not start that spending clock.',
      ),
      Text(
        'Earlier owner stop: ${field('ownerStopLocal').text.isEmpty ? 'None proposed' : '${field('ownerStopLocal').text.replaceFirst('T', ' ')} · $zone'}\nSaving does not start the clock.',
      ),
      Text(
        'Saved state: ${data?['policy']?['status'] ?? 'Not saved'}${dirty ? ' · Unsaved edits' : ''}',
      ),
      if (data?['policy'] == null || dirty)
        const Text(
          'Save your reviewed preferences first. Activation readiness will then be checked against the saved version.',
        ),
      if (data?['policy'] != null && !dirty)
        ...((data?['blockers'] as List? ?? []).map(
          (b) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(
              (data?['blockerMessages'] as Map?)?[b]?.toString() ??
                  blocker(b.toString()),
            ),
          ),
        )),
      const Text(
        'Model-data review / applicable Google requirements remain required. Saving is not provider approval, recipient consent or device registration.',
      ),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          FilledButton(
            onPressed: busy ? null : () => act('prepare'),
            child: const Text('Save preferences'),
          ),
          if (data?['policy'] != null &&
              !dirty &&
              (data?['blockers'] as List? ?? []).isEmpty)
            OutlinedButton(
              onPressed: busy ? null : () => act('activate'),
              child: const Text('Authorize email assistance'),
            ),
          if (data?['policy']?['status'] == 'active')
            TextButton(
              onPressed: busy ? null : () => act('pause'),
              child: const Text('Pause assistance'),
            ),
          if (data?['policy']?['status'] == 'paused' &&
              !dirty &&
              (data?['blockers'] as List? ?? []).isEmpty)
            TextButton(
              onPressed: busy ? null : () => act('resume'),
              child: const Text('Resume assistance'),
            ),
          if (data?['policy'] != null)
            TextButton(
              onPressed: busy ? null : () => act('revoke'),
              child: const Text('Revoke assistance'),
            ),
        ],
      ),
    ];
  }

  String blocker(String b) =>
      const {
        'business_content_boundaries_required':
            'Complete Business services, voice, supported facts and destinations in section A.',
        'contact_limits_required': 'Review message limits in section B.',
        'sending_window_required':
            'Choose valid sending days and hours in section B.',
        'automatic_inquiry_filter_confirmation_required':
            'Save the narrow Gmail filter and confirm it in section A.',
        'inquiry_label_required': 'Choose a valid Gmail label in section A.',
        'valid_notification_quiet_hours_required':
            'Review quiet hours in section C.',
        'healthy_owned_mailbox_required':
            'The connected mailbox needs Read and Send permission.',
        'mailbox_credentials_unavailable':
            'Mailbox connection needs attention in Business Email.',
      }[b] ??
      'A saved authorization prerequisite needs attention. Reload settings or contact support.';
  String availabilitySummary() {
    final a = data?['schedulingAvailability']?['settings'] as Map?;
    if (a == null) {
      return 'Availability not saved. Choose timezone, working hours, duration and buffers. Staff is optional.';
    }
    return 'Saved availability: ${emailTimezones[a['timeZone']] ?? a['timeZone']} · ${(a['days'] as List? ?? []).map((d) => const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(d as num).toInt() - 1]).join(', ')}\n${emailTimeLabel(context, '${a['opensMinute']}')}–${emailTimeLabel(context, '${a['closesMinute']}')} · ${a['durationMinutes']} minutes · ${a['bufferMinutes']}-minute buffers\nStaff: ${(a['assignedPeople'] as List? ?? []).isEmpty ? 'Assign later' : (data?['schedulingAvailability']?['assignedLabels'] as List? ?? ['${(a['assignedPeople'] as List? ?? []).length} selected']).join(', ')}\nLocation required: ${a['locationRequired'] == true ? 'Yes' : 'No'}. Version ${data?['schedulingAvailability']?['version']}.';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Email assistance')),
    body: data == null
        ? Center(
            child: feedback == null
                ? const CircularProgressIndicator()
                : TextButton(onPressed: load, child: Text(feedback!)),
          )
        : SingleChildScrollView(
            controller: pageScroll,
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Recommended setup for ${data!['workspaceName']} · ${data!['sender'] ?? 'No mailbox connected'}',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                Text(
                  'Saved status: ${data!['policy']?['status'] ?? 'Not authorized'}',
                ),
                const Text(
                  'Selected preferences run only after owner authorization and applicable readiness checks. Saving preferences does not activate assistance.',
                ),
                Text(
                  'Operating status: ${data?['policy']?['status'] == 'active' ? 'Authorized capabilities are checked by the recurring worker' : 'Not active — preferences are not execution authority'}',
                ),
                Text(
                  'AI suggestions: ${data?['capabilities']?['modelSuggestions']?['ready'] == true ? 'Available only with explicit consent and remaining allowance' : 'Gated; owner-written replies and eligible non-model capabilities remain separate'}',
                ),
                if (data?['intakeStatus'] != null)
                  Text(
                    'Last intake: ${data!['intakeStatus']['state']} · ${data!['intakeStatus']['considered']} considered · ${data!['intakeStatus']['unclassified']} unclassified. Limited screening does not mean no opportunities.',
                  ),
                if (feedback != null)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(feedback!),
                  ),
                if (data!['canManage'] != true)
                  const Text(
                    'Only the authorized Business owner can manage this setup.',
                  )
                else ...[
                  panel(
                    0,
                    'A. Business and monitored mailbox',
                    '${field('businessName').text} · ${data!['sender']}',
                    [
                      origin('businessName'),
                      input('businessName', 'Business name'),
                      origin('services'),
                      input(
                        'services',
                        'Permitted services / topics',
                        lines: 2,
                      ),
                      origin('voice'),
                      input('voice', 'Business voice'),
                      origin('claims'),
                      input(
                        'claims',
                        'Supported facts — review before use',
                        lines: 2,
                      ),
                      origin('destinations'),
                      input(
                        'destinations',
                        'Approved HTTPS destinations',
                        lines: 2,
                      ),
                      origin('mailingAddress'),
                      input(
                        'mailingAddress',
                        'Authorized PUBLIC Business mailing footer',
                      ),
                      const Text(
                        'Do not use private identity, bank or residential details as a public footer. A missing approved public address remains missing.',
                      ),
                      origin('timeZone'),
                      emailZone(
                        field('timeZone').text,
                        (v) => setField('timeZone', v),
                      ),
                      toggle(
                        'newInquiriesEnabled',
                        'Read new inquiries',
                        'Use the selected coverage after explicit authorization. Linked conversation replies remain independently monitored.',
                      ),
                      DropdownButtonFormField<String>(
                        initialValue: mailboxMode,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Mailbox coverage',
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'inbox',
                            child: Text('Monitor my whole inbox'),
                          ),
                          DropdownMenuItem(
                            value: 'labels',
                            child: Text('Monitor selected labels'),
                          ),
                          DropdownMenuItem(
                            value: 'conversations',
                            child: Text('Only follow existing conversations'),
                          ),
                        ],
                        onChanged: busy
                            ? null
                            : (v) => setState(() {
                                mailboxMode = v!;
                                choices['newInquiriesEnabled'] =
                                    v != 'conversations';
                                dirty = true;
                              }),
                      ),
                      const Text(
                        'Future messages only, from authorization. Inbox excludes archived-only mail, Sent, Spam, Trash and attachments. Existing Inbox lookback is not supported in this release. No Gmail messages are moved, marked read or relabeled.',
                      ),
                      if (mailboxMode == 'inbox')
                        const Text(
                          'No Gmail label or filter setup is required. Non-model screening is conservative; uncertain messages are reported as limited screening, not as no opportunities. Mailbox monitoring does not authorize outbound marketing or booking.',
                        ),
                      if (mailboxMode == 'labels') ...[
                        const Text(
                          'This narrower mode monitors one selected label.',
                        ),
                        input('inquiryLabel', 'Proposed Gmail label'),
                        input(
                          'inquiryFilterDescription',
                          'Exact proposed Gmail filter',
                          lines: 2,
                        ),
                        const Text(
                          'One-time owner setup in Gmail: create the label above; open search options, enter the exact sender and subject shown in the filter, choose Create filter → Apply the label. Leave “Also apply to matching conversations” OFF. This routes future matching mail automatically; no manual labeling of each lead. ScaledCircle cannot inspect or change filters with its current scopes. Already-linked replies are checked independently even if their label changes.',
                        ),
                        toggle(
                          'inquiryRoutingConfirmed',
                          'I saved this automatic Gmail filter',
                          'Confirm only after you actually create it. Prefilling this proposal does not verify routing.',
                        ),
                      ],
                      ExpansionTile(
                        title: const Text('Sources and proposal details'),
                        children: [
                          Text('${data?['proposal']?['sources'] ?? {}}'),
                        ],
                      ),
                    ],
                  ),
                  panel(
                    1,
                    'B. Messages and eligible recipients',
                    'Introductions ${on('introductionsEnabled')} · Follow-ups ${on('followupsEnabled')}',
                    [
                      if (data?['proposal']?['controlled'] != null)
                        Text(
                          'Controlled pilot proposal only: ${data!['proposal']['controlled']['recipient']}. Actual permission for this pilot must be separately recorded. Earlier Google-demo consent does not apply.',
                        ),
                      OutlinedButton(
                        onPressed: permissions,
                        child: const Text(
                          'Review / record actual recipient permission',
                        ),
                      ),
                      input(
                        'introductionSubject',
                        'Proposed introduction subject',
                      ),
                      input(
                        'introductionBody',
                        'Exact proposed introduction',
                        lines: 4,
                      ),
                      toggle(
                        'introductionsEnabled',
                        'Automatic introductions',
                        'Only the reviewed template and separately consenting/requesting recipients. Saving is not activation.',
                      ),
                      input(
                        'initialPerDay',
                        'Maximum introductions per day (0–20)',
                      ),
                      toggle(
                        'followupsEnabled',
                        'Bounded follow-ups',
                        'Stop on reply or opt-out. No uncertain-send retries.',
                      ),
                      if (choices['followupsEnabled'] == true) ...[
                        input(
                          'followupsPerContact',
                          'Maximum follow-ups per contact (0–3)',
                        ),
                        DropdownButtonFormField<int>(
                          initialValue: int.tryParse(
                            field('followupIntervalHours').text,
                          ),
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Wait between follow-ups',
                          ),
                          items:
                              ({
                                    ...[120, 168, 240, 336],
                                    int.tryParse(
                                          field('followupIntervalHours').text,
                                        ) ??
                                        120,
                                  }.toList()..sort())
                                  .map(
                                    (h) => DropdownMenuItem(
                                      value: h,
                                      child: Text(
                                        'Wait at least ${h / 24 == h ~/ 24 ? h ~/ 24 : h / 24} days',
                                      ),
                                    ),
                                  )
                                  .toList(),
                          onChanged: (v) {
                            if (v != null) {
                              setField('followupIntervalHours', '$v');
                            }
                          },
                        ),
                        input('followupSubject', 'Proposed follow-up subject'),
                        input(
                          'followupBody',
                          'Exact proposed follow-up',
                          lines: 3,
                        ),
                      ],
                      const Text(
                        'Proposed sending window — confirm these days and local times.',
                      ),
                      emailDays(
                        field('sendingDays').text,
                        (v) => setField('sendingDays', v),
                      ),
                      time('opensMinute', 'Sending starts'),
                      time('closesMinute', 'Sending ends'),
                      Text(zone),
                    ],
                  ),
                  panel(
                    2,
                    'C. Owner alerts and suggested replies',
                    'Email ${on('email')} · Push ${on('push')} · Suggestions ${on('modelAssistance')}',
                    [
                      Text(
                        'Owner email: ${data!['ownerEmail'] ?? 'Verified owner account'}\nPush: ${data!['pushReady'] == true ? 'Registered device ready for physical test' : 'No ready device registered. In the signed-in app, open Notifications → Notification preferences → Mobile push notifications.'}',
                      ),
                      toggle(
                        'email',
                        'Owner account-email alerts',
                        'Minimal account notification to the verified owner. Email readiness is independent of push registration.',
                      ),
                      toggle(
                        'push',
                        'Owner push alerts',
                        'Use this owner’s device registration. Opens the authenticated conversation; no private body in alerts.',
                      ),
                      time('quietStart', 'Quiet hours start'),
                      time('quietEnd', 'Quiet hours end'),
                      const Text(
                        'Optional model processing: relevant conversation text and necessary Business context are sent to OpenAI gpt-4.1-mini for reply suggestions, with response storage disabled. This is not zero retention. Default abuse-monitoring logs may be retained up to 30 days, with applicable legal/security exceptions; authorized provider personnel may access them. Training sharing is disabled. No public-web search, advertising targeting or unrelated cross-Business training. The model-data / Google review gate remains open. Ordinary permitted manual replies remain available.',
                      ),
                      toggle(
                        'modelAssistance',
                        'Suggest replies for my approval',
                        'Every substantive suggested reply needs your approval of the exact current message.',
                      ),
                      toggle(
                        'modelDataConsent',
                        'I agree to the described model processing',
                        'Separate explicit opt-in for this workspace only. Saving consent does not bypass the outstanding data review.',
                      ),
                    ],
                  ),
                  panel(
                    3,
                    'D. Appointment availability',
                    data?['schedulingAvailability'] == null
                        ? 'Not configured'
                        : 'Saved availability',
                    [
                      Text(availabilitySummary()),
                      toggle(
                        'bookingEnabled',
                        'Schedule assistance',
                        'Tentative offers are not confirmed appointments. Clear recipient acceptance and conflict checks are required.',
                      ),
                      OutlinedButton(
                        onPressed: busy || editingAvailability
                            ? null
                            : () async {
                                final offset = pageScroll.hasClients
                                    ? pageScroll.offset
                                    : 0.0;
                                setState(() => editingAvailability = true);
                                try {
                                  if (await (widget.availabilityEditor ??
                                      editEmailAvailability)(context, data!)) {
                                    await load(preserve: true);
                                    changed();
                                    if (mounted) {
                                      setState(
                                        () => feedback =
                                            'Appointment availability saved. Email assistance activation is unchanged.',
                                      );
                                    }
                                  }
                                } catch (_) {
                                  if (mounted) {
                                    setState(
                                      () => feedback =
                                          'Availability could not be loaded. Your assistance edits are retained.',
                                    );
                                  }
                                } finally {
                                  if (mounted) {
                                    setState(() => editingAvailability = false);
                                    WidgetsBinding.instance
                                        .addPostFrameCallback((_) {
                                          if (mounted &&
                                              pageScroll.hasClients) {
                                            pageScroll.jumpTo(
                                              offset.clamp(
                                                0.0,
                                                pageScroll
                                                    .position
                                                    .maxScrollExtent,
                                              ),
                                            );
                                          }
                                        });
                                  }
                                }
                              },
                        child: Text(
                          editingAvailability
                              ? 'Opening availability…'
                              : data?['schedulingAvailability'] == null
                              ? 'Set appointment availability'
                              : 'Edit appointment availability',
                        ),
                      ),
                      const Text(
                        'No old proposed date is booked or assumed valid. Choose an actual future slot during the controlled test. Booking confirmation uses an owner-reviewed reply, not an automatic email.',
                      ),
                    ],
                  ),
                  panel(
                    4,
                    'E. Review and save',
                    'Prepared preferences are separate from active assistance',
                    [
                      const Text(
                        'Review the bounded access term below. Saving preferences starts neither access nor inference. Authorizing non-model features starts only this Business’s existing access term; model processing stays separately gated.',
                      ),
                      if (data?['accessTerm']?['expiresAt'] != null)
                        Text(
                          'Business access expiry: ${DateTime.fromMillisecondsSinceEpoch((data!['accessTerm']['expiresAt'] as num).toInt(), isUtc: true)}',
                        ),
                      if (data?['pilotTerm']?['expiresAt'] != null)
                        Text(
                          'Shared expiry: ${DateTime.fromMillisecondsSinceEpoch((data!['pilotTerm']['expiresAt'] as num).toInt(), isUtc: true)}',
                        ),
                      Text(
                        'Optional earlier stop in $zone: ${field('ownerStopLocal').text.isEmpty ? 'None' : field('ownerStopLocal').text.replaceFirst('T', ' ')}',
                      ),
                      Wrap(
                        children: [
                          TextButton(
                            onPressed: earlierStop,
                            child: const Text('Choose earlier stop'),
                          ),
                          if (field('ownerStopLocal').text.isNotEmpty)
                            TextButton(
                              onPressed: () => setField('ownerStopLocal', ''),
                              child: const Text('Use shared expiry'),
                            ),
                        ],
                      ),
                      ...review().map(
                        (w) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: w,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
  );
}
