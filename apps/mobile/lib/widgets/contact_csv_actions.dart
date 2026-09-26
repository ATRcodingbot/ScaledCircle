import 'package:flutter/material.dart';
import '../services/business_operations_service.dart';
import '../services/contact_csv_picker.dart';
import '../services/artifact_download.dart';

class ContactCsvActions extends StatefulWidget {
  const ContactCsvActions({
    super.key,
    required this.businessId,
    required this.service,
    required this.canImport,
    required this.search,
    required this.filter,
    required this.onChanged,
    this.pickFile = pickContactCsv,
    this.download = downloadArtifact,
  });
  final String businessId, search, filter;
  final BusinessOperationsService service;
  final bool canImport;
  final Future<void> Function() onChanged;
  final Future<({String name, String text})?> Function() pickFile;
  final Future<void> Function({
    required String filename,
    required String content,
    required String mimeType,
  })
  download;
  @override
  State<ContactCsvActions> createState() => _ContactCsvActionsState();
}

class _ContactCsvActionsState extends State<ContactCsvActions> {
  bool busy = false;
  String? status;
  Future<Map<String, dynamic>> call(String op, Map<String, dynamic> input) =>
      widget.service.call(widget.businessId, op, input);
  Future<void> run(Future<void> Function() action) async {
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => status = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> export(bool filtered) async {
    final r = await call('exportContacts', {
      'search': filtered ? widget.search : '',
      'filter': filtered ? widget.filter : 'All',
    });
    await widget.download(
      filename: r['filename'],
      content: r['csv'],
      mimeType: 'text/csv',
    );
    if (mounted) {
      setState(
        () => status =
            'Downloaded ${r['count']} contacts. Importing contacts never grants permission to contact them.',
      );
    }
  }

  Future<void> import() async {
    final file = await widget.pickFile();
    if (file == null) return;
    final info = await call('inspectContactCsv', {'csv': file.text});
    final mapping = List<String>.from(info['mapping']);
    final headers = List<String>.from(info['headers']);
    final fields = Map<String, dynamic>.from(info['fields']);
    if (!mounted) return;
    final mapped = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, update) => AlertDialog(
          title: const Text('Map CSV columns'),
          content: SizedBox(
            width: 600,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${info['rowCount']} rows. Up to 1000 rows / 256 KB per import. Ignore columns you do not want.',
                  ),
                  for (var i = 0; i < headers.length; i++)
                    DropdownButtonFormField<String>(
                      initialValue: mapping[i],
                      isExpanded: true,
                      decoration: InputDecoration(labelText: headers[i]),
                      items: [
                        const DropdownMenuItem(
                          value: '',
                          child: Text('Ignore column'),
                        ),
                        const DropdownMenuItem(
                          value: 'schema',
                          child: Text('CSV schema (export round-trip)'),
                        ),
                        for (final f in fields.entries)
                          DropdownMenuItem(
                            value: f.key,
                            child: Text(f.value.toString()),
                          ),
                      ],
                      onChanged: (v) => update(() => mapping[i] = v ?? ''),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Preview'),
            ),
          ],
        ),
      ),
    );
    if (mapped != true) return;
    final preview = await call('previewContactImport', {
      'csv': file.text,
      'mapping': mapping,
      'filename': file.name,
    });
    final rows = operationRows(preview['rows']);
    final decisions = rows
        .map((r) => r['kind'] == 'new' ? 'create' : 'skip')
        .toList();
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, update) => AlertDialog(
          title: const Text('Review contact import'),
          content: SizedBox(
            width: 650,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Existing contacts default to Skip. Updates change only mapped fields. An email address is not consent; suppression and unsubscribe remain unchanged.',
                  ),
                  for (var i = 0; i < rows.length; i++)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Row ${rows[i]['row']}: ${rows[i]['name'] ?? ''} — ${rows[i]['kind']}',
                            ),
                            if (rows[i]['error'] != null)
                              Text(rows[i]['error']),
                            if (rows[i]['changes'] is Map)
                              Text(
                                (rows[i]['changes'] as Map).entries
                                    .map(
                                      (e) =>
                                          '${fields[e.key] ?? e.key}: ${e.value}',
                                    )
                                    .join('\n'),
                              ),
                            DropdownButton<String>(
                              value: decisions[i],
                              items: [
                                const DropdownMenuItem(
                                  value: 'skip',
                                  child: Text('Skip'),
                                ),
                                if (rows[i]['kind'] == 'new')
                                  const DropdownMenuItem(
                                    value: 'create',
                                    child: Text('Create contact'),
                                  ),
                                if ([
                                  'matched',
                                  'unchanged',
                                ].contains(rows[i]['kind']))
                                  const DropdownMenuItem(
                                    value: 'update',
                                    child: Text('Update this contact'),
                                  ),
                              ],
                              onChanged: (v) =>
                                  update(() => decisions[i] = v ?? 'skip'),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirm import'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;
    Map<String, dynamic> r;
    do {
      r = await call('commitContactImport', {
        'previewId': preview['previewId'],
        'decisions': decisions,
        'confirmed': true,
      });
    } while (r['complete'] != true);
    await widget.onChanged();
    if (mounted) {
      setState(
        () => status =
            'Receipt ${r['previewId']}: ${r['processed']} processed; ${r['created']} created; ${r['matched']} matched; ${r['updated']} updated; ${r['skipped']} skipped; ${r['duplicate']} duplicate; ${r['failed']} invalid; ${r['unauthorizedWrites']} unauthorized writes.',
      );
    }
  }

  Future<void> receipts() async {
    final result = await call('listContactImports', {});
    if (!mounted) return;
    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Your recent import receipts'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final row in operationRows(result['imports']))
                  ListTile(
                    title: Text('${row['filename']} — ${row['status']}'),
                    subtitle: SelectableText(
                      '${row['id']}\n${row['receipt'] ?? 'Preview only; no rows committed.'}',
                    ),
                    trailing: row['status'] == 'importing'
                        ? TextButton(
                            onPressed: () => Navigator.pop(ctx, row),
                            child: const Text('Resume confirmed import'),
                          )
                        : null,
                  ),
                if (operationRows(result['imports']).isEmpty)
                  const Text('No import receipts yet.'),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
    if (selected == null) return;
    Map<String, dynamic> r;
    do {
      r = await call('commitContactImport', {
        'previewId': selected['id'],
        'decisions': selected['decisions'],
        'confirmed': true,
      });
    } while (r['complete'] != true);
    await widget.onChanged();
    if (mounted) {
      setState(() => status = 'Completed import ${selected['id']}: $r');
    }
  }

  Future<void> sources(String kind) async {
    final result = await call('listContactSources', {'kind': kind});
    if (!mounted) return;
    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Review saved sources'),
        content: SizedBox(
          width: 600,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Adds or links a customer record without overwriting existing details. This does not approve outreach.',
                ),
                for (final row in operationRows(result['sources']))
                  ListTile(
                    title: Text(row['name']),
                    subtitle: Text(
                      '${row['email']} · ${row['source']}${row['restricted'] == true ? ' · Do not contact' : ''}',
                    ),
                    trailing: TextButton(
                      onPressed: () => Navigator.pop(ctx, row),
                      child: const Text('Confirm import'),
                    ),
                  ),
                if (operationRows(result['sources']).isEmpty)
                  const Text('No saved sources available.'),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
        ],
      ),
    );
    if (selected == null) return;
    final r = await call('importContactSource', {
      'kind': kind,
      'id': selected['id'],
      'confirmed': true,
    });
    await widget.onChanged();
    if (mounted) {
      setState(
        () => status = 'Customer ${r['customerId']} linked. No email sent.',
      );
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Wrap(
        spacing: 8,
        children: [
          if (widget.canImport)
            OutlinedButton(
              onPressed: busy ? null : () => run(import),
              child: const Text('Import CSV'),
            ),
          OutlinedButton(
            onPressed: busy ? null : () => run(() => export(false)),
            child: const Text('Export all contacts CSV'),
          ),
          OutlinedButton(
            onPressed: busy ? null : () => run(() => export(true)),
            child: const Text('Export filtered CSV'),
          ),
        ],
      ),
      if (widget.canImport)
        Wrap(
          spacing: 8,
          children: [
            TextButton(
              onPressed: busy
                  ? null
                  : () => run(() => sources('email_candidate')),
              child: const Text('Review saved Email contacts'),
            ),
            TextButton(
              onPressed: busy
                  ? null
                  : () => run(() => sources('agent_prospect')),
              child: const Text('Review saved agent prospects'),
            ),
          ],
        ),
      TextButton(
        onPressed: busy ? null : () => run(receipts),
        child: const Text('Import receipts / resume'),
      ),
      if (busy) const LinearProgressIndicator(),
      if (status != null) SelectableText(status!),
    ],
  );
}
