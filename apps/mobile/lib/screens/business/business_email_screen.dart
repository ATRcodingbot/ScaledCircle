import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/business_email_service.dart';
import '../../navigation/context_back_button.dart';
import '../../widgets/customer_page_body.dart';
import '../../widgets/business_email_providers.dart';
import 'business_email_campaign_screen.dart';

class BusinessEmailScreen extends StatefulWidget {
  const BusinessEmailScreen({
    super.key,
    this.loadOverride,
    this.service,
    this.initialOperationId,
    this.initialCampaignId,
  });
  final Future<Map<String, dynamic>?> Function()? loadOverride;
  final BusinessEmailService? service;
  final String? initialOperationId, initialCampaignId;
  @override
  State<BusinessEmailScreen> createState() => _BusinessEmailScreenState();
}

class _BusinessEmailScreenState extends State<BusinessEmailScreen> {
  late final _service = widget.service ?? BusinessEmailService();
  Map<String, dynamic>? _data;
  String? _error;
  final _conversationFeedback = <String, String>{};
  String? _checkingConversation;
  bool _loading = true, _busy = false, _read = false, _send = false;
  Timer? _timer;
  bool _notificationOpened = false;
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
      if (!_notificationOpened &&
          (widget.initialOperationId != null ||
              widget.initialCampaignId != null)) {
        _notificationOpened = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          final op = (data?['operations'] as List? ?? [])
              .whereType<Map>()
              .where((o) => o['id'] == widget.initialOperationId)
              .firstOrNull;
          if (op != null) {
            _viewConversation(op);
          } else if (widget.initialCampaignId != null) {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BusinessEmailCampaignScreen(
                  initialCampaignId: widget.initialCampaignId,
                ),
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('This conversation is no longer available.'),
              ),
            );
          }
        });
      }
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
      if (op == 'reconcile') {
        _checkingConversation = input['operationId'] as String;
      }
    });
    try {
      final response = await _service.call(op, input);
      if (response['url'] is String) {
        final url = Uri.parse(response['url']);
        if (url.scheme != 'https' ||
            ![
              'accounts.google.com',
              'login.microsoftonline.com',
            ].contains(url.host)) {
          throw StateError('Invalid connection destination');
        }
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
      await _load();
      if (mounted && op == 'checkConnection') {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Connection checked.')));
      }
      if (mounted && op == 'reconcile') {
        final message = _error != null
            ? 'Conversation checked, but the page could not refresh. Try again.'
            : response['state'] != 'sent'
            ? 'The send is still being verified. No message was resent.'
            : response['replies'] == null
            ? 'Sent message found. Check conversation again for replies.'
            : (response['replies'] as num) > 0
            ? 'Reply received'
            : 'No reply found yet';
        _showConversationFeedback(input['operationId'] as String, message);
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        if (op == 'reconcile') {
          _showConversationFeedback(
            input['operationId'] as String,
            e.code == 'permission-denied'
                ? 'Check your Read leads permission and reconnect Business Email, then try again. No message was resent.'
                : 'Conversation could not be checked. Try again. No message was resent.',
          );
        } else {
          setState(() => _error = e.message ?? 'This action needs checking.');
        }
      }
    } catch (_) {
      if (mounted) {
        if (op == 'reconcile') {
          _showConversationFeedback(
            input['operationId'] as String,
            'Conversation could not be checked. Try again. No message was resent.',
          );
        } else {
          setState(
            () => _error =
                'The result needs checking. No message was automatically retried.',
          );
        }
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _checkingConversation = null;
        });
      }
    }
  }

  void _showConversationFeedback(String operationId, String message) {
    setState(() => _conversationFeedback[operationId] = message);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _viewConversation(Map op) async {
    final replies =
        (_data!['replies'] as List? ?? [])
            .whereType<Map>()
            .where((r) => r['operationId'] == op['id'])
            .toList()
          ..sort(
            (a, b) => ((a['receivedAt'] as num?) ?? 0).compareTo(
              (b['receivedAt'] as num?) ?? 0,
            ),
          );
    String time(dynamic value) {
      if (value is! num) return 'Time unavailable';
      final date = DateTime.fromMillisecondsSinceEpoch(value.toInt());
      final labels = MaterialLocalizations.of(context);
      return '${labels.formatMediumDate(date)} · ${labels.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
    }

    await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Conversation'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  op['subject']?.toString() ?? 'Email conversation',
                  style: Theme.of(dialog).textTheme.titleMedium,
                ),
                if (op['certification'] == true)
                  const Text(
                    'Software certification — excluded from Growth results.',
                  ),
                const SizedBox(height: 16),
                Text('From: ${op['from']}'),
                Text('To: ${op['recipient']}'),
                Text('Sent ${time(op['providerAcceptedAt'])}'),
                const SizedBox(height: 8),
                SelectableText(
                  op['body']?.toString() ?? 'Message text unavailable.',
                ),
                for (final reply in replies) ...[
                  const Divider(height: 32),
                  const Text('Reply received'),
                  Text('From: ${reply['from'] ?? op['recipient']}'),
                  Text(time(reply['receivedAt'])),
                  const SizedBox(height: 8),
                  SelectableText(
                    reply['body']?.toString().trim().isNotEmpty == true
                        ? reply['body'].toString()
                        : 'No plain-text body available.',
                  ),
                ],
                if (replies.isEmpty) ...[
                  const Divider(height: 32),
                  const Text(
                    'No reply recorded yet. Use Check conversation to look for a reply.',
                  ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog),
            child: const Text('Close'),
          ),
        ],
      ),
    );
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
      appBar: AuthenticatedAppBar(
        leading: const ContextBackButton(fallback: '/business/growth'),
        title: const Text('Business Email'),
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
                      'Business Email requires an eligible membership and permission to read communications. Ask your workspace owner to review your access.',
                    )
                  else ...[
                    Text(
                      c['status'] == 'connected'
                          ? 'Connected: ${c['email']}'
                          : 'Connect Business Email',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    if (_data!['includedWithManagedGrowth'] == true)
                      const Text(
                        'Business Email — Included with Managed Growth',
                      ),
                    if (_data!['readOnly'] == true)
                      const Text(
                        'Your membership has ended. Saved history remains available; reactivate to use paid Email features.',
                      ),
                    if (_data!['connectionAllowed'] == false &&
                        _data!['readOnly'] != true)
                      const Text(
                        'Not connected · Connection temporarily limited. Google verification is pending. Your included Email workspace is available; no email will be sent.',
                      ),
                    if (_data!['expectedMailbox'] != null)
                      Text('Authorized mailbox: ${_data!['expectedMailbox']}'),
                    if (_data!['campaignPrivateBeta'] == true)
                      ListTile(
                        title: const Text('Email Campaigns'),
                        subtitle: const Text(
                          'Review contacts, history and a campaign draft',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) =>
                                BusinessEmailCampaignScreen(service: _service),
                          ),
                        ),
                      ),
                    if (c['status'] == 'connected') ...[
                      Text(
                        'Provider: ${c['providerLabel'] ?? 'Google / Gmail / Workspace'}',
                      ),
                      Text(businessEmailHealth(c['connectionHealth'])),
                    ],
                    if (_data!['sendEnabled'] == true && c['send'] == true)
                      const Text(
                        'Send reviewed messages from your Business mailbox. Each message needs your approval; automatic sending is off.',
                      ),
                    if (c['status'] != 'connected')
                      const Text(
                        'No mailbox connected. Choose the permissions to request, then connect Google.',
                      ),
                    if (c['status'] == 'connected' &&
                        _data!['sendEnabled'] == false)
                      Text(
                        _data!['certificationSendEnabled'] == true
                            ? 'One reviewed test email to ${_data!['certificationRecipient']} is enabled. Customer and prospect sending is blocked.'
                            : 'Your mailbox is connected for review. Message sending needs workspace approval; automatic sending is off.',
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
                        'Finish connecting with your email provider. This attempt expires after 10 minutes.',
                      ),
                    if (c['error'] != null)
                      const Text(
                        'Your email connection needs attention. Try connecting again.',
                      ),
                    SwitchListTile(
                      title: const Text('Read leads'),
                      subtitle: const Text(
                        'Review lead conversations and replies in your Business mailbox.',
                      ),
                      value: _read,
                      onChanged: _busy
                          ? null
                          : (v) => setState(() => _read = v),
                    ),
                    SwitchListTile(
                      title: const Text('Send approved email'),
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
                    BusinessEmailProviders(
                      providers:
                          (_data!['providers'] as List? ??
                                  [
                                    {
                                      'id': 'google',
                                      'label': 'Google / Gmail / Workspace',
                                      'configured': _data!['configured'],
                                      'status': 'private_beta',
                                    },
                                  ])
                              .whereType<Map>()
                              .toList(),
                      connection: c,
                      busy: _busy,
                      read: _read,
                      send: _send,
                      onConnect: (operation, input) => _action(
                        operation,
                        operation == 'connect'
                            ? businessEmailConnectionInput(
                                input,
                                providerSelectionSupported:
                                    _data!['providers'] is List,
                              )
                            : input,
                      ),
                    ),
                    Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: _busy
                              ? null
                              : c['status'] == 'connected'
                              ? () => _action('checkConnection')
                              : _load,
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
                                  op['campaignId'] == null &&
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
                              if (c['read'] == true)
                                OutlinedButton.icon(
                                  onPressed: () => _viewConversation(op),
                                  icon: const Icon(Icons.forum_outlined),
                                  label: const Text('View Conversation'),
                                ),
                              if (op['state'] == 'sent' &&
                                  op['certification'] != true) ...[
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
                                child: Text(
                                  _checkingConversation == op['id']
                                      ? 'Checking conversation…'
                                      : 'Check conversation',
                                ),
                              ),
                              if (_conversationFeedback[op['id']] != null)
                                Semantics(
                                  liveRegion: true,
                                  child: Text(_conversationFeedback[op['id']]!),
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
    this.onChanged,
  });
  final Map<String, dynamic> mailbox;
  final Map? prospect;
  final bool certification;
  final String? recipient;
  final BusinessEmailService? service;
  final Future<void> Function()? onChanged;
  @override
  Widget build(BuildContext context) {
    final sent =
        (mailbox['operations'] as List? ?? [])
            .whereType<Map>()
            .where(
              (o) =>
                  o['state'] == 'sent' &&
                  o['certification'] != true &&
                  (o['prospectId'] == prospect?['id'] ||
                      (prospect?['email'] != null &&
                          '${o['recipient']}'.trim().toLowerCase() ==
                              '${prospect?['email']}'.trim().toLowerCase())),
            )
            .toList()
          ..sort(
            (a, b) =>
                ((b['providerAcceptedAt'] ?? b['requestedAt'] ?? 0) as num)
                    .compareTo(
                      (a['providerAcceptedAt'] ?? a['requestedAt'] ?? 0) as num,
                    ),
          );
    if (!certification && prospect?['followupTo'] == null && sent.isNotEmpty) {
      final op = sent.first;
      final replied = sent.any((o) => (o['replyCount'] ?? 0) > 0);
      final at = DateTime.fromMillisecondsSinceEpoch(
        (op['providerAcceptedAt'] ?? op['requestedAt']) as int,
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            replied
                ? 'Replied — Review conversation'
                : 'Contacted — Awaiting reply',
          ),
          Text(
            'Last contact: Email · ${MaterialLocalizations.of(context).formatMediumDate(at)} ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(at))}',
          ),
          Text(
            replied
                ? 'Next: Review reply'
                : 'Next: Wait for reply. Follow-ups require review after the five-day cooldown.',
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.forum_outlined),
            label: const Text('View Conversation'),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BusinessEmailScreen(
                  initialOperationId: op['id'] as String,
                  service: service,
                ),
              ),
            ),
          ),
        ],
      );
    }
    return OutlinedButton.icon(
      icon: const Icon(Icons.edit_outlined),
      onPressed:
          mailbox['connection']?['send'] != true ||
              !certification && mailbox['sendEnabled'] == false
          ? null
          : () async {
              await showDialog(
                context: context,
                builder: (_) => _DraftDialog(
                  mailbox: mailbox,
                  prospect: prospect,
                  certification: certification,
                  recipient: recipient,
                  service: service,
                  followupTo: prospect?['followupTo']?.toString(),
                ),
              );
              await onChanged?.call();
            },
      label: Text(
        certification
            ? 'Review Controlled Test Message'
            : prospect?['followupTo'] != null
            ? 'Prepare Follow-up'
            : 'Edit Draft / Approve & Send Email',
      ),
    );
  }
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
  bool _uncertain = false;
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
    if (_busy || _uncertain) return;
    setState(() => _busy = true);
    try {
      if (_saved == null) {
        final draft = await _service
            .call('saveDraft', {
              'prospectId': widget.prospect?['id'],
              'certification': widget.certification,
              'subject': _subject.text,
              'body': _body.text,
              'expectedVersion': _version,
              if (widget.followupTo != null) 'followupTo': widget.followupTo,
              if (_messageAngle != null) 'messageAngle': _messageAngle,
              if (_cta != null) 'cta': _cta,
            })
            .timeout(const Duration(seconds: 30));
        if (mounted) {
          setState(() {
            _saved = draft;
            _version = (draft['version'] as num).toInt();
          });
        }
      } else {
        final result = await _service
            .call('send', {
              'prospectId': _saved!['prospectId'],
              'operationId': _saved!['operationId'],
              'version': _saved!['version'],
              'confirm': true,
            })
            .timeout(const Duration(seconds: 30));
        if (mounted) {
          setState(() => _result = businessEmailState(result['state']));
        }
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() {
          _uncertain = true;
          _error = _saved == null
              ? 'Eligibility is still being confirmed. You can close this window. Reopen the saved draft before trying again; no send was requested.'
              : 'The send result is being confirmed. Close this window and check Outreach history; do not resend.';
        });
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
              readOnly: _saved != null || _busy || _uncertain,
              decoration: const InputDecoration(labelText: 'Subject'),
            ),
            TextField(
              controller: _body,
              maxLength: 8000,
              minLines: 5,
              maxLines: 12,
              readOnly: _saved != null || _busy || _uncertain,
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
        onPressed: () => Navigator.pop(context),
        child: const Text('Close'),
      ),
      if (_saved != null && _result == null && !_uncertain)
        TextButton(
          onPressed: _busy ? null : () => setState(() => _saved = null),
          child: const Text('Edit Draft'),
        ),
      if (_result == null && !_uncertain)
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
