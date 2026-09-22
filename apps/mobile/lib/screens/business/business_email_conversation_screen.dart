import 'package:flutter/material.dart';
import 'appointment_offer_dialog.dart';
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
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AppointmentOfferDialog(
        service: BusinessOperationsService(),
        businessId: data!['businessId'].toString(),
        operationId: widget.operationId,
        inboundDigest: data!['inboundDigest'].toString(),
        customerId: data!['operation']['crmCustomerId'].toString(),
        existing: existing,
      ),
    );
    if (result == null || !mounted) return;
    if (result['acceptanceCode'] != null) {
      subject.text = 'Appointment time for your review';
      body.text =
          'We can offer ${result['summary']}. To accept this exact appointment, reply with only:\nPlease book ${result['acceptanceCode']}';
      savedDraft = null;
    }
    await load();
    if (mounted) {
      setState(
        () => feedback =
            'Tentative offer saved: ${result['summary']}. Open Schedule to review it. Nothing was sent.',
      );
    }
  }

  Future<void> confirmAppointment(Map appointment) async {
    if ((appointment['assignedPeople'] as List? ?? []).isEmpty) {
      setState(
        () => feedback =
            'This offer is tentative. Assign an available person in Schedule, then reload this conversation before confirming.',
      );
      return;
    }
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
        requestId: 'confirm_${appointment['id']}_${appointment['version']}',
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
              if (feedback?.startsWith('Tentative offer saved:') == true)
                TextButton(
                  onPressed: () =>
                      Navigator.pushNamed(context, '/business/schedule'),
                  child: const Text('Open Schedule'),
                ),
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
