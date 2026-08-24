import 'package:flutter/material.dart';
import '../../services/sales_service.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import 'admin_role_gate.dart';

class SalesHomeScreen extends StatefulWidget {
  const SalesHomeScreen({super.key, this.service});
  final SalesService? service;
  @override
  State<SalesHomeScreen> createState() => _SalesHomeScreenState();
}

class _SalesHomeScreenState extends State<SalesHomeScreen> {
  late final SalesService _service = widget.service ?? SalesService();
  late Future<SalesPipeline> _pipeline = _service.loadPipeline();
  void _refresh() => setState(() => _pipeline = _service.loadPipeline());

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(
        title: const Text('Sales'),
        actions: [
          IconButton(
            onPressed: _refresh,
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
          ),
          const AuthenticatedSignOutButton(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createLead,
        icon: const Icon(Icons.add),
        label: const Text('Add prospect'),
      ),
      body: FutureBuilder<SalesPipeline>(
        future: _pipeline,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData || snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text("We couldn't load Sales. Try again."),
                  TextButton(onPressed: _refresh, child: const Text('Retry')),
                ],
              ),
            );
          }
          return SalesPipelineContent(
            pipeline: snapshot.data!,
            onOpen: _openLead,
          );
        },
      ),
    ),
  );

  Future<void> _createLead() async {
    final name = TextEditingController();
    final industry = TextEditingController();
    final email = TextEditingController();
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add a Business prospect'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Business name'),
              ),
              TextField(
                controller: industry,
                decoration: const InputDecoration(
                  labelText: 'Industry (optional)',
                ),
              ),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Contact email (optional)',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Add prospect'),
          ),
        ],
      ),
    );
    if (created != true || name.text.trim().isEmpty) return;
    await _service.createLead({
      'businessName': name.text,
      'industry': industry.text,
      'contactEmail': email.text,
      'source': 'sales',
      'priority': 'normal',
    });
    _refresh();
  }

  void _openLead(SalesLead lead) => Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => SalesLeadDetailScreen(
        lead: lead,
        service: _service,
        onChanged: _refresh,
      ),
    ),
  );
}

class SalesPipelineContent extends StatelessWidget {
  const SalesPipelineContent({
    super.key,
    required this.pipeline,
    required this.onOpen,
  });
  final SalesPipeline pipeline;
  final ValueChanged<SalesLead> onOpen;
  @override
  Widget build(BuildContext context) {
    final due = pipeline.leads
        .where(
          (lead) =>
              lead.mayContact &&
              ['overdue', 'today'].contains(lead.followUpBucket),
        )
        .toList();
    final high = pipeline.leads
        .where(
          (lead) =>
              lead.priority == 'high' &&
              ['prospect', 'qualified', 'interested'].contains(lead.stage),
        )
        .toList();
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
        children: [
          Text('Today', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 6),
          const Text('Know who needs follow-up and what to do next.'),
          const SizedBox(height: 16),
          if (due.isEmpty && high.isEmpty)
            const Card(
              child: ListTile(
                leading: Icon(Icons.check_circle_outline),
                title: Text('No Sales follow-ups need attention today.'),
              ),
            ),
          ...due
              .take(5)
              .map((lead) => _LeadTile(lead: lead, onTap: () => onOpen(lead))),
          ...high
              .where((lead) => !due.contains(lead))
              .take(5)
              .map((lead) => _LeadTile(lead: lead, onTap: () => onOpen(lead))),
          const SizedBox(height: 24),
          Text('Pipeline', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children:
                const [
                  'prospect',
                  'qualified',
                  'contacted',
                  'interested',
                  'signed_up',
                  'activated',
                  'paid',
                  'retained',
                ].map((stage) {
                  final counts = pipeline.summary['counts'] is Map
                      ? Map<String, dynamic>.from(
                          pipeline.summary['counts'] as Map,
                        )
                      : const <String, dynamic>{};
                  return Chip(
                    label: Text(
                      '${_label(stage)}  ${(counts[stage] as num?)?.toInt() ?? 0}',
                    ),
                  );
                }).toList(),
          ),
          const SizedBox(height: 24),
          Text('Prospects', style: Theme.of(context).textTheme.headlineSmall),
          if (pipeline.leads.isEmpty)
            const Card(
              child: ListTile(
                title: Text('No prospects yet.'),
                subtitle: Text(
                  "Add a Business prospect when you're ready to start outreach.",
                ),
              ),
            ),
          ...pipeline.leads.map(
            (lead) => _LeadTile(lead: lead, onTap: () => onOpen(lead)),
          ),
        ],
      ),
    );
  }
}

class _LeadTile extends StatelessWidget {
  const _LeadTile({required this.lead, required this.onTap});
  final SalesLead lead;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        child: Text(
          lead.businessName.isEmpty ? '?' : lead.businessName[0].toUpperCase(),
        ),
      ),
      title: Text(lead.businessName),
      subtitle: Text(
        [
          if (lead.industry?.isNotEmpty == true) lead.industry!,
          _label(lead.stage),
          if (!lead.mayContact) 'Do not contact',
          if (lead.followUpBucket != null)
            '${_label(lead.followUpBucket!)} follow-up',
        ].join(' • '),
      ),
      trailing: const Icon(Icons.chevron_right),
    ),
  );
}

