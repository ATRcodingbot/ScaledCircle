import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../models/social_plan_presentation.dart';
import '../../services/business_email_service.dart';
import '../../widgets/customer_page_body.dart';

String emailCampaignStatus(dynamic value) => switch (value) {
  'preparing' => 'Preparing',
  'scheduled' => 'Scheduled',
  'sending' => 'Sending',
  'sent' => 'Sent',
  'partially_sent' => 'Partially sent',
  'needs_attention' => 'Needs attention',
  'suppressed' => 'No eligible recipients',
  'needs_mailing_address' => 'Business mailing address required',
  _ => 'Needs your review · not sent',
};

String campaignLocalTime(BuildContext context, dynamic value) {
  final date = value is num
      ? DateTime.fromMillisecondsSinceEpoch(value.toInt())
      : DateTime.tryParse('$value');
  return date == null
      ? 'Not scheduled'
      : socialCustomerTime(context, date.toIso8601String());
}

class BusinessEmailCampaignReview extends StatefulWidget {
  const BusinessEmailCampaignReview({
    super.key,
    required this.campaign,
    required this.service,
    required this.candidates,
  });
  final Map<String, dynamic> campaign;
  final BusinessEmailService service;
  final List<Map<String, dynamic>> candidates;
  @override
  State<BusinessEmailCampaignReview> createState() => _ReviewState();
}

