import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../services/business_email_service.dart';
import '../../widgets/customer_page_body.dart';

String campaignContactStatus(dynamic status) => switch (status) {
  'suppressed' => 'Do not contact',
  'excluded_automated' => 'Excluded · automated correspondence',
  _ => 'Needs relationship and message review',
};

List<Map<String, String>> campaignImportRows(String value) {
  final rows = value.trim().split('\n').where((l) => l.trim().isNotEmpty);
  if (rows.isEmpty || rows.length > 25) {
    throw const FormatException('Paste between 1 and 25 rows.');
  }
  return rows.map((line) {
    final cells = line.split('\t').map((s) => s.trim()).toList();
    if (cells.length != 4 || cells.any((s) => s.isEmpty)) {
      throw const FormatException(
        'Each row needs name, email, inquiry date and context.',
      );
    }
    return {
      'name': cells[0],
      'email': cells[1],
      'inquiryDate': cells[2],
      'context': cells[3],
    };
  }).toList();
}

class BusinessEmailCampaignScreen extends StatefulWidget {
  const BusinessEmailCampaignScreen({super.key, this.service});
  final BusinessEmailService? service;
  @override
  State<BusinessEmailCampaignScreen> createState() => _CampaignState();
}

class _CampaignState extends State<BusinessEmailCampaignScreen> {
  late final service = widget.service ?? BusinessEmailService();
  Map<String, dynamic>? data;
  bool busy = false;
  String? feedback;
  final selected = <String>{};
  final pages = <String, String>{};
  @override
  void initState() {
    super.initState();
    run('loadCampaigns');
  }

