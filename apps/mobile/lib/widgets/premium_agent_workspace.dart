import 'package:flutter/material.dart';
import '../models/social_plan_presentation.dart';

List<Map<String, dynamic>> agentRows(dynamic value) => (value as List? ?? [])
    .whereType<Map>()
    .map((v) => Map<String, dynamic>.from(v))
    .toList();

bool workforcePerson(Map p) =>
    p['opportunityType'] == 'workforce_candidate' || p['kind'] == 'scaler';
bool workforceChannel(Map p) => p['opportunityType'] == 'recruitment_channel';
bool workforcePartner(Map p) =>
    !workforcePerson(p) &&
    !workforceChannel(p) &&
    p['kind'] == 'referral_partner';

/// Group repeated recommendations without deleting any source report/history.
List<Map<String, dynamic>> distinctAgentRecommendations(dynamic reports) {
  final rows = agentRows(reports)
    ..sort((a, b) => '${b['period']}'.compareTo('${a['period']}'));
  final unique = <String, Map<String, dynamic>>{};
  for (final r in rows) {
    final s = r['summary'] as Map? ?? {};
    final key = '${s['learned'] ?? ''}|${s['next'] ?? ''}'
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (key == '|') continue;
    if (unique.containsKey(key)) {
      (unique[key]!['history'] as List).add(r);
    } else {
      unique[key] = {
        ...r,
        'history': [r],
      };
    }
  }
  return unique.values.toList();
}

const agentNames = {
  'growth_strategist': 'Growth Manager',
  'lead_generation': 'Lead Generator',
  'workforce_recruiter': 'Workforce Recruiter',
  'marketing_manager': 'Social Manager',
  'ad_manager': 'Ad Manager',
  'business_assistant': 'Business Assistant',
};
const agentPurposes = {
  'growth_strategist': 'Coordinate your growth channels and next actions.',
  'lead_generation': 'Find and work new Business opportunities.',
  'workforce_recruiter': 'Build reliable workforce capacity.',
  'marketing_manager': 'Plan, publish and improve your social presence.',
  'ad_manager': 'Manage advertising with an approved account and budget.',
  'business_assistant':
      'Help organize and act on what your Business already knows.',
};

String recommendationDestination(Map recommendation) {
  final text = '${recommendation['summary']?['next'] ?? ''}'.toLowerCase();
  if (RegExp(r'brand|image|photo|creative').hasMatch(text)) {
    return '/business/brand-assets';
  }
  if (RegExp(r'repl|email|conversation|follow.up').hasMatch(text)) {
    return '/business/email-connection';
  }
  if (RegExp(r'social|post').hasMatch(text)) {
    return '/business/social-operations';
  }
  if (RegExp(r'job|schedule|customer').hasMatch(text)) {
    return '/business/schedule';
  }
  return '/business/growth-profile';
}

/// Specialist-specific composition. It does not own send, approval or billing authority.
class PremiumAgentWorkspace extends StatelessWidget {
  const PremiumAgentWorkspace({
    super.key,
    required this.data,
    required this.focus,
    required this.onOpen,
    required this.onResearch,
    required this.onReviewPeople,
    required this.onPerformance,
    required this.preferences,
    required this.onRecommendation,
    this.busy = false,
    this.error,
  });
  final Map<String, dynamic> data;
  final String? focus;
  final void Function(String) onOpen;
  final VoidCallback onResearch, onPerformance;
  final void Function(String, String?) onReviewPeople;
  final void Function(Map<String, dynamic>, String) onRecommendation;
  final Widget preferences;
  final bool busy;
  final String? error;