class _ReviewState extends State<BusinessEmailCampaignReview> {
  late Map<String, dynamic> campaign = Map.of(widget.campaign);
  bool busy = false;
  String? feedback;
  Timer? timer;
  final scroll = ScrollController();
  List<Map<String, dynamic>> get audience =>
      (campaign['audience'] as List? ?? [])
          .whereType<Map>()
          .map((v) => Map<String, dynamic>.from(v))
          .toList();
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!busy &&
          mounted &&
          ModalRoute.of(context)?.isCurrent == true &&
          campaign['approved'] == true) {
        refresh();
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    scroll.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>?> action(
    String op,
    Map<String, dynamic> input,
  ) async {
    if (busy) return null;
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final result = await widget.service.call(op, input);
      if (!mounted) return null;
      setState(() {
        if (result['campaignId'] != null) campaign = result;
        feedback = result['message']?.toString();
      });
      if (op == 'approveCampaign') {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && scroll.hasClients) {
            scroll.animateTo(
              0,
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOut,
            );
          }
        });
      }
      return result;
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(
          () => feedback =
              e.message ??
              'This action needs checking. No automatic retry was made.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => feedback =
              'We could not confirm the result. Check campaign status before trying again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
    return null;
  }

  Future<void> refresh() async {
    await action('reviewCampaign', {'campaignId': campaign['campaignId']});
  }

  Future<void> resume() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Continue the approved campaign?'),
        content: const Text(
          'Only recipients with no provider attempt can continue. Eligibility and contact cooldowns are checked again. Uncertain messages are never retried.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep Reviewing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Continue Approved Campaign'),
          ),
        ],
      ),
    );
    if (confirm == true && mounted) {
      await action('resumeCampaign', {
        'campaignId': campaign['campaignId'],
        'confirm': true,
      });
    }
  }

  Future<void> conversation(Map<String, dynamic> recipient) async {
    final mailbox = await action('load', {});
    if (mailbox == null || !mounted) return;
    final op = (mailbox['operations'] as List? ?? [])
        .whereType<Map>()
        .where((o) => o['id'] == recipient['operationId'])
        .firstOrNull;
    final replies = (mailbox['replies'] as List? ?? [])
        .whereType<Map>()
        .where((r) => r['operationId'] == recipient['operationId'])
        .toList();
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Conversation with ${recipient['name']}'),
        content: SizedBox(
          width: 640,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Subject: ${op?['subject'] ?? campaign['subject']}'),
                SelectableText(
                  op?['body'] ?? recipient['body'] ?? 'Message unavailable',
                ),
                const Divider(),
                Text('Replies: ${replies.length}'),
                if (replies.isEmpty) const Text('No reply found yet.'),
                for (final r in replies) ...[
                  Text(campaignLocalTime(context, r['receivedAt'])),
                  SelectableText('${r['body']}'),
                  const Divider(),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> confirmSend({required bool schedule}) async {
    DateTime? planned;
    if (schedule) {
      final now = DateTime.now();
      final day = await showDatePicker(
        context: context,
        initialDate: now.add(const Duration(days: 1)),
        firstDate: now,
        lastDate: now.add(const Duration(days: 29)),
      );
      if (day == null || !mounted) return;
      final time = await showTimePicker(
        context: context,
        initialTime: const TimeOfDay(hour: 10, minute: 0),
      );
      if (time == null || !mounted) return;
      planned = DateTime(day.year, day.month, day.day, time.hour, time.minute);
      if (!planned.isAfter(now)) {
        setState(() => feedback = 'Choose a future send time.');
        return;
      }
    }
    final fresh = await action('reviewCampaign', {
      'campaignId': campaign['campaignId'],
      'refresh': true,
    });
    if (fresh == null || !mounted) return;
    final eligible = fresh['eligibleCount'] as int? ?? 0;
    if (eligible == 0) {
      setState(
        () => feedback =
            'No eligible recipients remain. Review the exclusions below.',
      );
      return;
    }
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          schedule
              ? 'Schedule this campaign to $eligible people?'
              : 'Send this campaign to $eligible people?',
        ),
        content: SingleChildScrollView(
          child: Text(
            'From: ${fresh['sender']}\nRecipients: $eligible\nSubject: ${fresh['subject']}\nUnsubscribe: Enabled\n${schedule ? 'Send at: ${campaignLocalTime(context, planned!.millisecondsSinceEpoch)}' : 'Send now, within the mailbox limits'}\n\nOnly this reviewed version will be sent. New restrictions can exclude recipients. Nothing is sent to new contacts and no follow-up is automatic.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep Reviewing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(schedule ? 'Schedule Campaign' : 'Send Campaign'),
          ),
        ],
      ),
    );
    if (accepted != true || !mounted) return;
    await action('approveCampaign', {
      'campaignId': fresh['campaignId'],
      'version': fresh['version'],
      'reviewDigest': fresh['reviewDigest'],
      'sendAt': planned?.millisecondsSinceEpoch,
      'confirm': true,
    });
  }

  Future<void> edit() async {
    final subject = TextEditingController(text: campaign['subject']),
        body = TextEditingController(text: campaign['body']),
        address = TextEditingController(text: campaign['mailingAddress']);
    final rows = audience;
    final names = rows
        .map(
          (r) => TextEditingController(
            text: r['firstName'] ?? '${r['name']}'.split(' ').first,
          ),
        )
        .toList();
    final projects = rows
        .map((r) => TextEditingController(text: r['projectType'] ?? ''))
        .toList();
    String? error;
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Edit Campaign'),
          content: SizedBox(
            width: 650,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Saving preserves a review draft. It does not approve, schedule or send it.',
                  ),
                  TextField(
                    controller: subject,
                    maxLength: 160,
                    decoration: const InputDecoration(labelText: 'Subject'),
                  ),
                  TextField(
                    controller: body,
                    minLines: 6,
                    maxLines: 15,
                    decoration: const InputDecoration(
                      labelText: 'Message',
                      helperText:
                          'Use {{FirstName}} and {{ProjectType}} for reviewed personalization.',
                    ),
                  ),
                  TextField(
                    controller: address,
                    minLines: 3,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      labelText: 'Approved Business footer and mailing address',
                    ),
                  ),
                  for (var i = 0; i < rows.length; i++) ...[
                    const Divider(),
                    Text('${rows[i]['name']} · ${rows[i]['email']}'),
                    Text(
                      'Prior inquiry: ${(rows[i]['provenance'] as List? ?? widget.candidates.where((c) => c['id'] == rows[i]['candidateId']).firstOrNull?['sources'] as List? ?? []).whereType<Map>().where((s) => s['context'] != null).map((s) => s['context']).join('; ')}',
                    ),
                    TextField(
                      controller: names[i],
                      decoration: const InputDecoration(
                        labelText: 'First name',
                      ),
                    ),
                    TextField(
                      controller: projects[i],
                      maxLength: 600,
                      decoration: const InputDecoration(
                        labelText: 'Project type from this prior inquiry',
                      ),
                    ),
                  ],
                  if (error != null) Text(error!),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (subject.text.trim().isEmpty ||
                    body.text.trim().isEmpty ||
                    address.text.trim().isEmpty ||
                    names.any((c) => c.text.trim().isEmpty) ||
                    projects.any((c) => c.text.trim().isEmpty)) {
                  update(
                    () => error =
                        'Complete the message, footer and each recipient’s source-based personalization.',
                  );
                  return;
                }
                Navigator.pop(context, true);
              },
              child: const Text('Save Review Draft'),
            ),
          ],
        ),
      ),
    );
    if (saved == true && mounted) {
      final result = await action('saveCampaignDraft', {
        'campaignId': campaign['campaignId'],
        'expectedVersion': campaign['version'],
        'title': subject.text.trim(),
        'subject': subject.text.trim(),
        'body': body.text.trim(),
        'mailingAddress': address.text.trim(),
        'proposedSendAt': campaign['proposedSendAt'],
        'recipientIds': rows.map((r) => r['candidateId']).toList(),
        'recipientDetails': [
          for (var i = 0; i < rows.length; i++)
            {
              'candidateId': rows[i]['candidateId'],
              'sourceHash':
                  rows[i]['sourceHash'] ??
                  widget.candidates
                      .where((c) => c['id'] == rows[i]['candidateId'])
                      .firstOrNull?['sourceHash'],
              'firstName': names[i].text.trim(),
              'projectType': projects[i].text.trim(),
            },
        ],
      });
      if (result != null) await refresh();
    }
    await Future<void>.delayed(const Duration(milliseconds: 300));
    subject.dispose();
    body.dispose();
    address.dispose();
    for (final c in [...names, ...projects]) {
      c.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final results = campaign['results'] as Map? ?? {},
        approved = campaign['approved'] == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Review Campaign')),
      body: CustomerPageBody(
        child: ListView(
          controller: scroll,
          padding: const EdgeInsets.all(20),
          children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: Chip(label: Text('Private Beta')),
            ),
            Text(
              emailCampaignStatus(campaign['status']),
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            if (busy) const LinearProgressIndicator(),
            if (approved)
              Text(
                '${results['sent'] ?? 0} of ${audience.length} sent · ${results['queued'] ?? 0} queued',
              ),
            if (campaign['nextSendingWindow'] != null)
              Text(
                'Next sending window: ${campaignLocalTime(context, campaign['nextSendingWindow'])}',
              ),
            if (feedback != null)
              Semantics(liveRegion: true, child: Text(feedback!)),
            Text('From: ${campaign['sender']}'),
            Text(
              'Objective: ${campaign['objective'] ?? 'Historical inquiry → estimate scheduled'}'
                  .replaceAll('_', ' '),
            ),
            Text(
              '${audience.length} reviewed recipients · ${campaign['eligibleCount'] ?? audience.length} currently eligible',
            ),
            Text(
              'Subject: ${campaign['subject']}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Text(
              'Send time: ${campaignLocalTime(context, campaign['sendAt'] ?? campaign['proposedSendAt'])}',
            ),
            const Text(
              'Mailbox limit: 5 attempts per hour and 20 per day. An approved campaign can finish in a later sending window.',
            ),
            const Text(
              'Unsubscribe: Enabled · individual no-login link in each message. Suppressions are checked again before sending.',
            ),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                if (!approved)
                  OutlinedButton(
                    onPressed: busy ? null : edit,
                    child: const Text('Edit Campaign'),
                  ),
                if (!approved && campaign['canApprove'] == true) ...[
                  OutlinedButton(
                    onPressed: busy ? null : () => confirmSend(schedule: true),
                    child: const Text('Schedule Send'),
                  ),
                  FilledButton(
                    onPressed: busy ? null : () => confirmSend(schedule: false),
                    child: const Text('Approve & Send Now'),
                  ),
                ],
                if (approved)
                  OutlinedButton(
                    onPressed: busy
                        ? null
                        : () => action('checkCampaign', {
                            'campaignId': campaign['campaignId'],
                          }),
                    child: const Text('Check Conversations'),
                  ),
                if (approved && audience.any((r) => r['state'] == 'held'))
                  OutlinedButton(
                    onPressed: busy ? null : resume,
                    child: const Text('Review & Continue Unsent'),
                  ),
                TextButton(
                  onPressed: busy ? null : () => Navigator.pop(context),
                  child: Text(approved ? 'Back to Campaigns' : 'Cancel'),
                ),
              ],
            ),
            if (!approved && campaign['canApprove'] != true)
              const Text(
                'Sending is not enabled for this workspace, or required review details are missing.',
              ),
            const SizedBox(height: 20),
            Text(
              'Campaign Results',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Wrap(
              spacing: 20,
              runSpacing: 12,
              children: [
                for (final entry in {
                  'Audience': audience.length,
                  'Sent': results['sent'],
                  'Queued': results['queued'],
                  'Needs Attention': results['needsAttention'],
                  'Replies': results['replies'],
                  'Recorded bounces': results['bounced'],
                  'Unsubscribes': results['unsubscribed'],
                  'Suppressed': results['suppressed'],
                  'Recorded estimates': results['estimates'],
                  'Recorded appointments': results['appointments'],
                }.entries)
                  Text('${entry.key}: ${entry.value ?? 'Unavailable'}'),
              ],
            ),
            const Text(
              'Gmail send acceptance is not delivery or open evidence. Replies do not establish interest, appointments or won work.',
            ),
            const SizedBox(height: 20),
            for (final r in audience)
              Card(
                child: ExpansionTile(
                  title: Text('${r['name']} · ${r['email']}'),
                  subtitle: Text(
                    r['exclusion'] ??
                        (r['state'] == 'not_sent'
                            ? 'Eligible · not sent'
                            : '${r['state']}'.replaceAll('_', ' ')),
                  ),
                  childrenPadding: const EdgeInsets.all(16),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Relationship: ${r['relationshipType'] ?? 'Unknown'} · Stage: ${r['lifecycleStage'] ?? 'Unknown'}'
                          .replaceAll('_', ' '),
                    ),
                    if (r['lastInboundAt'] != null)
                      Text(
                        'Last reply: ${campaignLocalTime(context, r['lastInboundAt'])}',
                      ),
                    if (r['lastOutboundAt'] != null)
                      Text(
                        'Last outreach: ${campaignLocalTime(context, r['lastOutboundAt'])}',
                      ),
                    if (r['cooldownUntil'] != null)
                      Text(
                        'Contact cooldown through ${campaignLocalTime(context, r['cooldownUntil'])}',
                      ),
                    for (final s
                        in (r['provenance'] as List? ?? []).whereType<Map>())
                      Text(
                        'Prior inquiry · ${s['inquiryDate']}\n${s['context']}\nSource: ${s['label']}',
                      ),
                    const SizedBox(height: 8),
                    SelectableText(
                      r['body'] ??
                          'Complete the reviewed personalization in Edit Campaign.',
                    ),
                    if (r['state'] == 'sent')
                      OutlinedButton(
                        onPressed: busy ? null : () => conversation(r),
                        child: const Text('View Conversation'),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
