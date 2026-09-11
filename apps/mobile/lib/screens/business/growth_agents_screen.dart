import '../../models/social_plan_presentation.dart';
import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'growth_territories_dialog.dart';
import '../../navigation/context_back_button.dart';
import '../../navigation/app_router.dart';
import '../../widgets/customer_page_body.dart';
import '../../widgets/growth_opportunity_preferences_card.dart';

class GrowthAgentsScreen extends StatefulWidget {
  const GrowthAgentsScreen({
    super.key,
    this.focusId,
    this.loadOverride,
    this.customer = false,
  });
  final bool customer;
  final String? focusId;
  final Future<Map<String, dynamic>> Function()? loadOverride;
  @override
  State<GrowthAgentsScreen> createState() => _GrowthAgentsScreenState();
}

class _GrowthAgentsScreenState extends State<GrowthAgentsScreen> {
  Map<String, dynamic>? _data;
  int _loadGeneration = 0;
  String? _error;
  bool _busy = false;
  Timer? _timer;
  List<Map<String, dynamic>> _list(dynamic value) => (value as List? ?? [])
      .whereType<Map>()
      .map((x) => Map<String, dynamic>.from(x))
      .toList();
  Future<Map<String, dynamic>> _call(
    String name, [
    Map<String, dynamic>? input,
  ]) async {
    if (widget.customer) {
      const operations = {
        'getGrowthDogfoodWorkspaceV1': 'load',
        'runGrowthDogfoodResearchV1': 'research',
        'updateGrowthCommunicationPreferencesV1': 'preferences',
        'reviewGrowthProspectV1': 'review',
        'initializeCustomerGrowth': 'initialize',
      };
      final operation = operations[name];
      if (operation == null) throw StateError('Unsupported customer action');
      input = {'operation': operation, 'input': ?input};
      name = 'customerGrowthOperationsV1';
    }
    final response = await FirebaseFunctions.instanceFor(region: 'us-east1')
        .httpsCallable(name)
        .call(input ?? {})
        .timeout(const Duration(seconds: 175));
    return Map<String, dynamic>.from(response.data as Map);
  }

  void _socialChanged() {
    if (!mounted) return;
    setState(() => _data = null);
    _load();
  }

