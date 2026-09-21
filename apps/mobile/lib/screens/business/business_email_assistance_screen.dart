import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:cloud_functions/cloud_functions.dart';
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
  String messageOrigin = 'owner';
  String? feedback;
  int section = 0;
  int loadSequence = 0;
  int? editBaseVersion;
  int? pendingSavedVersion;
  String? submittedSnapshot;
  String? loadedSnapshot;
  String get unsavedSummary {
    if (loadedSnapshot == null) return 'Current form';
    final before = jsonDecode(loadedSnapshot!) as Map;
    final current = jsonDecode(draftSnapshot()) as Map;
    final groups = <String>{};
    for (final section in ['fields', 'choices']) {
      final a = before[section] as Map, b = current[section] as Map;
      for (final k in b.keys) {
        if (a[k] == b[k]) continue;
        if ([
          'modelAssistance',
          'modelDataConsent',
          'push',
          'email',
          'quietStart',
          'quietEnd',
        ].contains(k)) {
          groups.add('C. Alerts and AI');
        } else if ([
          'businessName',
          'services',
          'voice',
          'claims',
          'destinations',
          'mailingAddress',
          'inquiryLabel',
          'inquiryFilterDescription',
          'inquiryRoutingConfirmed',
          'newInquiriesEnabled',
        ].contains(k)) {
          groups.add('A. Business and mailbox');
        } else if (k == 'bookingEnabled') {
          groups.add('D. Schedule');
        } else {
          groups.add('B. Outreach and limits');
        }
      }
    }
    if (before['mode'] != current['mode']) groups.add('A. Mailbox coverage');
    return groups.isEmpty
        ? 'Current form or availability binding'
        : groups.join('; ');
  }

  bool conflicted = false;
  String get operatingState {
    final p = data?['policy'];
    if (p?['revokedAt'] != null || p?['status'] == 'revoked') {
      return 'Stopped — authorization revoked';
    }
    if (p?['policy']?['expiresAt'] is num &&
        p['policy']['expiresAt'] <= DateTime.now().millisecondsSinceEpoch) {
      return 'Stopped — authorization expired';
    }
    if (p?['status'] == 'paused') {
      return 'Paused — saving does not resume assistance';
    }
    return p?['status'] == 'active'
        ? 'Partially active — only authorized, eligible capabilities may operate'
        : 'Not active — preferences are not execution authority';
  }

  Future<void> checkSavedResult() async {
    setState(() {
      busy = true;
      feedback = 'Checking saved settings…';
    });
    final ok = await load(
      expectedVersion: pendingSavedVersion,
      preserve: pendingSavedVersion == null,
    );
    if (mounted) {
      setState(() {
        busy = false;
        if (ok && pendingSavedVersion != null) {
          pendingSavedVersion = null;
          feedback = dirty
              ? 'Saved result confirmed; newer local edits remain unsaved.'
              : 'All changes saved. Authorization and expiry preserved.';
        } else if (ok) {
          conflicted = true;
          feedback =
              'Latest saved status loaded. Your local edits are retained. Review the saved settings before choosing which version to keep.';
        }
      });
    }
  }

  Future<void> useSavedSettings() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Use the latest saved preferences?'),
        content: const Text(
          'This discards the unsaved edits on this screen and loads the authoritative saved preferences. No server settings or authorization will change.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Keep my edits'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Load saved preferences'),
          ),
        ],
      ),
    );
    if (ok == true) {
      final loaded = await load();
      if (mounted && loaded) {
        setState(() {
          conflicted = false;
          feedback = 'Saved preferences loaded. No authorization changed.';
        });
      }
    }
  }

  String draftSnapshot() => jsonEncode({
    'fields': fields.map((k, v) => MapEntry(k, v.text)),
    'choices': choices,
    'mode': mailboxMode,
    'messageOrigin': messageOrigin,
  });
  bool get previouslyAuthorized =>
      data?['policy']?['approvedBy'] != null ||
      ['active', 'paused', 'revoked'].contains(data?['policy']?['status']);
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

  Future<bool> load({bool preserve = false, int? expectedVersion}) async {
    final ticket = ++loadSequence, entered = draftSnapshot();
    try {
      final result = await widget.service.call('loadAssistance');
      if (!mounted || ticket != loadSequence) return false;
      if (expectedVersion != null &&
          result['policy']?['version'] != expectedVersion) {
        throw StateError('Saved version changed before readback');
      }
      final keepEdits =
          preserve ||
          entered != draftSnapshot() ||
          (expectedVersion != null &&
              submittedSnapshot != null &&
              submittedSnapshot != draftSnapshot());
      if (!keepEdits) {
        final p = Map<String, dynamic>.from(
          result['policy']?['policy'] as Map? ?? {},
        );
        messageOrigin = p['messageOrigin']?.toString() ?? 'owner';
        choices['messagePreparation'] =
            p['messagePreparation']?['enabled'] == true;
        choices['preparationContextReviewed'] =
            p['messagePreparation']?['contextReviewed'] == true;
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
        choices['adaptiveOutreach'] = p['adaptiveOutreach']?['enabled'] == true;
        choices['outreachExploration'] =
            p['adaptiveOutreach']?['explorationEnabled'] == true;
        field('outreachObjective').text =
            p['adaptiveOutreach']?['objective']?.toString() ??
            'qualified_conversation';
        field('alternativeSubject').text =
            p['adaptiveOutreach']?['alternative']?['subject']?.toString() ?? '';
        field('alternativeBody').text =
            p['adaptiveOutreach']?['alternative']?['body']?.toString() ?? '';
        dirty = false;
        editBaseVersion = result['policy']?['version'] as int? ?? 0;
        loadedSnapshot = draftSnapshot();
      }
      setState(() => data = result);
      return true;
    } catch (_) {
      if (mounted && ticket == loadSequence) {
        setState(
          () => feedback =
              'Settings could not be loaded. Your edits are retained. Try again.',
        );
      }
      return false;
    }
  }

  String saveError(Object e) {
    if (e is FormatException) {
      return 'Check the numeric limits and sending times. Your edits have not been saved.';
    }
    if (e is FirebaseFunctionsException) {
      if (e.code == 'aborted') {
        conflicted = true;
        return 'The saved settings changed elsewhere. Your edits are retained. Reload the saved version before retrying.';
      }
      final message = e.message ?? '';
      if (message.startsWith('Changes cannot apply: ')) {
        return message
            .replaceFirst('Changes cannot apply: ', '')
            .split(', ')
            .map(blocker)
            .join(' ');
      }
      if (message.contains('Small comparison requires')) {
        return 'Small comparison requires adaptive outreach. Enable adaptive outreach or turn comparison off in section B. Your saved settings are unchanged.';
      }
      if (message.contains('distinct alternative')) {
        return 'Choose Prepare messages for me to fill a baseline and alternative, or add your own distinct alternative in section B. Adaptive execution cannot be saved with an empty alternative. Your saved settings are unchanged.';
      }
      if (message.contains('expanded permissions')) {
        return 'Review and confirm the permission changes before saving.';
      }
    }
    return 'Changes could not be saved. Your previous authorization is unchanged and your edits are retained. Review required fields or retry.';
  }

  Future<void> saveChanges() async {
    if (busy) return;
    if (!previouslyAuthorized) {
      await act('prepare');
      return;
    }
    if (!dirty) {
      setState(() => feedback = 'All changes saved. No update was needed.');
      return;
    }
    setState(() {
      busy = true;
      feedback = 'Checking changes…';
    });
    bool accepted = false;
    try {
      final proposed = policy(),
          base = editBaseVersion ?? data?['policy']?['version'];
      final review = await widget.service.call('manageAssistance', {
        'action': 'reviewUpdate',
        'policy': proposed,
        'expectedVersion': base,
        'requestId': 'review_${DateTime.now().microsecondsSinceEpoch}',
      });
      if (!mounted) return;
      final expansions = review['expansions'] as List? ?? [];
      if (expansions.isNotEmpty) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('Apply these changes?'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final change in expansions) Text('• $change'),
                  const Text(
                    'Existing expiry, recipient rules and spending limits remain unchanged. Pending AI stays pending; this does not enable model processing.',
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('Confirm changes'),
              ),
            ],
          ),
        );
        if (confirmed != true) {
          setState(
            () => feedback =
                'Changes not applied. Your current authorization remains in effect; edits are retained.',
          );
          return;
        }
      }
      submittedSnapshot = draftSnapshot();
      setState(() => feedback = 'Saving changes…');
      final result = await widget.service.call('manageAssistance', {
        'action': 'update',
        'policy': proposed,
        'expectedVersion': base,
        'requestId': 'update_${DateTime.now().microsecondsSinceEpoch}',
        'confirm': true,
        'confirmExpansion': expansions.isNotEmpty,
        'changeDigest': review['changeDigest'],
      });
      accepted = true;
      pendingSavedVersion = result['version'] as int?;
      final confirmed = await load(expectedVersion: result['version'] as int?);
      if (confirmed) pendingSavedVersion = null;
      if (mounted) {
        setState(
          () => feedback = confirmed && !dirty
              ? 'All changes saved. Existing authorization and expiry preserved.'
              : 'The server accepted the save, but the saved version could not be reconciled. Your edits are retained; reload before another update.',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(
          () => feedback = accepted
              ? 'Save may have completed. Your edits are retained; reload the saved version before retrying.'
              : saveError(e),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
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

  Future<void> prepareMessages() async {
    final proposed = data?['proposal']?['values'] as Map?;
    final baseline = proposed?['templates']?['introduction'] as Map?;
    final alternative = proposed?['adaptiveAlternative'] as Map?;
    if (baseline == null || alternative == null) {
      setState(
        () => feedback =
            'Message preparation needs maintained Business services and context. Existing copy is preserved.',
      );
      return;
    }
    final replaceBaseline = messageOrigin == 'prepared';
    if (field('alternativeBody').text.trim().isNotEmpty ||
        (replaceBaseline && field('introductionBody').text.trim().isNotEmpty)) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Replace the current draft copy?'),
          content: Text(
            replaceBaseline
                ? 'Prepare a new baseline and alternative for your review. This replaces the text in this form only; saved sending authority stays unchanged until Save changes.'
                : 'Keep your exact baseline and replace only the draft alternative.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Keep my copy'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Prepare replacement'),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }
    setState(() {
      if (replaceBaseline) {
        field('introductionSubject').text = baseline['subject'];
        field('introductionBody').text = baseline['body'];
      }
      field('alternativeSubject').text = alternative['subject'];
      field('alternativeBody').text = alternative['body'];
      dirty = true;
      feedback =
          'Baseline and alternative ready for review. Save changes applies your chosen fixed or adaptive mode; nothing has been sent.';
    });
  }

  Map<String, dynamic> policy() => {
    'messageOrigin': messageOrigin,
    'messagePreparation': {
      'enabled': choices['messagePreparation'] == true,
      'contextReviewed': choices['preparationContextReviewed'] == true,
    },
    'adaptiveOutreach': {
      'enabled': choices['adaptiveOutreach'] == true,
      'explorationEnabled': choices['outreachExploration'] == true,
      'objective': field('outreachObjective').text,
      'alternative': {
        'subject': field('alternativeSubject').text.trim(),
        'body': field('alternativeBody').text.trim(),
      },
    },
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
  Future<void> reviewAuthorization({bool viewOnly = false}) async {
    if (!viewOnly && (dirty || data?['policy'] == null)) {
      setState(
        () => feedback =
            'Save the current preferences before authorizing their exact version.',
      );
      return;
    }
    final reviewedVersion = data?['policy']?['version'];
    if (!await load(preserve: viewOnly)) return;
    if (!mounted) return;
    if (!viewOnly && data?['policy']?['version'] != reviewedVersion) {
      setState(
        () => feedback =
            'Preferences changed. Review the newly loaded saved settings before authorizing.',
      );
      return;
    }
    final readiness = data?['authorizationReview'] as Map? ?? {};
    final blocked = data?['blockers'] as List? ?? [];
    final selected = data?['policy']?['policy'] as Map? ?? {};
    final decision = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(
          viewOnly ? 'Saved permissions' : 'Review & authorize assistance',
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${data?['workspaceName']} · ${data?['sender']} · saved version ${data?['policy']?['version']}',
              ),
              Text(
                'Coverage: ${selected['mailboxMode'] ?? 'Existing saved scope'}. New inquiries: ${selected['newInquiriesEnabled'] == true ? 'ON, future messages from authorization only' : 'OFF — no new-inquiry intake, even if Whole Inbox is selected'}. No historical import.',
              ),
              Text(
                'Introductions: ${selected['introductionsEnabled'] == true ? 'ON' : 'OFF'} · Follow-ups: ${selected['followupsEnabled'] == true ? 'ON' : 'OFF'}. Existing recipient, suppression, limits and exact-reply approval checks apply.',
              ),
              Text(
                'Owner email alerts: ${selected['notifications']?['email'] == true ? 'ON' : 'OFF'} · Push: ${data?['pushReady'] == true ? 'Device registered' : 'No ready device — email alerts remain independent'}.',
              ),
              Text(
                'Schedule assistance: ${selected['bookingEnabled'] == true ? 'ON' : 'OFF'} · availability version ${selected['availabilityRevision'] ?? 'not selected'}.',
              ),
              Text(
                'AI suggestions: ${selected['modelAssistance'] == true ? 'Selected' : 'OFF'}. ${blocked.isEmpty ? 'Selected capabilities pass current readiness checks.' : 'Not all selected capabilities are ready.'}',
              ),
              Text(
                'Outreach mode: ${selected['adaptiveOutreach']?['enabled'] == true ? 'Adaptive — reviewed baseline and alternative; objective: ${selected['adaptiveOutreach']?['objective']}' : 'Fixed message'}. Introductions remain OFF when not selected.',
              ),
              Text(
                'Small comparison: ${selected['adaptiveOutreach']?['explorationEnabled'] == true ? 'Authorized 80% baseline / 20% alternative allocation while learning holds; no additional contacts.' : 'OFF — insufficient evidence retains baseline.'}',
              ),
              for (final b in blocked)
                Text(
                  (data?['blockerMessages'] as Map?)?[b]?.toString() ??
                      blocker('$b'),
                ),
              if (readiness['partialAvailable'] == true)
                const Text(
                  'Authorize available features is a partial operation: AI stays selected but pending. It will NOT activate automatically when its requirements clear. A later explicit authorization is required. The inference clock does not start.',
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Back to saved settings'),
          ),
          if (!viewOnly && blocked.isEmpty)
            FilledButton(
              onPressed: () => Navigator.pop(c, 'full'),
              child: const Text('Confirm authorization'),
            ),
          if (!viewOnly && readiness['partialAvailable'] == true)
            FilledButton(
              onPressed: () => Navigator.pop(c, 'partial'),
              child: const Text('Authorize available features'),
            ),
        ],
      ),
    );
    if (decision != null) {
      await act(
        'activate',
        availableOnly: decision == 'partial',
        reviewed: true,
      );
    }
  }

  Future<void> act(
    String action, {
    bool availableOnly = false,
    bool reviewed = false,
  }) async {
    if (busy) return;
    if (action != 'prepare' && !reviewed) {
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
      feedback = action == 'prepare' ? 'Saving draft…' : 'Applying $action…';
    });
    try {
      submittedSnapshot = draftSnapshot();
      final r = await widget.service.call('manageAssistance', {
        'action': action,
        if (availableOnly) 'availableOnly': true,
        'expectedVersion': editBaseVersion ?? data?['policy']?['version'] ?? 0,
        'requestId': 'email_settings_${DateTime.now().microsecondsSinceEpoch}',
        if (action == 'prepare') 'policy': policy(),
        'confirm': action != 'prepare',
      });
      final keepDraft = dirty && action != 'prepare';
      pendingSavedVersion = r['version'] as int?;
      final reconciled = await load(
        expectedVersion: pendingSavedVersion,
        preserve: keepDraft,
      );
      if (reconciled) {
        pendingSavedVersion = null;
        if (keepDraft) editBaseVersion = r['version'] as int?;
      }
      if (mounted) {
        setState(
          () => feedback = !reconciled
              ? 'The server accepted the change, but readback is pending. Edits are retained; reload before retrying.'
              : r['status'] == 'prepared'
              ? 'Preferences saved — assistance is not active.'
              : 'Saved state: ${r['status']}',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => feedback = saveError(e));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget input(String k, String title, {int lines = 1}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: TextField(
      enabled: !busy,
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
  String get requestedAi => choices['modelAssistance'] != true
      ? 'Off'
      : data?['capabilities']?['modelSuggestions']?['ready'] != true
      ? 'Requested — pending model-data / applicable Google review and later authorization'
      : 'Requested — separate authorization and allowance required';
  String capabilityState(String key) {
    final saved = data?['policy'] as Map?;
    if (saved?['policy']?[key] != true) return 'Off — not authorized';
    if (saved?['status'] != 'active') {
      return 'Requested — authorization pending';
    }
    final expiry = saved?['policy']?['expiresAt'] as num?;
    if (expiry == null || expiry <= DateTime.now().millisecondsSinceEpoch) {
      return 'Not operating — authorization expired';
    }
    return 'Authorized — execution remains subject to current eligibility';
  }

  String get dispatchEvidence => switch (data?['dispatchStatus']?['state']) {
    'eligibility_held' =>
      'Checked; recipient or sending prerequisites are not satisfied',
    'no_eligible_recipient' => 'Checked; no eligible recipient',
    'sent' => 'A provider accepted a message; delivery is not implied',
    'needs_review' => 'An execution exception needs review',
    'needs_reconciliation' =>
      'Provider outcome needs confirmation; no automatic retry',
    null => 'No recorded visit',
    _ => 'A visit is recorded; no confirmed send shown here',
  };

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
        'Owner email alerts: ${on('email')} → ${data?['ownerEmail'] ?? 'Verified owner account'}\nPush alerts: ${on('push')} · ${data?['pushReady'] == true ? 'Registered device' : 'No ready registered device'}\nAI suggestions: $requestedAi — exact-message approval required\nModel consent: ${on('modelDataConsent')}',
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
      if (dirty) Text('Unsaved changes: $unsavedSummary'),
      Semantics(
        liveRegion: true,
        child: Text(
          feedback ??
              (dirty
                  ? 'Current edits have not taken effect. The saved authorization remains in effect.'
                  : 'All changes saved.'),
        ),
      ),
      if (data?['policy'] == null || dirty)
        const Text(
          'Save changes to apply your edits. Any expanded permissions will be summarized before confirmation.',
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
      if (pendingSavedVersion != null || conflicted)
        Wrap(
          children: [
            TextButton(
              onPressed: busy ? null : checkSavedResult,
              child: const Text('Check saved result'),
            ),
            if (conflicted)
              TextButton(
                onPressed: busy ? null : useSavedSettings,
                child: const Text('Use saved preferences'),
              ),
          ],
        ),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          FilledButton(
            onPressed: busy ? null : saveChanges,
            child: Text(
              busy
                  ? 'Saving…'
                  : previouslyAuthorized
                  ? 'Save changes'
                  : 'Save draft',
            ),
          ),
          if (!previouslyAuthorized)
            FilledButton(
              onPressed: busy ? null : reviewAuthorization,
              child: const Text('Review & enable assistance'),
            ),
          if (previouslyAuthorized)
            TextButton(
              onPressed: busy
                  ? null
                  : () => reviewAuthorization(viewOnly: true),
              child: const Text('View permissions'),
            ),
          if (previouslyAuthorized &&
              data?['authorizationReview']?['modelPending'] == true &&
              data?['capabilities']?['modelSuggestions']?['ready'] == true &&
              !dirty)
            TextButton(
              onPressed: busy ? null : reviewAuthorization,
              child: const Text('Review AI authorization'),
            ),
          if (data?['policy']?['status'] == 'active')
            TextButton(
              onPressed: busy ? null : () => act('pause'),
              child: const Text('Pause assistance'),
            ),
          if (data?['policy']?['status'] == 'paused' && !dirty)
            TextButton(
              onPressed: busy ? null : () => act('resume'),
              child: const Text('Resume assistance'),
            ),
          if (data?['authorizationReview']?['canRevoke'] == true)
            TextButton(
              onPressed: busy ? null : () => act('revoke'),
              child: const Text('Revoke assistance'),
            ),
        ],
      ),
    ];
  }

  String preparationLimit() {
    final value = data?['messagePreparation']?['limitation']?.toString();
    return const {
          'outbound_purpose_extension_required':
              'Pending approval to use the existing allowance for outbound messages',
          'outbound_allowance_inactive_or_exhausted':
              'Shared allowance has not started, has expired or is exhausted',
          'outbound_provider_data_assessment_required':
              'Pending the outbound Business-data processing assessment',
          'outbound_shared_grant_required':
              'The maintained shared allowance is not bound to this workspace',
        }[value] ??
        value ??
        'Pending purpose, data and cost readiness';
  }

  String blocker(String b) =>
      const {
        'business_content_boundaries_required':
            'Review missing Business services, voice or destinations. An empty optional claims list does not authorize invented claims.',
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
                Text('Operating status: $operatingState'),
                Text(
                  'New-inquiry monitoring: ${capabilityState('newInquiriesEnabled')}',
                ),
                Text(
                  'Automatic introductions: ${capabilityState('introductionsEnabled')}',
                ),
                Text(
                  'Automatic follow-ups: ${capabilityState('followupsEnabled')}',
                ),
                Text(
                  'Adaptive outreach: ${data?['policy']?['policy']?['adaptiveOutreach']?['enabled'] == true ? 'Selected; requires authorized introductions and eligible evidence' : 'Off — fixed-message mode'}',
                ),
                Text(
                  'Push: ${data?['pushReady'] == true ? 'Device registered; saved owner choice applies' : 'Unavailable — no ready device'}. Owner email alerts remain independent.',
                ),
                Text(
                  'Latest dispatch evidence: $dispatchEvidence. Authorization alone is not proof of a send.',
                ),
                Text(
                  'AI suggestions: ${data?['authorizationReview']?['modelPending'] == true
                      ? 'Selected — pending separate authorization and model-data requirements'
                      : data?['capabilities']?['modelSuggestions']?['ready'] == true
                      ? 'Available only with explicit consent and remaining allowance'
                      : 'Gated; owner-written replies and eligible non-model capabilities remain separate'}',
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
                      DropdownButtonFormField<String>(
                        key: ValueKey('message-origin-$messageOrigin'),
                        initialValue: messageOrigin,
                        decoration: const InputDecoration(
                          labelText: 'Who prepares the messages?',
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'owner',
                            child: Text('Use my own message'),
                          ),
                          DropdownMenuItem(
                            value: 'prepared',
                            child: Text('Let ScaledCircle prepare my messages'),
                          ),
                        ],
                        onChanged: busy
                            ? null
                            : (v) {
                                if (v != null) {
                                  setState(() {
                                    messageOrigin = v;
                                    dirty = true;
                                  });
                                }
                              },
                      ),
                      Text(
                        'Saved execution: ${data?['policy']?['policy']?['adaptiveOutreach']?['enabled'] == true ? 'Adaptive selection authorized subject to eligibility' : 'Fixed message'}. ${dirty ? 'The selections below are an unsaved draft.' : 'These are the saved settings.'}',
                      ),
                      if (data?['policy']?['policy']?['adaptiveOutreach']?['enabled'] !=
                              true &&
                          data?['policy']?['policy']?['adaptiveOutreach']?['explorationEnabled'] ==
                              true)
                        const Text(
                          'Saved comparison is selected while adaptive outreach is OFF. No comparison operates. Enable adaptive with a valid alternative, or turn comparison off, then Save changes.',
                        ),
                      if (data?['proposal']?['values']?['templates'] != null)
                        OutlinedButton(
                          onPressed: busy ? null : prepareMessages,
                          child: Text(
                            messageOrigin == 'prepared'
                                ? 'Prepare messages for my review'
                                : 'Suggest an alternative to my message',
                          ),
                        ),
                      const Text(
                        'Initial proposals use maintained Business context without a model call. You can edit the preview. New model-written approaches require separate outbound-purpose/data readiness and an active shared allowance; reply AI is separate.',
                      ),
                      toggle(
                        'messagePreparation',
                        'Prepare new approaches when evidence supports it',
                        'Separate from adaptive selection. Preserves the baseline; bounded preparation requires reviewed Business context and its own purpose authorization. It cannot increase contacts, caps or spending.',
                      ),
                      if (choices['messagePreparation'] == true)
                        toggle(
                          'preparationContextReviewed',
                          'I reviewed the Business context for outbound preparation',
                          'Use only the reviewed Business profile, services, facts, voice, objective and destinations. Do not include Gmail-derived content or private prospect information. This does not authorize Gmail reply processing.',
                        ),
                      Text(
                        'What we are trying: ${field('outreachObjective').text.replaceAll('_', ' ')} with separately eligible recipients.',
                      ),
                      Text(
                        'What the evidence supports: ${data?['learningDecision']?['decision'] ?? 'HOLD'} — ${data?['learningDecision']?['reason'] ?? 'Insufficient comparable mature evidence'}. Controlled tests do not establish a winner.',
                      ),
                      Text(
                        'What changed: ${data?['messagePreparation']?['latest']?['state'] ?? 'No new model-written approach prepared'}. What happens next: retain usable approved content; prepare at most one new candidate per strategy when both approaches have sufficient mature evidence of poor qualified outcomes and preparation authority is ready.',
                      ),
                      Text(
                        'Model preparation: ${data?['messagePreparation']?['modelReady'] == true ? 'Ready, subject to saved owner authority and remaining allowance' : preparationLimit()}. Exact owner approval is still required for substantive replies.',
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
                        'Only authorized messages and separately consenting/requesting recipients. Save changes uses the existing authorization term and confirms any expanded authority.',
                      ),
                      toggle(
                        'adaptiveOutreach',
                        'Automatically improve outreach using my Business’s results',
                        'OFF keeps fixed-message mode. ON compares the reviewed baseline and alternative within the same eligible audience. No additional recipients, contact limits, paid model calls or reply authority.',
                      ),
                      if (choices['adaptiveOutreach'] == true) ...[
                        toggle(
                          'outreachExploration',
                          'Allow a small comparison',
                          'Keep the baseline for about 80% of new eligible recipients and use this reviewed alternative for about 20%. No extra recipients or messages. OFF keeps the baseline while evidence is insufficient.',
                        ),
                        DropdownButtonFormField<String>(
                          initialValue: field('outreachObjective').text,
                          decoration: const InputDecoration(
                            labelText: 'Outreach objective',
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'qualified_conversation',
                              child: Text('Qualified conversation'),
                            ),
                            DropdownMenuItem(
                              value: 'appointment',
                              child: Text('Appointment'),
                            ),
                            DropdownMenuItem(
                              value: 'estimate',
                              child: Text('Estimate'),
                            ),
                            DropdownMenuItem(
                              value: 'business_signup',
                              child: Text('Business signup'),
                            ),
                            DropdownMenuItem(
                              value: 'scaler_activation',
                              child: Text('Scaler activation'),
                            ),
                          ],
                          onChanged: (v) {
                            if (v != null) setField('outreachObjective', v);
                          },
                        ),
                      ],
                      if (choices['adaptiveOutreach'] == true ||
                          messageOrigin == 'prepared' ||
                          field('alternativeBody').text.isNotEmpty) ...[
                        input(
                          'alternativeSubject',
                          'Alternative subject — owner review',
                        ),
                        input(
                          'alternativeBody',
                          'Alternative introduction / next step — owner review',
                          lines: 4,
                        ),
                        const Text(
                          'Reviewed approaches and separately authorized bounded preparation are eligible. Each prospect receives one stable approach. The system holds allocation when evidence is insufficient; after comparable mature results it may prefer an approach while retaining baseline and exploration. It cannot invent facts or expand sending authority.',
                        ),
                      ],
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
                    'Email ${on('email')} · Push ${on('push')} · AI $requestedAi',
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
                    previouslyAuthorized
                        ? 'Save updates without restarting authorization'
                        : 'Prepared preferences are separate from active assistance',
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
