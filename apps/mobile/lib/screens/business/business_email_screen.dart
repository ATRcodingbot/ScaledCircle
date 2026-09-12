import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/business_email_service.dart';
import '../../navigation/context_back_button.dart';
import '../../widgets/customer_page_body.dart';

class BusinessEmailScreen extends StatefulWidget {
  const BusinessEmailScreen({super.key, this.loadOverride});
  final Future<Map<String, dynamic>?> Function()? loadOverride;
  @override
  State<BusinessEmailScreen> createState() => _BusinessEmailScreenState();
}

class _BusinessEmailScreenState extends State<BusinessEmailScreen> {
  final _service = BusinessEmailService();
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = true, _busy = false, _read = false, _send = false;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data =
          await (widget.loadOverride?.call() ?? _service.availability());
      if (!mounted) return;
      setState(() {
        _data = data;
        _error = null;
        _loading = false;
        _read = data?['connection']?['read'] == true;
        _send = data?['connection']?['send'] == true;
      });
      _timer?.cancel();
      if (data?['connection']?['pending'] == true) {
        _timer = Timer(const Duration(seconds: 5), _load);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Connection status could not be checked. Try again.';
        });
      }
    }
  }

  Future<void> _action(
    String op, [
    Map<String, dynamic> input = const {},
  ]) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await _service.call(op, input);
      if (response['url'] is String) {
        final url = Uri.parse(response['url']);
        if (url.scheme != 'https' || url.host != 'accounts.google.com') {
          throw StateError('Invalid connection destination');
        }
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
      await _load();
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(() => _error = e.message ?? 'This action needs checking.');
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The result needs checking. No message was automatically retried.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _contactAction(Map op, String action) async {
    if (action != 'restore') {
      await _action('suppress', {
        'prospectId': op['prospectId'],
        'reason': action,
      });
      return;
    }
    var reason = '';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Restore this contact?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Explain why this contact can be considered again. Unsubscribed or bounced addresses require separate verified evidence. Nothing will be sent.',
            ),
            TextField(
              maxLength: 500,
              onChanged: (value) => reason = value,
              decoration: const InputDecoration(labelText: 'Reason'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Keep restricted'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Restore contact'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await _action('restoreContact', {
        'prospectId': op['prospectId'],
        'confirm': true,
        'reason': reason,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _data?['connection'] as Map? ?? {},
        learning = _data?['learning'] as Map? ?? {};
    return Scaffold(
      appBar: AppBar(
        leading: const ContextBackButton(fallback: '/business/growth'),
        title: const Text('Business Email · Private Beta'),
      ),
      body: CustomerPageBody(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null) Text(_error!),
                  if (_data == null)
                    const Text(
                      'Business Email is available by private invitation.',
                    )
                  else ...[
                    Text(
                      c['status'] == 'connected'
                          ? 'Connected: ${c['email']}'
                          : 'Connect Business Email',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    Text('Invited mailbox: ${_data!['expectedMailbox']}'),
                    if (_data!['sendEnabled'] == false)
                      Text(
                        _data!['certificationSendEnabled'] == true
                            ? 'Server send hold: On · Certification only. Only one reviewed test email to ${_data!['certificationRecipient']} is enabled. Customer and prospect sending is blocked.'
                            : 'Server send hold: On. No customer or prospect email can be sent. Controlled messages can be reviewed without sending.',
                      ),
                    const Text(
                      'Receive lead replies and send messages you explicitly approve. Automatic sending is off.',
                    ),
                    if (_data!['configured'] != true)
                      const Text(
                        'Private beta setup is pending. Your existing account and billing emails continue normally.',
                      ),
                    if (c['pending'] == true)
                      const Text(
                        'Finish connecting with Google. This attempt expires after 10 minutes.',
                      ),
                    if (c['error'] != null) Text(c['error'].toString()),
                    SwitchListTile(
                      title: const Text('Read leads'),
                      subtitle: const Text(
                        'Review replies to your approved outreach.',
                      ),
                      value: _read,
                      onChanged: _busy
                          ? null
                          : (v) => setState(() => _read = v),
                    ),
                    SwitchListTile(
                      title: const Text('Send approved outreach'),
                      subtitle: const Text(
                        'Send only after you review and confirm the exact message.',
                      ),
                      value: _send,
                      onChanged: _busy
                          ? null
                          : (v) => setState(() => _send = v),
                    ),
                    const ListTile(
                      title: Text('Automatic sending'),
                      trailing: Text('Off'),
                    ),
                    Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        FilledButton(
                          onPressed:
                              _busy ||
                                  _data!['configured'] != true ||
                                  !_read && !_send
                              ? null
                              : () => _action('connect', {
                                  'read': _read,
                                  'send': _send,
                                }),
                          child: Text(
                            c['status'] == 'connected'
                                ? 'Update permissions'
                                : 'Continue with Google',
                          ),
                        ),
                        OutlinedButton(
                          onPressed: _busy ? null : _load,
                          child: const Text('Check connection'),
                        ),
                        if (c['status'] == 'connected')
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () => _action('disconnect'),
                            child: const Text('Disconnect'),
                          ),
                      ],
                    ),
                    if (c['status'] == 'connected') ...[
                      const SizedBox(height: 24),
                      const Text('Landing-page lead responses'),
                      DropdownButtonFormField<String>(
                        initialValue:
                            c['landingSender']?.toString() ??
                            'account_notifications',
                        isExpanded: true,
                        items: const [
                          DropdownMenuItem(
                            value: 'account_notifications',
                            child: Text(
                              'ScaledCircle account notifications only',
                            ),
                          ),
                          DropdownMenuItem(
                            value: 'connected_business_email',
                            child: Text('My connected Business email'),
                          ),
                        ],
                        onChanged: _busy
                            ? null
                            : (v) =>
                                  _action('preferences', {'landingSender': v}),
                      ),
                      const Text(
                        'CRM leads and account notifications continue. Business email responses require your review; this choice does not enable automatic sending.',
                      ),
                      if (c['landingSender'] == 'connected_business_email')
                        for (final lead
                            in (_data!['landingLeads'] as List? ?? [])
                                .whereType<Map>())
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text(
                                    'Inquiry from ${lead['displayName'] ?? 'Customer'}',
                                  ),
                                  BusinessEmailDraftButton(
                                    mailbox: _data!,
                                    prospect: lead,
                                  ),
                                ],
                              ),
                            ),
                          ),
                    ],
                    const SizedBox(height: 24),
                    Text(
                      'Outreach history',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    for (final op
                        in (_data!['operations'] as List? ?? [])
                            .whereType<Map>())
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(op['subject'].toString()),
                              Text('To: ${op['recipient']}'),
                              Text(businessEmailState(op['state'])),
                              Text('Replies: ${op['replyCount'] ?? 0}'),
                              for (final outcome
                                  in (_data!['outcomes'] as List? ?? [])
                                      .whereType<Map>()
                                      .where(
                                        (o) => o['operationId'] == op['id'],
                                      ))
                                Text(
                                  'Recorded outcome: ${businessEmailOutcome(outcome['outcome'])}',
                                ),
                              if (op['certification'] == true)
                                const Text(
                                  'Software certification — excluded from Growth results.',
                                ),
                              if (op['state'] == 'sent' &&
                                  op['certification'] != true &&
                                  c['send'] == true &&
                                  ((op['replyCount'] as num? ?? 0) > 0 ||
                                      (_data!['learning']?['followups']
                                                  as List? ??
                                              [])
                                          .whereType<Map>()
                                          .any(
                                            (f) => f['operationId'] == op['id'],
                                          )))
                                BusinessEmailDraftButton(
                                  mailbox: _data!,
                                  prospect: {
                                    'id': op['prospectId'],
                                    'email': op['recipient'],
                                    'displayName': op['recipient'],
                                    'followupTo': op['id'],
                                    'reason':
                                        'Review the recorded conversation before following up.',
                                  },
                                ),
                              for (final reply
                                  in (_data!['replies'] as List? ?? [])
                                      .whereType<Map>()
                                      .where(
                                        (r) => r['operationId'] == op['id'],
                                      ))
                                ExpansionTile(
                                  title: Text(
                                    reply['subject']?.toString() ?? 'Reply',
                                  ),
                                  children: [
                                    SelectableText(
                                      reply['body']?.toString() ??
                                          'No plain-text body available.',
                                    ),
                                  ],
                                ),
                              if (op['state'] == 'sent') ...[
                                const Text(
                                  'Record the actual outcome. These are owner-reported results, not inferred from a reply.',
                                ),
                                DropdownButtonFormField<String>(
                                  isExpanded: true,
                                  decoration: const InputDecoration(
                                    labelText: 'Conversation outcome',
                                  ),
                                  items: const [
                                    DropdownMenuItem(
                                      value: 'interested',
                                      child: Text('Interested'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'not_interested',
                                      child: Text('Not interested'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'follow_up_required',
                                      child: Text('Follow-up needed'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'meeting',
                                      child: Text('Meeting booked'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'appointment',
                                      child: Text('Appointment booked'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'estimate',
                                      child: Text('Estimate provided'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'won',
                                      child: Text('Work won'),
                                    ),
                                  ],
                                  onChanged: _busy
                                      ? null
                                      : (v) => _action('outcome', {
                                          'operationId': op['id'],
                                          'outcome': v,
                                        }),
                                ),
                              ],
                              TextButton(
                                onPressed: _busy || c['read'] != true
                                    ? null
                                    : () => _action('reconcile', {
                                        'operationId': op['id'],
                                      }),
                                child: const Text('Check conversation'),
                              ),
                              if (op['certification'] != true &&
                                  op['prospectId'] is String)
                                PopupMenuButton<String>(
                                  enabled: !_busy,
                                  onSelected: (value) =>
                                      _contactAction(op, value),
                                  itemBuilder: (_) => const [
                                    PopupMenuItem(
                                      value: 'do_not_contact',
                                      child: Text('Do not contact'),
                                    ),
                                    PopupMenuItem(
                                      value: 'unsubscribed',
                                      child: Text('Record an unsubscribe'),
                                    ),
                                    PopupMenuItem(
                                      value: 'bounced',
                                      child: Text('Record a bounced address'),
                                    ),
                                    PopupMenuItem(
                                      value: 'restore',
                                      child: Text('Review contact restriction'),
                                    ),
                                  ],
                                  child: const Padding(
                                    padding: EdgeInsets.all(12),
                                    child: Text('Contact preferences'),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 20),
                    Text(
                      'What we learned',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    Text(
                      learning['learningBasis']?.toString() ??
                          'No verified outcomes yet.',
                    ),
                    Text(
                      'Sent: ${learning['sent'] ?? 0} · Replied: ${learning['replied'] ?? 0}',
                    ),
                    Text((learning['funnel'] as List? ?? []).join(' → ')),
                    for (final p
                        in (learning['patterns'] as List? ?? [])
                            .whereType<Map>())
                      Text(
                        '${p['value']}: ${p['sent']} sent, ${p['replied']} replies, ${p['positive']} positive outcomes. ${p['recommendation']}',
                      ),
                    if ((learning['followups'] as List? ?? []).isNotEmpty)
                      Text(
                        '${(learning['followups'] as List).length} conversations have no recorded reply after five days. Review a follow-up; nothing is sent automatically.',
                      ),
                    if (_data!['certificationRecipient'] != null &&
                        c['send'] == true &&
                        !(_data!['operations'] as List? ?? [])
                            .whereType<Map>()
                            .any((op) => op['certification'] == true))
                      BusinessEmailDraftButton(
                        certification: true,
                        recipient: _data!['certificationRecipient'].toString(),
                        mailbox: _data!,
                      ),
                  ],
                ],
              ),
      ),
    );
  }
}

class BusinessEmailDraftButton extends StatelessWidget {
  const BusinessEmailDraftButton({
    super.key,
    required this.mailbox,
    this.prospect,
    this.certification = false,
    this.recipient,
    this.service,
  });
  final Map<String, dynamic> mailbox;
  final Map? prospect;
  final bool certification;
  final String? recipient;
  final BusinessEmailService? service;
  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    icon: const Icon(Icons.edit_outlined),
    onPressed:
        mailbox['connection']?['send'] != true ||
            !certification && mailbox['sendEnabled'] == false
        ? null
        : () => showDialog(
            context: context,
            builder: (_) => _DraftDialog(
              mailbox: mailbox,
              prospect: prospect,
              certification: certification,
              recipient: recipient,
              service: service,
              followupTo: prospect?['followupTo']?.toString(),
            ),
          ),
    label: Text(
      certification
          ? 'Review Controlled Test Message'
          : 'Edit Draft / Approve & Send Email',
    ),
  );
}

class _DraftDialog extends StatefulWidget {
  const _DraftDialog({
    required this.mailbox,
    this.prospect,
    required this.certification,
    this.recipient,
    this.followupTo,
    this.service,
  });
  final Map<String, dynamic> mailbox;
  final Map? prospect;
  final bool certification;
  final String? recipient;
  final String? followupTo;
  final BusinessEmailService? service;
  @override
  State<_DraftDialog> createState() => _DraftDialogState();
}

class _DraftDialogState extends State<_DraftDialog> {
  late final TextEditingController _subject, _body;
  late final _service = widget.service ?? BusinessEmailService();
  Map<String, dynamic>? _saved;
  int _version = 0;
  String? _messageAngle, _cta;
  bool _busy = false;
  String? _error, _result;
  @override
  void initState() {
    super.initState();
    final key = widget.certification
        ? 'founder_certification'
        : widget.prospect?['id'];
    final old = (widget.mailbox['drafts'] as List? ?? [])
        .whereType<Map>()
        .where((d) => d['prospectId'] == key)
        .firstOrNull;
    _version = (old?['version'] as num?)?.toInt() ?? 0;
    _subject = TextEditingController(
      text:
          old?['subject']?.toString() ??
          (widget.certification
              ? 'ScaledCircle controlled Business Email check'
              : 'A question for ${widget.prospect?['displayName'] ?? 'your team'}'),
    );
    _body = TextEditingController(
      text:
          old?['body']?.toString() ??
          (widget.certification
              ? 'This is the Founder-approved software certification draft. Please reply so we can verify the Business conversation.'
              : widget.prospect?['draft']?.toString() ?? ''),
    );
  }

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _saveOrSend() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      if (_saved == null) {
        final draft = await _service.call('saveDraft', {
          'prospectId': widget.prospect?['id'],
          'certification': widget.certification,
          'subject': _subject.text,
          'body': _body.text,
          'expectedVersion': _version,
          if (widget.followupTo != null) 'followupTo': widget.followupTo,
          if (_messageAngle != null) 'messageAngle': _messageAngle,
          if (_cta != null) 'cta': _cta,
        });
        if (mounted) {
          setState(() {
            _saved = draft;
            _version = (draft['version'] as num).toInt();
          });
        }
      } else {
        final result = await _service.call('send', {
          'prospectId': _saved!['prospectId'],
          'operationId': _saved!['operationId'],
          'version': _saved!['version'],
          'confirm': true,
        });
        if (mounted) {
          setState(() => _result = businessEmailState(result['state']));
        }
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The result needs checking. Do not resend; check Outreach history.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(
      widget.certification
          ? 'Review Controlled Test Message'
          : _saved == null
          ? 'Edit outreach draft'
          : 'Review exact email',
    ),
    content: SizedBox(
      width: 520,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'From: ${_saved?['from'] ?? widget.mailbox['connection']?['email']}',
            ),
            Text(
              'To: ${_saved?['recipient'] ?? widget.recipient ?? widget.prospect?['email']}',
            ),
            Text(
              'Contact source: ${_saved?['source'] ?? widget.prospect?['sourceUrl'] ?? 'Founder-controlled certification recipient'}',
            ),
            Text(
              'Reason: ${_saved?['reason'] ?? widget.prospect?['reason'] ?? 'Software certification only'}',
            ),
            TextField(
              controller: _subject,
              maxLength: 200,
              readOnly: _saved != null,
              decoration: const InputDecoration(labelText: 'Subject'),
            ),
            TextField(
              controller: _body,
              maxLength: 8000,
              minLines: 5,
              maxLines: 12,
              readOnly: _saved != null,
              decoration: const InputDecoration(labelText: 'Message'),
            ),
            if (_saved != null)
              const Text(
                'This sends one email from your connected Business mailbox. It does not authorize later outreach.',
              ),
            if (widget.mailbox['sendEnabled'] == false &&
                !(widget.certification &&
                    widget.mailbox['certificationSendEnabled'] == true))
              const Text(
                'Sending is held. Reviewing this message does not send it.',
              ),
            if (_saved == null) ...[
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(
                  labelText: 'Message purpose (optional)',
                ),
                isExpanded: true,
                items: const [
                  DropdownMenuItem(
                    value: 'introduction',
                    child: Text('Introduction'),
                  ),
                  DropdownMenuItem(
                    value: 'project_inquiry',
                    child: Text('Project inquiry'),
                  ),
                  DropdownMenuItem(
                    value: 'inbound_response',
                    child: Text('Reply to an inquiry'),
                  ),
                  DropdownMenuItem(value: 'followup', child: Text('Follow-up')),
                ],
                onChanged: (v) => setState(() => _messageAngle = v),
              ),
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(
                  labelText: 'Requested next step (optional)',
                ),
                isExpanded: true,
                items: const [
                  DropdownMenuItem(value: 'reply', child: Text('Reply')),
                  DropdownMenuItem(value: 'meeting', child: Text('Meeting')),
                  DropdownMenuItem(value: 'estimate', child: Text('Estimate')),
                  DropdownMenuItem(
                    value: 'website',
                    child: Text('Visit website'),
                  ),
                ],
                onChanged: (v) => setState(() => _cta = v),
              ),
            ],
            if (_error != null) Text(_error!),
            if (_result != null) Text(_result!),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('Close'),
      ),
      if (_saved != null && _result == null)
        TextButton(
          onPressed: _busy ? null : () => setState(() => _saved = null),
          child: const Text('Edit Draft'),
        ),
      if (_result == null)
        FilledButton(
          onPressed:
              _busy ||
                  _saved != null &&
                      widget.mailbox['sendEnabled'] == false &&
                      !(widget.certification &&
                          widget.mailbox['certificationSendEnabled'] == true)
              ? null
              : _saveOrSend,
          child: Text(
            _busy
                ? 'Checking…'
                : _saved == null
                ? 'Review exact email'
                : widget.certification
                ? 'Send Test Email'
                : 'Send Email',
          ),
        ),
    ],
  );
}