class SalesLeadDetailScreen extends StatefulWidget {
  const SalesLeadDetailScreen({
    super.key,
    required this.lead,
    required this.service,
    required this.onChanged,
  });
  final SalesLead lead;
  final SalesService service;
  final VoidCallback onChanged;
  @override
  State<SalesLeadDetailScreen> createState() => _SalesLeadDetailScreenState();
}

class _SalesLeadDetailScreenState extends State<SalesLeadDetailScreen> {
  bool busy = false;
  Future<void> run(Future<void> Function() action) async {
    setState(() => busy = true);
    try {
      await action();
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lead = widget.lead;
    return Scaffold(
      appBar: AppBar(title: Text(lead.businessName)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'What happened and what should happen next',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 16),
          _fact('Stage', _label(lead.stage)),
          _fact('Priority', _label(lead.priority)),
          if (lead.industry != null) _fact('Industry', lead.industry!),
          if (lead.cityRegion != null) _fact('Region', lead.cityRegion!),
          if (lead.contactName != null) _fact('Contact', lead.contactName!),
          if (lead.contactEmail != null) _fact('Email', lead.contactEmail!),
          if (lead.researchSummary != null)
            _fact('Why they may be a fit', lead.researchSummary!),
          if (!lead.mayContact)
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: ListTile(
                title: const Text('Contact suppressed'),
                subtitle: Text(
                  _label(lead.suppressionStatus ?? 'do_not_contact'),
                ),
              ),
            ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final stage in const [
                'qualified',
                'contacted',
                'interested',
                'closed_not_interested',
              ])
                OutlinedButton(
                  onPressed: busy
                      ? null
                      : () => run(
                          () => widget.service.mutate(lead.id, 'stage', {
                            'stage': stage,
                          }),
                        ),
                  child: Text(_label(stage)),
                ),
              FilledButton.tonal(
                onPressed: busy || !lead.mayContact ? null : _recordContact,
                child: const Text('Record contact'),
              ),
              OutlinedButton(
                onPressed: busy ? null : _schedule,
                child: const Text('Schedule follow-up'),
              ),
              OutlinedButton(
                onPressed: busy ? null : _note,
                child: const Text('Add note'),
              ),
              if (lead.convertedBusinessUid == null)
                OutlinedButton(
                  onPressed: busy ? null : _linkBusiness,
                  child: const Text('Link Business'),
                ),
              if (lead.mayContact)
                TextButton(
                  onPressed: busy
                      ? null
                      : () => run(
                          () => widget.service.mutate(lead.id, 'suppress', {
                            'status': 'do_not_contact',
                          }),
                        ),
                  child: const Text('Do not contact'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _fact(String label, String value) => ListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    subtitle: Text(value),
  );
  Future<void> _recordContact() async {
    final value = await _contactPrompt();
    if (value != null) {
      await run(
        () => widget.service.recordActivity(
          widget.lead.id,
          type: 'contact',
          channel: value.$1,
          summary: value.$2,
        ),
      );
    }
  }

  Future<void> _linkBusiness() async {
    final email = await _prompt(
      'Link Business account',
      'Business account email',
    );
    if (email != null) {
      await run(
        () => widget.service.mutate(widget.lead.id, 'link_business', {
          'businessEmail': email.toLowerCase(),
        }),
      );
    }
  }

  Future<(String, String)?> _contactPrompt() async {
    final controller = TextEditingController();
    var channel = 'email';
    return showDialog<(String, String)>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Record contact'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: channel,
                decoration: const InputDecoration(labelText: 'Channel'),
                items:
                    const [
                          'email',
                          'phone',
                          'facebook',
                          'instagram',
                          'linkedin',
                          'in_person',
                          'other',
                        ]
                        .map(
                          (value) => DropdownMenuItem(
                            value: value,
                            child: Text(_label(value)),
                          ),
                        )
                        .toList(),
                onChanged: (value) =>
                    setDialogState(() => channel = value ?? channel),
              ),
              TextField(
                controller: controller,
                decoration: const InputDecoration(labelText: 'Outcome'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final summary = controller.text.trim();
                if (summary.isNotEmpty) {
                  Navigator.pop(context, (channel, summary));
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _note() async {
    final value = await _prompt('Add note', 'Note');
    if (value != null) {
      await run(
        () => widget.service.recordActivity(
          widget.lead.id,
          type: 'note',
          summary: value,
        ),
      );
    }
  }

  Future<void> _schedule() async {
    final value = await _prompt('Schedule follow-up', 'Reason');
    if (value != null) {
      await run(
        () => widget.service.mutate(widget.lead.id, 'follow_up', {
          'reason': value,
          'nextFollowUpAt': DateTime.now()
              .add(const Duration(days: 1))
              .millisecondsSinceEpoch,
        }),
      );
    }
  }

  Future<String?> _prompt(String title, String label) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(labelText: label),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

String _label(String value) => value
    .replaceAll('_', ' ')
    .split(' ')
    .map(
      (word) =>
          word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}',
    )
    .join(' ');
