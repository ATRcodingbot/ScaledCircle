import 'package:flutter/material.dart';
import '../../services/business_email_service.dart';
import '../../services/business_operations_service.dart';

class BusinessEmailConversationScreen extends StatefulWidget {
  const BusinessEmailConversationScreen({
    super.key,
    required this.service,
    required this.operationId,
  });
  final BusinessEmailService service;
  final String operationId;
  @override
  State<BusinessEmailConversationScreen> createState() => _ConversationState();
}

class _ConversationState extends State<BusinessEmailConversationScreen> {
  Map<String, dynamic>? data, savedDraft;
  final subject = TextEditingController(), body = TextEditingController();
  bool busy = false;
  String? feedback;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    subject.dispose();
    body.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final value = await widget.service.call('loadConversation', {
        'operationId': widget.operationId,
      });
      if (!mounted) return;
      setState(() => data = value);
    } catch (_) {
      if (mounted) {
        setState(
          () => feedback =
              'The conversation could not be loaded. Your edited text is preserved.',
        );
      }
    }
  }

  Future<void> action(String kind) async {
    if (busy || data == null) return;
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      if (kind == 'check') {
        final value = await widget.service.call('reconcile', {
          'operationId': widget.operationId,
        });
        await load();
        feedback = (value['replies'] as num? ?? 0) > 0
            ? 'Reply received'
            : 'No reply found yet';
      } else if (kind == 'suggest') {
        final value = await widget.service.call('suggestReply', {
          'operationId': widget.operationId,
        });
        if (value['state'] == 'needs_owner_review' &&
            value['inboundDigest'] == data!['inboundDigest']) {
          subject.text = '${value['suggestion']['subject']}';
          body.text = '${value['suggestion']['body']}';
          savedDraft = null;
          feedback = 'Suggested reply — review every statement before sending.';
        } else {
          feedback =
              'A suggestion is not available for this exact conversation. You can still write a reply.';
        }
      } else if (kind == 'save') {
        final op = data!['operation'] as Map;
        savedDraft = await widget.service.call('saveDraft', {
          'customerId': op['crmCustomerId'],
          'assistanceKind': 'reply',
          'followupTo': widget.operationId,
          'subject': subject.text,
          'body': body.text,
          'expectedVersion': data!['draft']?['version'] ?? 0,
          'expectedInboundDigest': data!['inboundDigest'],
          'messageAngle': 'inbound_response',
          'cta': 'reply',
        });
        await load();
        feedback = 'Exact reply saved. Nothing sent.';
      } else if (kind == 'send' && savedDraft != null) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('Approve & Send this exact reply?'),
            content: SingleChildScrollView(
              child: Text(
                'To: ${savedDraft!['recipient']}\nSubject: ${savedDraft!['subject']}\n\n${savedDraft!['body']}',
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('Approve & Send'),
              ),
            ],
          ),
        );
        if (confirmed != true) return;
        final result = await widget.service.call('send', {
          'prospectId': savedDraft!['prospectId'],
          'operationId': savedDraft!['operationId'],
          'version': savedDraft!['version'],
          'confirm': true,
        });
        feedback = businessEmailState(result['state']);
        savedDraft = null;
        await load();
      }
    } catch (_) {
      feedback =
          'The change was not confirmed. Your text is kept. Reload and review the latest conversation before retrying.';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> offer([Map? existing]) async {
    final availability = data?['availability'] as Map?;
    if (availability == null) {
      setState(
        () => feedback =
            'Save your working hours, staff, duration and timezone in Schedule first.',
      );
      return;
    }
    final start = TextEditingController(), location = TextEditingController();
    bool automatic = false;
    final settings = availability['settings'] as Map;
    final approved = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setLocal) => AlertDialog(
          title: const Text('Offer a tentative appointment'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Timezone: ${settings['timeZone']} · ${settings['durationMinutes']} minutes · ${settings['bufferMinutes']} minute buffer\nStaff: ${(settings['assignedPeople'] as List).join(', ')}',
                ),
                TextField(
                  controller: start,
                  decoration: const InputDecoration(
                    labelText: 'Exact date/time including UTC offset',
                    hintText: '2026-09-25T14:00:00-04:00',
                  ),
                ),
                TextField(
                  controller: location,
                  decoration: const InputDecoration(
                    labelText: 'Location / meeting details',
                  ),
                ),
                CheckboxListTile(
                  value: automatic,
                  onChanged: (v) => setLocal(() => automatic = v == true),
                  title: const Text(
                    'Allow this exact slot to confirm on the customer’s explicit acceptance',
                  ),
                  subtitle: const Text(
                    'Requires your saved bounded booking policy. Availability is checked again.',
                  ),
                ),
                const Text(
                  'This saves a tentative offer, not a confirmed appointment. Nothing is emailed until you review and send the offer.',
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
              child: const Text('Save tentative offer'),
            ),
          ],
        ),
      ),
    );
    if (approved == true && mounted) {
      setState(() => busy = true);
      try {
        final raw = start.text.trim();
        if (!RegExp(r'(Z|[+-]\d{2}:\d{2})$').hasMatch(raw)) {
          throw const FormatException('Explicit timezone required');
        }
        final result = await BusinessOperationsService().call(
          data!['businessId'].toString(),
          'saveItem',
          {
            'expectedVersion': existing?['version'] ?? 0,
            if (existing != null) 'itemId': existing['id'],
            'item': {
              'title': existing?['title'] ?? 'Customer appointment offer',
              'type': existing?['type'] ?? 'estimate',
              'customerId': data!['operation']['crmCustomerId'],
              'startMs': DateTime.parse(raw).millisecondsSinceEpoch,
              'durationMinutes': settings['durationMinutes'],
              'timeZone': settings['timeZone'],
              'assignedPeople': settings['assignedPeople'],
              'location': location.text.trim(),
              'status': 'tentative',
            },
            'emailConversation': {
              'operationId': widget.operationId,
              'inboundDigest': data!['inboundDigest'],
              'availabilityVersion': availability['version'],
              'authorizeAcceptedSlot': automatic,
            },
          },
        );
        if (result['acceptanceCode'] != null) {
          subject.text = 'Appointment time for your review';
          body.text =
              'We can offer $raw (${settings['timeZone']}) for ${settings['durationMinutes']} minutes. To accept this exact appointment, reply with only:\nPlease book ${result['acceptanceCode']}';
          savedDraft = null;
        }
        await load();
        feedback =
            'Tentative offer saved in Schedule (${result['itemId']}). Review the offered time and reply text before sending. No confirmation email has been sent.';
      } catch (_) {
        feedback =
            'The tentative offer was not confirmed. Check the explicit time, staff availability and latest conversation. Nothing was sent.';
      } finally {
        if (mounted) setState(() => busy = false);
      }
    }
    start.dispose();
    location.dispose();
  }

  Future<void> confirmAppointment(Map appointment) async {
    final replies =
        (data?['replies'] as List? ?? [])
            .where((r) => r['classification'] == 'substantive')
            .toList()
          ..sort(
            (a, b) =>
                (b['receivedAt'] as num).compareTo(a['receivedAt'] as num),
          );
    if (replies.isEmpty) return;
    final reply = replies.first;
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Confirm the customer accepted this time?'),
        content: SingleChildScrollView(
          child: Text(
            'Appointment: ${DateTime.fromMillisecondsSinceEpoch(appointment['startMs'] as int).toUtc().toIso8601String()} (${appointment['timeZone']})\nDuration: ${appointment['durationMinutes']} minutes\n\nLatest customer reply:\n${reply['body']}\n\nConfirm only if this reply accepts the exact offered time. Availability is checked again. No confirmation email is sent.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Confirm accepted appointment'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() => busy = true);
    try {
      await BusinessOperationsService().call(
        data!['businessId'].toString(),
        'saveItem',
        {
          'itemId': appointment['id'],
          'expectedVersion': appointment['version'],
          'item': {
            for (final key in [
              'title',
              'type',
              'customerId',
              'startMs',
              'durationMinutes',
              'timeZone',
              'assignedPeople',
              'location',
              'notes',
            ])
              if (appointment[key] != null) key: appointment[key],
            'status': 'scheduled',
          },
          'emailConversation': {
            'operationId': widget.operationId,
            'inboundDigest': data!['inboundDigest'],
            'availabilityVersion': data!['availability']['version'],
            'acceptanceReplyId': reply['id'],
            'ownerConfirmsAcceptance': true,
          },
        },
      );
      await load();
      feedback =
          'Appointment confirmed in Schedule. No confirmation email has been sent.';
    } catch (_) {
      feedback =
          'Confirmation was not completed. Reload the conversation and check availability; no duplicate appointment was created.';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Business conversation')),
    body: data == null
        ? Center(
            child: TextButton(
              onPressed: load,
              child: Text(feedback ?? 'Loading conversation…'),
            ),
          )
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                '${data!['operation']['recipient']}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (feedback != null) Text(feedback!),
              if (data!['operation']['state'] == 'sent') ...[
                const Text('Sent message'),
                SelectableText(
                  '${data!['operation']['subject']}\n${data!['operation']['body']}',
                ),
              ],
              for (final reply in (data!['replies'] as List? ?? [])) ...[
                const Divider(),
                Text(
                  '${reply['classification'] == 'substantive' ? 'Message received' : 'Automated or restricted message'} · ${reply['from']}',
                ),
                SelectableText('${reply['body']}'),
              ],
              OutlinedButton(
                onPressed: busy ? null : () => action('check'),
                child: const Text('Check conversation'),
              ),
              for (final appointment in data!['appointments'] as List? ?? [])
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${appointment['title']} · ${workStatusLabels[appointment['status']] ?? appointment['status']}',
                        ),
                        Text(
                          'Confirmation email: ${appointment['emailLink']['confirmationEmailState']}',
                        ),
                        if (appointment['emailLink']['acceptanceState'] ==
                            'needs_owner_review')
                          const Text(
                            'Acceptance needs review. Availability or conversation changed; no duplicate appointment was created.',
                          ),
                        if (appointment['emailLink']['operationId'] ==
                                widget.operationId &&
                            appointment['removedAtMs'] == null &&
                            appointment['status'] != 'canceled')
                          Wrap(
                            spacing: 8,
                            children: [
                              if (appointment['status'] == 'tentative' &&
                                  data!['canManage'] == true)
                                FilledButton(
                                  onPressed: busy
                                      ? null
                                      : () => confirmAppointment(appointment),
                                  child: const Text(
                                    'Review customer acceptance',
                                  ),
                                ),
                              TextButton(
                                onPressed: busy
                                    ? null
                                    : () => offer(appointment),
                                child: const Text('Offer a different time'),
                              ),
                              TextButton(
                                onPressed: busy
                                    ? null
                                    : () async {
                                        final yes = await showDialog<bool>(
                                          context: context,
                                          builder: (c) => AlertDialog(
                                            title: const Text(
                                              'Cancel this appointment?',
                                            ),
                                            content: const Text(
                                              'The same appointment and its history will be retained. This does not send a cancellation email.',
                                            ),
                                            actions: [
                                              TextButton(
                                                onPressed: () =>
                                                    Navigator.pop(c, false),
                                                child: const Text('Back'),
                                              ),
                                              FilledButton(
                                                onPressed: () =>
                                                    Navigator.pop(c, true),
                                                child: const Text(
                                                  'Cancel appointment',
                                                ),
                                              ),
                                            ],
                                          ),
                                        );
                                        if (yes != true) return;
                                        try {
                                          await BusinessOperationsService()
                                              .call(
                                                data!['businessId'].toString(),
                                                'removeItem',
                                                {
                                                  'itemId': appointment['id'],
                                                  'expectedVersion':
                                                      appointment['version'],
                                                  'removalAction': 'cancel',
                                                },
                                              );
                                          await load();
                                        } catch (_) {
                                          if (mounted) {
                                            setState(
                                              () => feedback =
                                                  'Cancellation was not confirmed. Reload the appointment before retrying.',
                                            );
                                          }
                                        }
                                      },
                                child: const Text('Cancel appointment'),
                              ),
                            ],
                          ),
                        if (appointment['emailLink']['operationId'] !=
                            widget.operationId)
                          TextButton(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => BusinessEmailConversationScreen(
                                  service: widget.service,
                                  operationId:
                                      appointment['emailLink']['operationId']
                                          .toString(),
                                ),
                              ),
                            ),
                            child: const Text('Open appointment conversation'),
                          ),
                      ],
                    ),
                  ),
                ),
              if (data!['canManage'] == true &&
                  data!['operation']['crmCustomerId'] != null) ...[
                const Divider(),
                const Text('Write an owner-reviewed reply'),
                TextField(
                  controller: subject,
                  onChanged: (_) => setState(() => savedDraft = null),
                  decoration: const InputDecoration(labelText: 'Subject'),
                ),
                TextField(
                  controller: body,
                  onChanged: (_) => setState(() => savedDraft = null),
                  minLines: 5,
                  maxLines: 12,
                  decoration: const InputDecoration(labelText: 'Exact reply'),
                ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: busy ? null : () => action('suggest'),
                      child: const Text('Suggest reply'),
                    ),
                    OutlinedButton(
                      onPressed: busy ? null : () => action('save'),
                      child: const Text('Save for review'),
                    ),
                    FilledButton(
                      onPressed: busy || savedDraft == null
                          ? null
                          : () => action('send'),
                      child: const Text('Approve & Send'),
                    ),
                    OutlinedButton(
                      onPressed: busy ? null : () => offer(),
                      child: const Text('Offer appointment'),
                    ),
                  ],
                ),
                const Text(
                  'Sending a reply does not itself confirm an appointment. Schedule and confirmation-email results are tracked separately.',
                ),
              ],
            ],
          ),
  );
}