  @override
  void initState() {
    super.initState();
    socialReviewRevision.addListener(_socialChanged);
    _load();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (!_busy && ModalRoute.of(context)?.isCurrent == true) _load();
    });
  }

  @override
  void dispose() {
    socialReviewRevision.removeListener(_socialChanged);
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_loadGeneration;
    try {
      final data =
          await (widget.loadOverride?.call() ??
              _call('getGrowthDogfoodWorkspaceV1'));
      if (mounted && generation == _loadGeneration) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted && generation == _loadGeneration) {
        setState(
          () => _error = widget.customer
              ? 'Unable to load your Growth workspace. Use your invited Business account with an active Managed Growth membership, then retry.'
              : 'Unable to load this private workspace. Sign in as the ScaledCircle dogfood Admin, then retry.',
        );
      }
    }
  }

  Future<void> _action(String name, [Map<String, dynamic>? input]) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _call(name, input);
      await _load();
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(
          () => _error = widget.customer
              ? 'The result could not be confirmed. Refresh saved activity before trying again. No outreach is authorized by this message.'
              : e.message ?? 'Action held. Retry to check saved state.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Result not confirmed. Refresh to check saved state before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _time(dynamic value) => value is num
      ? DateTime.fromMillisecondsSinceEpoch(
          value.toInt(),
        ).toLocal().toString().split('.').first
      : 'Not recorded';
  Widget _line(String title, dynamic value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Text('$title: ${value ?? 'Unknown'}'),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: widget.customer
          ? const ContextBackButton(
              fallback: '/business/growth',
              businessOnly: true,
            )
          : const ContextBackButton(fallback: '/admin'),
      title: Text(widget.customer ? _specialistTitle : 'Growth Agents'),
      actions: [
        IconButton(
          onPressed: _busy ? null : _load,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh saved activity',
        ),
      ],
    ),
    body: _data == null
        ? Center(
            child: _error == null
                ? const Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 12),
                      Text('Checking your Growth team…'),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(_error!),
                      ),
                      FilledButton(
                        onPressed: _load,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
          )
        : CustomerPageBody(child: _content(context)),
  );
  String get _specialistTitle =>
      const {
        'growth_strategist': 'Growth Manager',
        'lead_generation': 'Lead Generator',
        'workforce_recruiter': 'Workforce Recruiter',
        'ad_manager': 'Ad Manager',
        'business_assistant': 'Business Assistant',
      }[widget.focusId] ??
      'Growth Team';

  String _group(Map<String, dynamic> p) => switch (p['opportunityType']) {
    'public_bid' => 'Public procurement / bid opportunities',
    'direct_project' || 'commercial' => 'Direct project opportunities',
    'property_facility' ||
    'property_management' => 'Property / facility / HOA prospects',
    'residential_signal' => 'Residential opportunity signals',
    'workforce_candidate' => 'Individual candidates',
    'recruitment_channel' => 'Recruitment partners',
    'partner_channel' => 'Partner / referral channels',
    'paid_lead_source' => 'Paid lead sources',
    _ =>
      p['kind'] == 'scaler'
          ? 'Individual candidates'
          : p['kind'] == 'referral_partner'
          ? 'Recruitment partners'
          : 'High-fit accounts',
  };
  Widget _content(BuildContext context) {
    final d = _data!, s = Map<String, dynamic>.from(d['summary'] as Map? ?? {});
    final prospects = _list(d['prospects']);
    if (widget.focusId != null) {
      prospects.sort(
        (a, b) => (b['id'] == widget.focusId ? 1 : 0).compareTo(
          a['id'] == widget.focusId ? 1 : 0,
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          widget.customer
              ? '${d['businessContext']?['businessName'] ?? 'Your Business'} · Private Beta'
              : 'ScaledCircle · Private dogfood',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        const Text(
          'Review what your team found and choose the next step. Research does not send messages, launch ads or approve Social posts.',
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(_error!, style: const TextStyle(color: Colors.red)),
          ),
        const SizedBox(height: 18),
        if (widget.customer && d['initialized'] != true)
          FilledButton(
            onPressed: _busy ? null : () => _action('initializeCustomerGrowth'),
            child: const Text('Activate research and drafts'),
          ),
        if (!widget.customer && d['workspace'] is Map)
          OutlinedButton(
            onPressed: _busy
                ? null
                : () async {
                    final workspace = Map<String, dynamic>.from(
                      d['workspace'] as Map,
                    );
                    if (workspace['registered'] != true) {
                      await _action('configureInternalGrowthWorkspaceV1', {
                        'action': 'register',
                      });
                      return;
                    }
                    await showDialog<bool>(
                      context: context,
                      builder: (_) => GrowthTerritoriesDialog(
                        scope: Map<String, dynamic>.from(
                          workspace['scope'] as Map,
                        ),
                        call: (input) =>
                            _call('configureInternalGrowthWorkspaceV1', input),
                      ),
                    );
                    await _load();
                  },
            child: Text(
              (d['workspace'] as Map)['registered'] == true
                  ? 'Growth territories'
                  : 'Register internal Growth workspace',
            ),
          ),
        Text(
          'Needs attention: ${s['awaitingApproval'] ?? 0} drafts',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        if (widget.customer && s['opportunityGroups'] is List)
          ..._list(
            s['opportunityGroups'],
          ).map((g) => _line(g['label'].toString(), g['count']))
        else ...[
          _line('Business prospects', s['businessesFound']),
          _line('Organization partner prospects', s['partnersFound']),
          _line('Individual Scaler candidates', s['individualScalersFound']),
        ],
        _line('Recommended next', s['next']),
        const SizedBox(height: 18),
        Text(
          'Discovery by service area',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (s['serviceAreaStatus'] != 'AVAILABLE')
          const Text(
            'Service-area priority is not configured for this workspace. Existing prospects and their source history are preserved.',
          )
        else
          _line(
            'Priority',
            (s['serviceAreaPriority'] as List? ?? []).join(' → '),
          ),
        ..._list(s['discoveryByServiceArea']).map(
          (area) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              '${area['serviceArea']}\n${widget.customer && area['opportunityGroups'] is List ? _list(area['opportunityGroups']).map((g) => '${g['count']} ${g['label']}').join(' · ') : '${area['businesses']} Business prospects · ${area['partners']} organization partners · ${area['individualScalers']} individual Scalers'}\n${area['qualified'] ?? 0} qualified · ${area['drafts'] ?? 0} drafts\nLatest cycle: ${area['researched'] ?? 'No Data'} source checks · ${area['unavailable'] ?? 'No Data'} unavailable',
            ),
          ),
        ),
        const SizedBox(height: 16),
        ..._list(d['agents']).map(
          (a) => Card(
            child: ExpansionTile(
              initiallyExpanded: a['type'] == widget.focusId,
              title: Text(a['name'].toString()),
              subtitle: Text(a['status'].toString()),
              childrenPadding: const EdgeInsets.all(16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _line('Last action', a['lastAction']),
                _line('Result', a['result']),
                _line('Next action', a['nextAction']),
                const Text('External action needs approval'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: _busy || (widget.customer && d['initialized'] != true)
              ? null
              : () => _action('runGrowthDogfoodResearchV1'),
          icon: const Icon(Icons.search),
          label: Text(
            _busy
                ? 'Checking official sources…'
                : 'Check for new opportunities',
          ),
        ),
        if (!widget.customer)
          _line(
            'Upcoming official-source recheck',
            _time(d['nextResearchAfter']),
          ),
        Text(
          widget.customer
              ? 'Checks official sources using your saved services and service areas. Repeating today’s action returns the saved cycle, not duplicate prospects.'
              : 'The maintained source pool is rechecked daily. A recheck is not counted as a new prospect.',
        ),
        if (widget.customer) ..._customerOverview(d),
        const SizedBox(height: 24),
        GrowthOpportunityPreferencesCard(
          values: Map<String, dynamic>.from(
            d['preferences']?['opportunities'] as Map? ?? {},
          ),
          onSave: (values) async {
            await _call('updateGrowthCommunicationPreferencesV1', {
              'opportunities': values,
            });
            await _load();
          },
        ),
        if (_list(d['excludedProspects']).isNotEmpty)
          ExpansionTile(
            title: const Text('Excluded by Growth Preferences'),
            subtitle: const Text(
              'Historical evidence · Not active recommendations',
            ),
            children: [
              for (final prospect in _list(d['excludedProspects']))
                ListTile(
                  title: Text('${prospect['displayName']}'),
                  subtitle: Text('Source preserved: ${prospect['sourceUrl']}'),
                ),
            ],
          ),
        Text(
          'Review opportunities',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        if (prospects.isEmpty)
          const Text(
            'No sourced opportunities yet. Check your saved services and service areas, then check for new opportunities.',
          ),
        if (!prospects.any((p) => _group(p) == 'Individual candidates'))
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'No verified individual candidates yet. Recruitment and referral partners are listed separately.',
            ),
          ),
        for (final group in prospects.map(_group).toSet()) ...[
          Padding(
            padding: const EdgeInsets.only(top: 24, bottom: 12),
            child: Text(group, style: Theme.of(context).textTheme.titleMedium),
          ),
          ...prospects
              .where((p) => _group(p) == group)
              .map(
                (p) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Card(
                    child: ExpansionTile(
                      key: ValueKey(p['id']),
                      initiallyExpanded: p['id'] == widget.focusId,
                      title: Text(p['displayName'].toString()),
                      subtitle: Text(
                        '${p['opportunityLabel'] ?? (p['kind'] == 'business'
                                ? 'Business prospect'
                                : p['kind'] == 'scaler'
                                ? 'Workforce candidate'
                                : 'Organization referral partner')} · ${p['geography']}',
                      ),
                      childrenPadding: const EdgeInsets.all(16),
                      expandedCrossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _line('Why it fits', p['reason']),
                        _line('Confidence', p['confidence']),
                        _line('Possible use', p['useCase']),
                        if (widget.customer) ...[
                          _line(
                            'Project / need',
                            p['currentOpportunity'] == true
                                ? 'Specific published requirement — eligibility needs review'
                                : 'Buying intent / current availability unknown',
                          ),
                          if (p['sourceRecordId'] != p['sourceUrl'])
                            _line('Public reference', p['sourceRecordId']),
                          if (p['deadline'] != null)
                            _line('Published deadline', p['deadline']),
                          _line('What we do not know', p['unknowns']),
                          if (p['ranking'] is Map)
                            ExpansionTile(
                              title: const Text('Why this ranks here'),
                              children: [
                                for (final factor in _list(
                                  p['ranking']['factors'],
                                ))
                                  ListTile(
                                    title: Text('${factor['label']}'),
                                    subtitle: Text('${factor['reason']}'),
                                  ),
                              ],
                            ),
                        ],
                        _line('Email', p['email']),
                        _line('Phone', p['phone']),
                        if (_group(p) == 'Individual candidates') ...[
                          _line('Individual skills', p['skills']),
                          _line('Transportation', p['transportation']),
                          _line('Availability', p['availability']),
                        ],
                        TextButton(
                          onPressed: () => launchUrl(
                            Uri.parse(p['sourceUrl'].toString()),
                            mode: LaunchMode.externalApplication,
                          ),
                          child: const Text('Open public source'),
                        ),
                        _line('Source checked', _time(p['lastCheckedAt'])),
                        _line('Recommended channel', p['recommendedChannel']),
                        _line('Recommended CTA', p['recommendedCta']),
                        _line('Last action', p['lastAction']),
                        _line('Result', p['result']),
                        _line('Next action', p['nextAction']),
                        const SizedBox(height: 8),
                        const Text(
                          'Proposed outreach — not sent',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        SelectableText(
                          p['draft']?.toString() ??
                              'More source review required.',
                        ),
                        const SizedBox(height: 12),
                        Text(
                          p['approvalState'] == 'awaiting_approval'
                              ? (widget.customer
                                    ? 'Needs your approval'
                                    : 'Needs Founder approval')
                              : p['approvalState'] == 'do_not_contact'
                              ? 'Do not contact'
                              : p['approvalState'] == 'ready_for_founder_send'
                              ? 'Reviewed · external contact still held'
                              : 'Research required',
                        ),
                        if (p['approvalState'] == 'awaiting_approval')
                          Wrap(
                            spacing: 12,
                            children: [
                              OutlinedButton(
                                onPressed: _busy
                                    ? null
                                    : () => _action('reviewGrowthProspectV1', {
                                        'prospectId': p['id'],
                                        'decision': 'ready_for_founder_send',
                                      }),
                                child: const Text(
                                  'Mark reviewed — do not send',
                                ),
                              ),
                              TextButton(
                                onPressed: _busy
                                    ? null
                                    : () => _action('reviewGrowthProspectV1', {
                                        'prospectId': p['id'],
                                        'decision': 'do_not_contact',
                                      }),
                                child: const Text('Do not contact'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
              ),
        ],
        const SizedBox(height: 24),
        Text(
          'Completed activity',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        ..._list(d['runs']).map(
          (r) => ListTile(
            title: Text('${r['sourceChecks'] ?? 0} official sources checked'),
            subtitle: Text(
              '${_time(r['createdAt'])} · ${r['result'] ?? r['status']}\nSources unavailable: ${r['unavailableSources'] ?? 0}. Unavailable sources are not treated as verified prospects.',
            ),
          ),
        ),
        const SizedBox(height: 20),
        ExpansionTile(
          title: const Text('Growth notifications'),
          subtitle: Text(
            widget.customer
                ? 'Saved alerts for your Business'
                : 'Saved alerts from this internal workspace',
          ),
          children: _list(d['notifications'])
              .map(
                (n) => ListTile(
                  title: Text('${n['title']}'),
                  subtitle: Text('${n['message']}\n${_time(n['createdAt'])}'),
                ),
              )
              .toList(),
        ),
        Text('Reports', style: Theme.of(context).textTheme.titleLarge),
        ..._list(d['reports']).map(
          (r) => Card(
            child: ExpansionTile(
              key: ValueKey(r['id']),
              initiallyExpanded: r['id'] == widget.focusId,
              title: Text(
                '${r['kind'] == 'daily' ? 'Daily brief' : 'Weekly report'} · ${r['period']}',
              ),
              childrenPadding: const EdgeInsets.all(16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(r['scope'].toString()),
                _line('What we learned', r['summary']['learned']),
                _line('Next', r['summary']['next']),
                ..._list(r['summary']['discoveryByServiceArea']).map(
                  (area) => _line(
                    area['serviceArea'].toString(),
                    '${area['businesses']} Business prospects · ${area['partners']} organization partners · ${area['individualScalers']} individual Scalers',
                  ),
                ),
                const Text(
                  'Contacted: 0 · Replies, meetings, signups, paid conversions: No Data. No performance result is inferred from research.',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        DropdownButtonFormField<String>(
          key: ValueKey(d['preferences']['mode']),
          initialValue: d['preferences']['mode'] as String,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Agent email updates'),
          items: const [
            DropdownMenuItem(value: 'off', child: Text('Off')),
            DropdownMenuItem(value: 'important', child: Text('Important only')),
            DropdownMenuItem(value: 'daily', child: Text('Daily + important')),
            DropdownMenuItem(
              value: 'weekly',
              child: Text('Weekly + important'),
            ),
            DropdownMenuItem(
              value: 'daily_weekly',
              child: Text('Daily + weekly + important'),
            ),
          ],
          onChanged: _busy
              ? null
              : (mode) {
                  if (mode != null) {
                    _action('updateGrowthCommunicationPreferencesV1', {
                      'mode': mode,
                    });
                  }
                },
        ),
        const SizedBox(height: 14),
        const Text(
          'Learning: No verified conversion evidence yet. Recommendations use sourced local facts with limited confidence. Private tenant records are never shared between Businesses.',
        ),
      ],
    );
  }

  List<Widget> _customerOverview(Map<String, dynamic> d) {
    final social = Map<String, dynamic>.from(d['social'] as Map? ?? {});
    return [
      const SizedBox(height: 24),
      Text(
        'Social strategy and baseline',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      _line(
        'Plan status',
        social['review']?['title'] ?? 'Checking saved status',
      ),
      _line('Saved provider baselines', _list(social['baselines']).length),
      for (final baseline in _list(social['baselines']))
        ExpansionTile(
          title: Text(
            '${baseline['provider'] == 'facebook' ? 'Facebook' : 'Instagram'} baseline',
          ),
          subtitle: Text(
            'Observed: ${baseline['observedAt'] ?? 'Not recorded'}',
          ),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final entry in (baseline['metrics'] as Map? ?? {}).entries)
              _line(
                _metricName(entry.key.toString()),
                entry.value is Map
                    ? (entry.value['value'] ?? 'Unavailable')
                    : 'Unavailable',
              ),
            _line(
              'Recent provider posts observed',
              _list(baseline['latest']).length,
            ),
            const Text(
              'Provider metrics keep their original period. Missing values remain unavailable; reach is not summed across days.',
            ),
          ],
        ),
      const Text(
        'Existing account history belongs to your Business. It is not counted as ScaledCircle publication.',
      ),
      OutlinedButton(
        onPressed: () => AppNavigation.push(
          context,
          social['review']?['destination']?.toString() ??
              '/business/social-operations',
        ),
        child: Text(
          social['review']?['planApprovalState'] == 'approved'
              ? 'Review Draft Posts'
              : 'Review 30-Day Plan',
        ),
      ),
      const SizedBox(height: 16),
      Text(
        'Case-study progress',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const Text(
        'Prospects: Found → Qualified → Contacted → Appointment → Estimate → Won → Attributed Revenue',
      ),
      const SizedBox(height: 8),
      const Text(
        'Workforce: Found → Qualified → Contacted → Available → Used / Hired',
      ),
      const SizedBox(height: 8),
      const Text(
        'Social: Baseline → Published → Reach and engagement → Attributed traffic and leads',
      ),
      const SizedBox(height: 8),
      const Text(
        'Contacted: 0. Appointments, estimates, won work, hires and attributed revenue: No Data. Research is not a sale or a hire.',
      ),
    ];
  }

  String _metricName(String key) =>
      const {
        'followers': 'Followers',
        'impressions': 'Impressions',
        'views': 'Views',
        'reach': 'Reach',
        'mediaCount': 'Account media count',
        'page_media_view': 'Page media views',
        'page_post_engagements': 'Page post engagements',
        'page_views_total': 'Page views',
        'total_interactions': 'Interactions',
        'profile_links_taps': 'Profile link taps',
      }[key] ??
      'Other provider metric';
}
