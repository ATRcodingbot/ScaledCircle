import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import '../../widgets/social_performance_panel.dart';
import '../../models/social_plan_presentation.dart';
import '../../models/growth_read_failure.dart';
import '../../services/business_email_service.dart';
import '../../services/business_workspace_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../widgets/business_email_entry.dart';
import '../../widgets/growth_prospect_email_action.dart';
import '../../widgets/growth_relationship_counts.dart';
import 'business_email_screen.dart';
import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'growth_territories_dialog.dart';
import '../../navigation/context_back_button.dart';
import '../../navigation/app_router.dart';
import '../../widgets/customer_page_body.dart';
import '../../widgets/growth_opportunity_preferences_card.dart';
import '../../widgets/premium_agent_workspace.dart';
import 'business_growth_profile_wizard.dart';

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
  Map<String, dynamic>? _mailbox;
  int _loadGeneration = 0;
  String? _error;
  bool _busy = false;
  Timer? _timer;
  final _opportunitiesKey = GlobalKey();
  final _reportsKey = GlobalKey();
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
        'reviewRecommendation': 'reviewRecommendation',
      };
      final operation = operations[name];
      if (operation == null) throw StateError('Unsupported customer action');
      input = {
        'operation': operation,
        'input': ?input,
        'businessId': BusinessWorkspaceSession.businessIdFor(
          FirebaseAuth.instance.currentUser!.uid,
        ),
      };
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
      Map<String, dynamic>? mailbox;
      if (widget.loadOverride == null) {
        try {
          mailbox = await BusinessEmailService().availability();
        } catch (_) {
          /* Private beta may be unavailable. */
        }
      }
      if (mounted && generation == _loadGeneration) {
        setState(() {
          _data = data;
          _mailbox = mailbox;
          _error = null;
        });
      }
    } catch (error) {
      if (mounted && generation == _loadGeneration) {
        setState(
          () => _error = growthReadFailure(
            error,
            privateWorkspace: !widget.customer,
          ),
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

  String _time(dynamic value) {
    final raw = value is num
        ? DateTime.fromMillisecondsSinceEpoch(
            value.toInt(),
            isUtc: true,
          ).toIso8601String()
        : value?.toString();
    return DateTime.tryParse(raw ?? '') == null
        ? 'Not recorded'
        : socialCustomerTime(
            context,
            raw,
            label:
                _data?['timeLabels']?[DateTime.parse(
                  raw!,
                ).toUtc().toIso8601String()],
          );
  }

  bool _pastEligibility(dynamic value) {
    final date = value is num
        ? DateTime.fromMillisecondsSinceEpoch(value.toInt(), isUtc: true)
        : DateTime.tryParse('$value');
    return date != null && date.isBefore(DateTime.now());
  }

  Future<void> _research() async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Check for new opportunities?'),
        content: const Text(
          'This researches official sources using your saved services and service areas. It may return the current saved cycle. It will not email, message or call anyone, launch ads, or approve Social content.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Check Sources'),
          ),
        ],
      ),
    );
    if (approved == true && mounted) {
      await _action('runGrowthDogfoodResearchV1');
    }
  }

  void _performance() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          appBar: AuthenticatedAppBar(title: const Text('Social Performance')),
          body: CustomerPageBody(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: _customerOverview(_data!),
            ),
          ),
        ),
      ),
    );
  }

  void _recommendations() {
    final reports = _list(_data?['reports']);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          appBar: AuthenticatedAppBar(
            title: Text('$_specialistTitle · Recommendations'),
          ),
          body: CustomerPageBody(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (reports.isEmpty)
                  const Text(
                    'No saved recommendations yet. Return to the manager and check for new opportunities. Research does not contact anyone.',
                  ),
                for (final r in reports)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${r['period']}'),
                          Text(
                            '${r['summary']?['learned'] ?? 'No recorded result'}',
                          ),
                          Text(
                            'Next: ${r['summary']?['next'] ?? 'Review the next research cycle'}',
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _reviewPeople(String type, [String? prospectId]) {
    final rows = _list(_data?['prospects'])
        .where(
          (p) => type == 'workforce_recruiter'
              ? p['kind'] == 'scaler' ||
                    p['kind'] == 'referral_partner' ||
                    p['opportunityType'] == 'recruitment_channel'
              : p['kind'] != 'scaler' &&
                    p['opportunityType'] != 'recruitment_channel',
        )
        .where(
          (p) => prospectId == null
              ? p['freshOutreachEligible'] != false
              : p['id'] == prospectId,
        )
        .toList();
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          type == 'workforce_recruiter'
              ? 'Candidates and Recruiting Channels'
              : 'Review Leads',
        ),
        content: SizedBox(
          width: 640,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (rows.isEmpty)
                  const Text('No eligible sourced records yet.'),
                for (final p in rows)
                  ExpansionTile(
                    title: Text('${p['displayName']}'),
                    subtitle: Text(
                      '${p['relationshipLabel'] ?? ''} · ${p['lifecycleLabel'] ?? 'Review source evidence'}',
                    ),
                    children: [
                      if (p['pipelineStages'] is List)
                        Text((p['pipelineStages'] as List).join(' → ')),
                      Text(
                        'Last action: ${p['lastAction'] ?? 'No recorded action'}\nResult: ${p['result'] ?? 'Unavailable'}\nNext: ${p['nextContactAction'] ?? p['nextAction'] ?? 'Review evidence'}',
                      ),
                      if (p['freshOutreachEligible'] != false)
                        SelectableText(
                          '${p['draft'] ?? 'Draft not prepared yet'}',
                        ),
                      TextButton(
                        onPressed: () => launchUrl(
                          Uri.parse('${p['sourceUrl']}'),
                          mode: LaunchMode.externalApplication,
                        ),
                        child: const Text('View Evidence'),
                      ),
                      if (_mailbox != null &&
                          p['emailEligibility'] == 'eligible' &&
                          p['qualified'] == true &&
                          p['doNotContact'] != true &&
                          p['sourceAvailable'] == true &&
                          p['email'] is String)
                        BusinessEmailDraftButton(
                          mailbox: _mailbox!,
                          onChanged: _load,
                          prospect: p,
                        ),
                      GrowthProspectEmailAction(prospect: p, mailbox: _mailbox),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () async {
                                await _action('reviewGrowthProspectV1', {
                                  'prospectId': p['id'],
                                  'decision': 'do_not_contact',
                                });
                                if (context.mounted) Navigator.pop(context);
                              },
                        child: const Text('Do Not Contact'),
                      ),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () async {
                                await _action('reviewGrowthProspectV1', {
                                  'prospectId': p['id'],
                                  'decision': 'ready_for_founder_send',
                                });
                                if (context.mounted) Navigator.pop(context);
                              },
                        child: const Text('Mark Reviewed — Don’t Send'),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Back'),
          ),
        ],
      ),
    );
  }

  Widget _managerActions(
    Map<String, dynamic> agent,
    Map<String, dynamic> data,
  ) {
    final type = agent['type']?.toString();
    final label = const {
      'lead_generation': 'Review Leads',
      'workforce_recruiter': 'Review Candidates / Recruiting Channels',
      'marketing_manager': 'Review Content',
      'ad_manager': 'Open Ad Manager',
      'business_assistant': 'Open Business Assistant',
      'growth_strategist': 'Review Growth Plan',
    }[type];
    if (label == null) return const SizedBox.shrink();
    void open() {
      if (type == 'marketing_manager') {
        AppNavigation.push(
          context,
          '/business/social-operations?review=content',
        );
        return;
      }
      if (widget.focusId == type) {
        if (type == 'lead_generation' || type == 'workforce_recruiter') {
          _reviewPeople(type!);
        } else {
          _recommendations();
        }
        return;
      }
      AppNavigation.push(context, '/business/growth-agents?agent=$type');
    }

    return Wrap(
      spacing: 12,
      runSpacing: 8,
      children: [
        FilledButton(onPressed: open, child: Text(label)),
        if (type == 'marketing_manager' || type == 'ad_manager')
          OutlinedButton(
            onPressed: _performance,
            child: Text(
              type == 'ad_manager'
                  ? 'Review Organic Results'
                  : 'View Performance',
            ),
          ),
        if (type == 'business_assistant')
          OutlinedButton(
            onPressed: _recommendations,
            child: const Text('Review Recommendations'),
          ),
      ],
    );
  }

  Widget _line(String title, dynamic value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Text('$title: ${value ?? 'Unknown'}'),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AuthenticatedAppBar(
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
  Widget _discoveryStatus(Map<String, dynamic> data) {
    final summary = data['summary'] is Map ? data['summary'] as Map : const {};
    final discovery = summary['discovery'] is Map
        ? summary['discovery'] as Map
        : const {};
    final failure = discovery['failure'] is Map
        ? discovery['failure'] as Map
        : const {};
    final state = switch (discovery['state']) {
      'failed' => 'Failed',
      'partial' => 'Partial — some requests failed',
      'processed' => 'Processing completed — inspect qualified results',
      'running' => 'Running',
      _ => 'Unknown',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _line('Fresh discovery', state),
        if (failure.isNotEmpty)
          _line(
            'Blocked stage',
            '${failure['stage']} — ${failure['reason'] ?? failure['code']}',
          ),
        _line(
          'Last successful processing',
          _time(discovery['lastSuccessfulProcessingAt']),
        ),
        _line(
          'Last genuinely new prospect',
          _time(discovery['lastNewProspectAt']),
        ),
        _line(
          'Latest cycle new qualified prospects',
          discovery['newQualified'],
        ),
        _line('Existing prospects rechecked', discovery['rechecked']),
        _line('Parsed candidates', discovery['candidatesParsed']),
        _line('Evidence exclusions', discovery['evidenceExcluded']),
        _line('Suppressed sources', discovery['suppressed']),
        _line('Discovery source failures', discovery['sourceFailures']),
        const Text(
          'Inventory is cumulative. Freshness uses up to 250 retained records; unknown is not zero. Catalog rechecks are not fresh discovery.',
        ),
      ],
    );
  }

  Widget _internalResearchStatus(Map<String, dynamic> data) {
    final runs = _list(data['runs'])
      ..sort(
        (a, b) => ((b['createdAt'] as num?) ?? 0).compareTo(
          (a['createdAt'] as num?) ?? 0,
        ),
      );
    final latest = runs.isEmpty ? <String, dynamic>{} : runs.first;
    final status = data['researchPaused'] == true
        ? 'Paused'
        : switch (latest['status']) {
            'completed' => 'Cycle completed — inspect discovery results',
            'running' => 'Running',
            'failed' || 'held' => 'Needs attention',
            _ => 'No completed cycle recorded',
          };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'ScaledCircle research activity',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            _line('Status', status),
            _discoveryStatus(data),
            _line(
              'Last run',
              _time(latest['completedAt'] ?? latest['createdAt']),
            ),
            _line('Result', latest['result']),
            _line('New opportunities', latest['newProspectCount']),
            _line('Duplicates suppressed', latest['duplicatesExcludedCount']),
            _line('Source checks', latest['sourceChecks']),
            _line('Unavailable sources', latest['unavailableSources']),
            _line(
              'Next eligible run',
              data['researchPaused'] == true
                  ? 'Paused'
                  : _time(data['nextResearchAfter']),
            ),
            const Text(
              'A completed cycle may find no new opportunities. Research never authorizes outreach or publication.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _researchStatus(Map<String, dynamic> data) {
    final access = data['leadAccess'] is Map
        ? data['leadAccess'] as Map
        : const {};
    final schedule = data['researchSchedule'] is Map
        ? data['researchSchedule'] as Map
        : const {};
    final cycle = schedule['lastCompletedCycle'] is Map
        ? schedule['lastCompletedCycle'] as Map
        : const {};
    final status = switch (schedule['lastStatus']) {
      'running' => 'Running',
      'completed' => 'Cycle completed — inspect discovery results',
      'held' => 'Held - review access or source availability',
      'not_run' => 'Awaiting first scheduled cycle',
      'not_configured' => 'Not configured',
      _ => 'Unknown',
    };
    final accessLabel = switch (access['source']) {
      'internal_dogfood' when access['enabled'] == true =>
        'Internal dogfood Lead Generation grant',
      'stripe' when access['enabled'] == true => 'Paid Lead Generation',
      'none' => 'Lead Generation access required',
      _ => 'Unknown',
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Lead research activity',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            _line('Access', accessLabel),
            if (access['source'] == 'internal_dogfood' &&
                access['enabled'] == true)
              _line('Internal access expires', _time(access['expiresAt'])),
            _line(
              'Recurring research',
              schedule['enabled'] == true
                  ? (schedule['cadence'] == 'daily' ? 'Daily' : 'Enabled')
                  : schedule['enabled'] == false
                  ? 'Off'
                  : 'Unknown',
            ),
            _line('Scheduled cycle status', status),
            _discoveryStatus(data),
            _line('Last attempt', _time(schedule['lastAttemptAt'])),
            _line(
              'Last completed cycle',
              _time(cycle['completedAt'] ?? schedule['lastCompletedAt']),
            ),
            _line(
              'Next eligible research time',
              schedule['enabled'] == false
                  ? 'Not scheduled'
                  : '${_time(schedule['nextRunAt'])}${_pastEligibility(schedule['nextRunAt']) ? ' — eligible; awaiting dispatcher or recorded hold' : ''}',
            ),
            _line(
              'New prospects in last completed cycle',
              cycle['newProspectCount'],
            ),
            _line('Duplicates excluded', cycle['duplicatesExcludedCount']),
            _line(
              'Successful source checks in this cycle',
              cycle['sourceChecks'],
            ),
            _line(
              'Attempted source checks in this cycle',
              cycle['sourceChecks'] is num && cycle['failedSourceCount'] is num
                  ? (cycle['sourceChecks'] as num) +
                        (cycle['failedSourceCount'] as num)
                  : 'Unavailable',
            ),
            _line('Unavailable sources', cycle['failedSourceCount']),
            const Text(
              'Eligibility is not an execution appointment; the recurring dispatcher must select this workspace. Cycle totals above are separate from the cumulative opportunity pipeline. A completed run does not prove successful discovery. Research does not authorize outreach.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _content(BuildContext context) {
    if (widget.customer && _data!['initialized'] == true) {
      return PremiumAgentWorkspace(
        data: _data!,
        researchStatus: _researchStatus(_data!),
        focus: widget.focusId,
        busy: _busy,
        error: _error,
        onOpen: (route) async {
          if (route == '/business/growth-profile') {
            await Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => BusinessGrowthProfileWizard(
                  initialProfile: Map<String, dynamic>.from(
                    _data?['businessContext']?['profile'] as Map? ?? {},
                  ),
                ),
              ),
            );
            if (mounted) await _load();
          } else {
            AppNavigation.push(
              context,
              route == '/business/customers' ? '/business/schedule' : route,
            );
          }
        },
        onResearch: _research,
        onReviewPeople: _reviewPeople,
        onPerformance: _performance,
        onRecommendation: (report, decision) =>
            _action('reviewRecommendation', {
              'reportIds': (report['history'] as List)
                  .map((r) => r['id'])
                  .toList(),
              'decision': decision,
            }),
        preferences: GrowthOpportunityPreferencesCard(
          values: Map<String, dynamic>.from(
            _data?['preferences']?['opportunities'] as Map? ?? {},
          ),
          onSave: (values) async {
            await _call('updateGrowthCommunicationPreferencesV1', {
              'opportunities': values,
            });
            await _load();
          },
        ),
      );
    }
    final d = _data!, s = Map<String, dynamic>.from(d['summary'] as Map? ?? {});
    final prospects = _list(d['prospects']);
    if (widget.focusId == 'lead_generation') {
      prospects.removeWhere(
        (p) =>
            p['kind'] == 'scaler' ||
            p['opportunityType'] == 'workforce_candidate' ||
            p['opportunityType'] == 'recruitment_channel',
      );
    }
    if (widget.focusId == 'workforce_recruiter') {
      prospects.removeWhere(
        (p) =>
            p['kind'] != 'scaler' &&
            p['kind'] != 'referral_partner' &&
            p['opportunityType'] != 'workforce_candidate' &&
            p['opportunityType'] != 'recruitment_channel',
      );
    }
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
        const BusinessEmailEntry(showUnavailable: true),
        GrowthRelationshipCounts(
          prospects: prospects,
          mailbox: _mailbox,
          observations: s['observationCount'] is num
              ? s['observationCount'] as num
              : null,
        ),
        if (widget.customer) _researchStatus(d) else _internalResearchStatus(d),
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
        ..._list(d['agents'])
            .where(
              (a) =>
                  ![
                    'growth_strategist',
                    'lead_generation',
                    'workforce_recruiter',
                    'ad_manager',
                    'business_assistant',
                  ].contains(widget.focusId) ||
                  a['type'] == widget.focusId,
            )
            .map(
              (a) => Card(
                child: ExpansionTile(
                  initiallyExpanded: a['type'] == widget.focusId,
                  title: Text(a['name'].toString()),
                  subtitle: Text(a['status'].toString()),
                  childrenPadding: const EdgeInsets.all(16),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _line('Last action', a['lastAction']),
                    if ([
                      'lead_generation',
                      'workforce_recruiter',
                      'growth_strategist',
                    ].contains(a['type'])) ...[
                      _line(
                        'Last research run',
                        _time(
                          (_list(d['runs'])..sort(
                                (a, b) => ((b['createdAt'] as num?) ?? 0)
                                    .compareTo((a['createdAt'] as num?) ?? 0),
                              ))
                              .firstOrNull?['completedAt'],
                        ),
                      ),
                      _line(
                        'Next eligible research',
                        d['researchPaused'] == true
                            ? 'Paused'
                            : _time(d['nextResearchAfter']),
                      ),
                    ],
                    _line('Result', a['result']),
                    _line('Next action', a['nextAction']),
                    const Text('External action needs approval'),
                    if (a['type'] == 'lead_generation')
                      Text(
                        '${prospects.length} prospects · ${prospects.where((p) => (p['draft']?.toString() ?? '').isNotEmpty).length} drafts · ${_mailbox?['learning']?['replied'] ?? d['outreach']?['replied'] ?? 'Unavailable'} conversations with replies',
                      ),
                    _managerActions(a, d),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: _busy || (widget.customer && d['initialized'] != true)
              ? null
              : _research,
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
          key: _opportunitiesKey,
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
                          child: const Text('View Evidence'),
                        ),
                        _line('Source checked', _time(p['lastCheckedAt'])),
                        _line('Recommended channel', p['recommendedChannel']),
                        _line('Recommended CTA', p['recommendedCta']),
                        _line('Last action', p['lastAction']),
                        _line('Result', p['result']),
                        _line(
                          'Next action',
                          p['nextContactAction'] ?? p['nextAction'],
                        ),
                        const SizedBox(height: 8),
                        if (p['freshOutreachEligible'] != false)
                          const Text(
                            'Proposed outreach — not sent',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                        if (p['freshOutreachEligible'] != false)
                          SelectableText(
                            p['draft']?.toString() ??
                                'More source review required.',
                          ),
                        const SizedBox(height: 12),
                        if (_mailbox != null &&
                            p['emailEligibility'] == 'eligible' &&
                            p['doNotContact'] != true &&
                            p['qualified'] == true &&
                            p['email'] is String &&
                            p['sourceAvailable'] == true &&
                            p['excludedByGrowthPreferences'] != true)
                          BusinessEmailDraftButton(
                            mailbox: _mailbox!,
                            onChanged: _load,
                            prospect: p,
                          ),
                        GrowthProspectEmailAction(
                          prospect: p,
                          mailbox: _mailbox,
                        ),
                        Text(
                          p['doNotContact'] == true
                              ? 'Do not contact'
                              : p['approvalState'] == 'awaiting_approval'
                              ? (widget.customer
                                    ? 'Needs your approval'
                                    : 'Needs Founder approval')
                              : p['approvalState'] == 'do_not_contact'
                              ? 'Do not contact'
                              : p['approvalState'] == 'ready_for_founder_send'
                              ? 'Reviewed · awaiting your final send approval'
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
        Text(
          'Reports and Recommendations',
          key: _reportsKey,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        if (_list(d['reports']).isEmpty)
          const Text(
            'No saved recommendations yet. Check for new opportunities to prepare the next research cycle; nothing will be sent.',
          ),
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
                  'This research report does not establish contacts, replies, appointments or revenue. Review the linked conversation and recorded CRM outcomes for current results.',
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
        Text(
          d['outreach']?['learningBasis']?.toString() ??
              'No verified conversion evidence yet.',
        ),
        if (d['outreach'] != null) ...[
          Text(
            'Confirmed outreach: ${d['outreach']['sent']} sent · ${d['outreach']['replied']} replied',
          ),
          for (final pattern in _list(d['outreach']['patterns']))
            Text(
              '${pattern['value']}: ${pattern['sent']} sent · ${pattern['replied']} replies · ${pattern['positive']} positive outcomes. ${pattern['recommendation']}',
            ),
          if (_list(d['outreach']['followups']).isNotEmpty)
            Text(
              '${_list(d['outreach']['followups']).length} follow-ups worth reviewing after five days without a recorded reply. Automatic sending remains off.',
            ),
        ],
        const Text(
          'Private conversations and contacts remain within this Business.',
        ),
      ],
    );
  }

  List<Widget> _customerOverview(Map<String, dynamic> d) {
    final social = Map<String, dynamic>.from(d['social'] as Map? ?? {});
    return [
      const SizedBox(height: 24),
      Text('Social Performance', style: Theme.of(context).textTheme.titleLarge),
      _line(
        'Plan status',
        social['review']?['title'] ?? 'Checking saved status',
      ),
      SocialPerformancePanel(data: social['performance'] as Map? ?? {}),
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
              ? 'Review Content'
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
      Text(
        'Emails sent: ${_mailbox?['learning']?['sent'] ?? d['outreach']?['sent'] ?? 'Unavailable'} · Conversations with replies: ${_mailbox?['learning']?['replied'] ?? d['outreach']?['replied'] ?? 'Unavailable'}. Stage progression, appointments and revenue require recorded CRM evidence.',
      ),
    ];
  }
}