  Future<void> run(
    String operation, [
    Map<String, dynamic> input = const {},
  ]) async {
    if (busy) return;
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final result = await service.call(operation, input);
      final fresh = operation == 'loadCampaigns'
          ? result
          : await service.call('loadCampaigns');
      if (!mounted) return;
      setState(() {
        data = fresh;
        if (operation == 'discoverCampaignHistory') {
          final key = '${input['kind']}:${input['candidateId'] ?? ''}';
          if (result['nextPageToken'] is String) {
            pages[key] = result['nextPageToken'];
          } else {
            pages.remove(key);
          }
        }
        feedback =
            result['message']?.toString() ??
            (operation == 'loadCampaigns'
                ? null
                : 'Saved for review. Nothing sent.');
      });
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(
          () =>
              feedback = e.message ?? 'This action needs checking. Try again.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => feedback =
              'This action could not be verified. Refresh before trying again.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => busy = false);
        if (feedback != null && operation != 'loadCampaigns') {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(feedback!)));
        }
      }
    }
  }

  void history(String kind, [String? id]) {
    final key = '$kind:${id ?? ''}';
    run('discoverCampaignHistory', {
      'kind': kind,
      'candidateId': ?id,
      if (pages[key] != null) 'pageToken': pages[key],
    });
  }

  Future<void> importContacts() async {
    final name = TextEditingController(), rows = TextEditingController();
    String? error;
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Review spreadsheet contacts'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Paste up to 25 rows from your own customer or inquiry spreadsheet. Importing does not approve anyone for email.',
                  ),
                  TextField(
                    controller: name,
                    decoration: const InputDecoration(
                      labelText: 'Source workbook name',
                    ),
                  ),
                  TextField(
                    controller: rows,
                    minLines: 5,
                    maxLines: 10,
                    decoration: const InputDecoration(
                      labelText: 'Contact rows',
                      helperText:
                          'Four tab-separated columns: name, email, inquiry date, context. No header.',
                    ),
                  ),
                  if (error != null) Text(error!),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                try {
                  if (name.text.trim().isEmpty) {
                    throw const FormatException(
                      'Enter the source workbook name.',
                    );
                  }
                  Navigator.pop(context, {
                    'sourceName': name.text.trim(),
                    'contacts': campaignImportRows(rows.text),
                  });
                } on FormatException catch (e) {
                  update(() => error = e.message);
                }
              },
              child: const Text('Import for Review'),
            ),
          ],
        ),
      ),
    );
    // Dialog fields finish their removal animation before controller disposal.
    if (input != null) await run('importCampaignWorkbook', input);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    name.dispose();
    rows.dispose();
  }

  Future<void> prepare() async {
    final subject = TextEditingController(),
        body = TextEditingController(),
        address = TextEditingController();
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Prepare campaign for review'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sender: ${data?['sender']}\n${selected.length} proposed recipients · sending blocked',
                ),
                TextField(
                  controller: subject,
                  maxLength: 160,
                  decoration: const InputDecoration(labelText: 'Subject'),
                ),
                TextField(
                  controller: body,
                  minLines: 5,
                  maxLines: 12,
                  decoration: const InputDecoration(labelText: 'Exact message'),
                ),
                TextField(
                  controller: address,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Business mailing address',
                    helperText:
                        'A legitimate mailing address is required before sending. Leave blank if still awaiting confirmation.',
                  ),
                ),
                const Text(
                  'Each message will need its own unsubscribe link. Saving creates a proposal, not a schedule or send approval. A proposed time can be agreed during review.',
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (subject.text.trim().isEmpty || body.text.trim().isEmpty) {
                return;
              }
              Navigator.pop(context, {
                'campaignId': 'review_${DateTime.now().microsecondsSinceEpoch}',
                'title': subject.text.trim(),
                'subject': subject.text.trim(),
                'body': body.text.trim(),
                'mailingAddress': address.text.trim().isEmpty
                    ? null
                    : address.text.trim(),
                'recipientIds': selected.toList(),
                'expectedVersion': 0,
                'proposedSendAt': null,
              });
            },
            child: const Text('Save Review Draft'),
          ),
        ],
      ),
    );
    if (input != null) await run('saveCampaignDraft', input);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    subject.dispose();
    body.dispose();
    address.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Email Campaigns · Private Beta')),
    body: CustomerPageBody(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Review a small, relevant audience'),
          const Text(
            'These are candidates, not approved recipients. Historical correspondence is not permission to send marketing. Sending and scheduling remain blocked.',
          ),
          if (busy) const LinearProgressIndicator(),
          if (feedback != null)
            Semantics(liveRegion: true, child: Text(feedback!)),
          if (data != null) ...[
            Text('Sender: ${data!['sender']}'),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                OutlinedButton(
                  onPressed: busy ? null : importContacts,
                  child: const Text('Import Spreadsheet Contacts'),
                ),
                OutlinedButton(
                  onPressed: busy ? null : () => history('optouts'),
                  child: Text(
                    pages.containsKey('optouts:')
                        ? 'Continue Opt-Out Review'
                        : 'Review Opt-Out History',
                  ),
                ),
                OutlinedButton(
                  onPressed: busy ? null : () => history('inquiries'),
                  child: Text(
                    pages.containsKey('inquiries:')
                        ? 'Continue Inquiry Review'
                        : 'Discover Old Inquiries',
                  ),
                ),
              ],
            ),
            Text(
              data!['history']?['complete'] == true
                  ? 'Opt-out search reviewed. Individual context and audience review are still required.'
                  : 'Historical opt-out review is incomplete. An empty restriction list does not mean nobody opted out.',
            ),
            for (final row in (data!['candidates'] as List? ?? []))
              candidate(Map<String, dynamic>.from(row)),
            Text('${selected.length} proposed recipients · maximum 25'),
            FilledButton(
              onPressed: busy || selected.isEmpty || selected.length > 25
                  ? null
                  : prepare,
              child: const Text('Prepare Review Draft'),
            ),
            const SizedBox(height: 20),
            Text(
              'Saved Campaigns',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            for (final c in (data!['campaigns'] as List? ?? []))
              ExpansionTile(
                title: Text(c['subject'] ?? 'Review draft'),
                subtitle: Text(
                  c['mailingAddress'] == null
                      ? 'Mailing address required · not sent'
                      : 'Needs Founder review · not sent',
                ),
                children: [
                  SelectableText(
                    'Sender: ${c['sender']}\nAudience: ${(c['audience'] as List).length}\nSchedule: not scheduled\n\n${c['body']}\n\n${c['mailingAddress'] ?? 'Mailing address awaiting confirmation'}\nUnsubscribe: individual no-login link per recipient\nSent: 0 · Replies: 0 · Delivery: not available',
                  ),
                  for (final a in c['audience'])
                    ListTile(
                      title: Text(a['name']),
                      subtitle: Text(a['email']),
                    ),
                ],
              ),
          ] else if (!busy)
            const Text(
              'This campaign beta requires the invited Business owner.',
            ),
        ],
      ),
    ),
  );

  Widget candidate(Map<String, dynamic> c) {
    final restricted = [
      'suppressed',
      'excluded_automated',
    ].contains(c['status']);
    return ExpansionTile(
      key: PageStorageKey(c['id']),
      title: Text('${c['name'] == '' ? 'Contact' : c['name']} · ${c['email']}'),
      subtitle: Text(campaignContactStatus(c['status'])),
      children: [
        CheckboxListTile(
          value: selected.contains(c['id']) && !restricted,
          title: const Text('Include in proposed audience for review'),
          onChanged: busy || restricted
              ? null
              : (value) => setState(() {
                  if (value == true) {
                    selected.add(c['id']);
                  } else {
                    selected.remove(c['id']);
                  }
                }),
        ),
        for (final s in (c['sources'] as List? ?? []))
          ListTile(
            title: Text(
              s['kind'] == 'owner_workbook'
                  ? 'Founder spreadsheet: ${s['label']}'
                  : 'Gmail conversation',
            ),
            subtitle: Text(
              s['context'] ??
                  'Historical correspondence · relationship still needs review',
            ),
          ),
        OutlinedButton(
          onPressed: busy ? null : () => history('contact', c['id']),
          child: Text(
            pages.containsKey('contact:${c['id']}')
                ? 'Continue Contact History'
                : 'Review Contact History',
          ),
        ),
        Wrap(
          spacing: 6,
          children: [
            for (final r in const {
              'unsubscribed': 'Unsubscribed',
              'do_not_contact': 'Do Not Contact',
              'bounced': 'Bounced',
              'invalid': 'Invalid',
              'suppressed': 'Suppress',
            }.entries)
              TextButton(
                onPressed: busy
                    ? null
                    : () async {
                        selected.remove(c['id']);
                        await run('restrictCampaignContact', {
                          'candidateId': c['id'],
                          'reason': r.key,
                        });
                      },
                child: Text(r.value),
              ),
          ],
        ),
        for (final e in (c['evidence'] as List? ?? []))
          ListTile(
            title: Text(e['subject'] ?? 'Conversation'),
            subtitle: Text(
              (e['excerpt'] as String?)?.isNotEmpty == true
                  ? e['excerpt']
                  : 'Readable text not available; review original conversation.',
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: const Icon(Icons.open_in_new),
            onTap: () => showDialog<void>(
              context: context,
              builder: (context) => AlertDialog(
                title: Text(e['subject'] ?? 'Conversation'),
                content: SizedBox(
                  width: 620,
                  child: SingleChildScrollView(
                    child: SelectableText(
                      e['excerpt'] ?? 'Readable text not available.',
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
            ),
          ),
      ],
    );
  }
}