  Widget _section(BuildContext c, String title, List<Widget> children) =>
      Padding(
        padding: const EdgeInsets.only(top: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(c).textTheme.titleLarge),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      );
  Widget _action(String title, VoidCallback action, {String? detail}) => Card(
    child: ListTile(
      title: Text(title),
      subtitle: detail == null ? null : Text(detail),
      trailing: const Icon(Icons.chevron_right),
      onTap: action,
    ),
  );
  Widget _metrics(Map<String, dynamic> values) => Wrap(
    spacing: 12,
    runSpacing: 12,
    children: [
      for (final e in values.entries)
        SizedBox(
          width: 148,
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    e.value?.toString() ?? 'Unavailable',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(e.key),
                ],
              ),
            ),
          ),
        ),
    ],
  );
  String _date(BuildContext c, dynamic date) {
    // Date-only report periods are calendar dates, not UTC instants.
    final parsed = DateTime.tryParse('$date');
    return parsed == null
        ? 'Date unavailable'
        : MaterialLocalizations.of(c).formatMediumDate(parsed);
  }

  Widget _pipeline(BuildContext c, Map? pipeline) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _metrics({
        'Found': pipeline?['found'],
        'Qualified': pipeline?['qualified'],
        'Contacted': pipeline?['contacted'],
        'Replied': pipeline?['replied'],
        'Appointments': pipeline?['appointment'],
        'Estimates': pipeline?['estimate'],
        'Won': pipeline?['won'],
        'Attributed revenue': pipeline?['revenue'],
      }),
      const SizedBox(height: 8),
      const Text(
        'Stages change only from recorded relationship and outcome evidence.',
      ),
    ],
  );
  List<Widget> _people(
    BuildContext c,
    List<Map<String, dynamic>> rows,
    String type,
    String group,
  ) => [
    if (rows.isEmpty) Text('No $group recorded yet.'),
    for (final p in rows)
      _action(
        '${p['displayName']}',
        () => onReviewPeople(type, '${p['id']}'),
        detail:
            '${p['lifecycleLabel'] ?? (p['qualified'] == true ? 'Qualified' : 'Discovered')} · ${p['reason'] ?? 'Review source evidence'}',
      ),
  ];

  @override
  Widget build(BuildContext context) {
    final type = agentNames.containsKey(focus) ? focus! : 'team';
    final prospects = agentRows(data['prospects']);
    final leads = prospects
        .where(
          (p) =>
              !workforcePerson(p) &&
              !workforceChannel(p) &&
              !workforcePartner(p),
        )
        .toList();
    final people = prospects.where(workforcePerson).toList();
    final channels = prospects.where(workforceChannel).toList();
    final partners = prospects.where(workforcePartner).toList();
    final model = data['premium'] as Map? ?? {};
    final access = model['access'] as Map? ?? {};
    final social = SocialPlanPresentation(
      agentRows(data['social']?['plans']),
      const {},
    );
    final agents = agentRows(data['agents']);
    final specific = agents.where((a) => a['type'] == type).firstOrNull;
    final title = agentNames[type] ?? 'Growth Team';
    final children = <Widget>[
      Text(title, style: Theme.of(context).textTheme.headlineMedium),
      if (data['businessContext']?['businessName'] is String)
        Text(data['businessContext']['businessName']),
      const SizedBox(height: 8),
      Text(
        agentPurposes[type] ??
            'Choose the specialist for the work you want to do.',
      ),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          const Chip(label: Text('Private Beta')),
          if (type == 'business_assistant')
            const Chip(label: Text('Recommendations only')),
          if (access[type] is String) Chip(label: Text(access[type])),
        ],
      ),
      if (error != null)
        Padding(padding: const EdgeInsets.all(12), child: Text(error!)),
    ];
    if (type == 'team' || type == 'growth_strategist') {
      if (type == 'growth_strategist') {
        children.add(
          _section(context, 'Growth objective', [
            Text(
              '${data['businessContext']?['objective'] ?? 'Review your saved services, opportunities and channel results to choose the next growth action.'}',
            ),
            _action(
              'Review Business growth profile',
              () => onOpen('/business/growth-profile'),
            ),
          ]),
        );
      }
      children.addAll([
        _section(context, 'Needs Attention', [
          _action(
            'Outreach drafts',
            () => onOpen('/business/growth-agents?agent=lead_generation'),
            detail:
                '${leads.where((p) => (p['draft'] ?? '').toString().isNotEmpty && p['approvalState'] == 'awaiting_approval').length} awaiting review',
          ),
          _action(
            'Social content',
            () => onOpen('/business/social-operations?review=content'),
            detail:
                '${social.draftPosts} drafts · ${social.versionsInState('scheduled')} scheduled',
          ),
          _action(
            'Campaign replies and conversations',
            () => onOpen('/business/email-connection'),
            detail:
                '${data['outreach']?['replied'] ?? 'Unavailable'} conversations with replies',
          ),
          _action(
            'Business recommendations',
            () => onOpen('/business/growth-agents?agent=business_assistant'),
          ),
        ]),
        _section(context, 'Growth Pipeline', [
          _pipeline(context, model['overall'] as Map?),
        ]),
        _section(context, 'Agent Team', [
          for (final a in agents.where(
            (a) => a['type'] != 'growth_strategist' || type == 'team',
          ))
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      agentNames[a['type']] ?? 'Specialist',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(agentPurposes[a['type']] ?? ''),
                    const SizedBox(height: 8),
                    Text('${a['status'] ?? 'No recorded status'}'),
                    Text('${a['result'] ?? 'No recorded result'}'),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: () => onOpen(
                        a['type'] == 'marketing_manager'
                            ? '/business/social-operations'
                            : '/business/growth-agents?agent=${a['type']}',
                      ),
                      child: Text(
                        'Open ${agentNames[a['type']] ?? 'Workspace'}',
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ]),
      ]);
    } else if (type == 'lead_generation') {
      children.addAll([
        _section(context, 'Opportunity Pipeline', [
          _pipeline(context, model['leads'] as Map?),
        ]),
        _section(context, 'Needs Review', [
          _action(
            'Review Prospects',
            () => onReviewPeople(type, null),
            detail: '${leads.length} sourced prospects',
          ),
        ]),
        _section(
          context,
          'Outreach Drafts',
          _people(
            context,
            leads
                .where(
                  (p) =>
                      (p['draft'] ?? '').toString().isNotEmpty &&
                      p['approvalState'] != 'do_not_contact',
                )
                .toList(),
            type,
            'outreach drafts',
          ),
        ),
        _section(
          context,
          'Active Prospects',
          _people(
            context,
            leads.where((p) => p['doNotContact'] != true).toList(),
            type,
            'active prospects',
          ),
        ),
        _section(context, 'Replies / Follow-ups', [
          _action(
            'Open Conversations',
            () => onOpen('/business/email-connection'),
            detail:
                'Review actual replies and the next recorded action. No automatic follow-ups.',
          ),
        ]),
        _section(context, 'Sources / Search Settings', [
          FilledButton.icon(
            onPressed: busy ? null : onResearch,
            icon: const Icon(Icons.search),
            label: Text(busy ? 'Checking sources…' : 'Check for New Leads'),
          ),
          Text(
            'Saved services: ${(data['businessContext']?['services'] as List? ?? []).join(', ')}',
          ),
          Text(
            'Service areas: ${(data['businessContext']?['maintainedAreas'] as List? ?? []).join(', ')}',
          ),
          preferences,
        ]),
      ]);
    } else if (type == 'workforce_recruiter') {
      final w = model['workforce'] as Map?;
      children.addAll([
        _section(context, 'Workforce Pipeline', [
          _metrics({
            'Candidates': people.length,
            'Qualified': w?['qualified'],
            'Contacted': w?['contacted'],
            'Replied': w?['replied'],
            'Available': w?['available'],
            'Signed up': w?['signup'],
            'Activated': w?['activated'],
            'Used / hired': w?['hired'],
          }),
        ]),
        _section(
          context,
          'Individual Candidates',
          _people(context, people, type, 'individual candidates'),
        ),
        _section(
          context,
          'Recruitment Channels',
          _people(context, channels, type, 'recruitment channels'),
        ),
        _section(
          context,
          'Recruitment Partners',
          _people(context, partners, type, 'recruitment partners'),
        ),
        _section(context, 'Service-area workforce gaps', [
          const Text(
            'A sourced organization is not an available worker. Capacity gaps remain unverified until actual worker availability and demand are recorded.',
          ),
          Text(
            'Research areas: ${(data['businessContext']?['maintainedAreas'] as List? ?? []).join(', ')}',
          ),
          FilledButton(
            onPressed: busy ? null : onResearch,
            child: const Text('Check Recruiting Sources'),
          ),
        ]),
      ]);
    } else if (type == 'ad_manager') {
      final ad = model['ads'] as Map? ?? {};
      children.addAll([
        _section(
          context,
          ad['noConnectedAccount'] == true
              ? 'No ScaledCircle advertising running'
              : 'Advertising status',
          [
            for (final account in agentRows(ad['accounts']))
              Text(
                '${account['name']}: ${account['status'] == 'connected'
                    ? 'Connected'
                    : account['status'] == 'not_connected'
                    ? 'Not connected'
                    : 'Needs attention'}',
              ),
            _metrics({
              'Approved budget': ad['approvedBudget'],
              'Spend': ad['spend'],
              'Campaigns': ad['activeCampaigns'],
              'Leads': ad['leads'],
              'Conversions': ad['conversions'],
            }),
            Text(
              'Saved preference: ${data['businessContext']?['adBudget'] ?? 'Not provided'}. A preference is not spending approval.',
            ),
            _action(
              'Review account and advertising preference',
              () => onOpen('/business/growth-profile'),
            ),
            _action('Review Organic Results', onPerformance),
            const Text(
              'No advertising is launched from this workspace. A supported account and an explicit approved budget are required before execution.',
            ),
          ],
        ),
        _section(context, 'Approval Queue', const [
          Text(
            'No executable advertising approvals are available. Strategy recommendations do not authorize spend.',
          ),
        ]),
      ]);
    } else if (type == 'business_assistant') {
      final reports = distinctAgentRecommendations(data['reports']);
      final reviews = agentRows(model['recommendationReviews']);
      children.addAll([
        _section(context, 'Needs Attention', [
          _action(
            'Customer / Lead Follow-ups',
            () => onOpen('/business/customers'),
          ),
          _action('Profile / setup', () => onOpen('/business/growth-profile')),
          _action('Operational tasks', () => onOpen('/business/schedule')),
        ]),
        _section(context, 'Business Recommendations', [
          const Text(
            'Recommendations from your saved Business context. Interactive Q&A is not enabled in this workspace.',
          ),
          if (reports.isEmpty) const Text('No saved recommendations yet.'),
          for (final r in reports)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _date(context, r['period']),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      'What we noticed: ${r['summary']?['learned'] ?? 'Review your saved Business context.'}',
                    ),
                    Text(
                      'Why it matters: ${r['summary']?['why'] ?? 'Resolve the recorded next step before expanding activity.'}',
                    ),
                    Text(
                      'Recommended action: ${r['summary']?['next'] ?? specific?['nextAction'] ?? 'Review your Business setup.'}',
                    ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton(
                          onPressed: () => onOpen(recommendationDestination(r)),
                          child: const Text('Take Action'),
                        ),
                        if (!reviews.any(
                          (x) => (r['history'] as List).any(
                            (h) => h['id'] == x['reportId'],
                          ),
                        ))
                          TextButton(
                            onPressed: busy
                                ? null
                                : () => onRecommendation(r, 'reviewed'),
                            child: const Text('Mark Reviewed'),
                          )
                        else
                          const Chip(label: Text('Reviewed')),
                        if (!reviews.any(
                          (x) => (r['history'] as List).any(
                            (h) => h['id'] == x['reportId'],
                          ),
                        ))
                          TextButton(
                            onPressed: busy
                                ? null
                                : () => onRecommendation(r, 'dismissed'),
                            child: const Text('Dismiss'),
                          ),
                      ],
                    ),
                    if ((r['history'] as List).length > 1)
                      ExpansionTile(
                        title: Text(
                          '${(r['history'] as List).length} reports in history',
                        ),
                        children: [
                          for (final h in r['history'])
                            ListTile(title: Text(_date(context, h['period']))),
                        ],
                      ),
                  ],
                ),
              ),
            ),
        ]),
      ]);
    }
    return ListView(padding: const EdgeInsets.all(20), children: children);
  }
}
