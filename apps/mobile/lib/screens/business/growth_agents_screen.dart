import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class GrowthAgentsScreen extends StatefulWidget {
  const GrowthAgentsScreen({super.key, this.focusId, this.loadOverride});
  final String? focusId;
  final Future<Map<String, dynamic>> Function()? loadOverride;
  @override
  State<GrowthAgentsScreen> createState() => _GrowthAgentsScreenState();
}

class _GrowthAgentsScreenState extends State<GrowthAgentsScreen> {
  Map<String, dynamic>? _data;
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
    final response = await FirebaseFunctions.instanceFor(region: 'us-east1')
        .httpsCallable(name)
        .call(input ?? {})
        .timeout(const Duration(seconds: 175));
    return Map<String, dynamic>.from(response.data as Map);
  }

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (!_busy && ModalRoute.of(context)?.isCurrent == true) _load();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data =
          await (widget.loadOverride?.call() ??
              _call('getGrowthDogfoodWorkspaceV1'));
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Unable to load this private workspace. Sign in as the ScaledCircle dogfood Admin, then retry.',
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
          () =>
              _error = e.message ?? 'Action held. Retry to check saved state.',
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
      title: const Text('Growth Agents'),
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
                ? const CircularProgressIndicator()
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
        : _content(context),
  );
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
        const Text(
          'ScaledCircle · Private dogfood',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        const Text(
          'Research and drafts only. External outreach, ad spend and financial actions remain off. Existing approved Social schedules retain their own authority.',
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(_error!, style: const TextStyle(color: Colors.red)),
          ),
        const SizedBox(height: 18),
        Text(
          'Needs attention: ${s['awaitingApproval'] ?? 0} drafts',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        _line('Business prospects', s['businessesFound']),
        _line('Organization partner prospects', s['partnersFound']),
        _line('Individual Scaler candidates', s['individualScalersFound']),
        _line('Recommended next', s['next']),
        const SizedBox(height: 16),
        ..._list(d['agents']).map(
          (a) => Card(
            child: ExpansionTile(
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
        FilledButton.icon(
          onPressed: _busy ? null : () => _action('runGrowthDogfoodResearchV1'),
          icon: const Icon(Icons.search),
          label: Text(
            _busy
                ? 'Checking official sources…'
                : 'Run today’s bounded research',
          ),
        ),
        _line(
          'Upcoming official-source recheck',
          _time(d['nextResearchAfter']),
        ),
        const Text(
          'The maintained source pool is rechecked daily. A recheck is not counted as a new prospect.',
        ),
        const SizedBox(height: 24),
        Text(
          'Prospects and approval queue',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        if (prospects.isEmpty) const Text('No sourced prospects yet.'),
        ...prospects.map(
          (p) => Card(
            child: ExpansionTile(
              key: ValueKey(p['id']),
              initiallyExpanded: p['id'] == widget.focusId,
              title: Text(p['displayName'].toString()),
              subtitle: Text(
                '${p['kind'] == 'business' ? 'Business prospect' : 'Organization referral partner'} · ${p['geography']}',
              ),
              childrenPadding: const EdgeInsets.all(16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _line('Fit', p['reason']),
                _line('Confidence', p['confidence']),
                _line('Possible use', p['useCase']),
                _line('Email', p['email']),
                _line('Phone', p['phone']),
                if (p['kind'] != 'business') ...[
                  _line('Individual skills', p['skills']),
                  _line('Transportation', p['transportation']),
                  _line('Availability', p['availability']),
                ],
                TextButton(
                  onPressed: () => launchUrl(
                    Uri.parse(p['sourceUrl'].toString()),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: const Text('Open official source'),
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
                  p['draft']?.toString() ?? 'More source review required.',
                ),
                const SizedBox(height: 12),
                Text(
                  p['approvalState'] == 'awaiting_approval'
                      ? 'Needs Founder approval'
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
                        child: const Text('Mark reviewed — do not send'),
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
        const SizedBox(height: 24),
        Text(
          'Completed activity',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        ..._list(d['runs']).map(
          (r) => ListTile(
            title: Text('${r['sourceChecks'] ?? 0} official sources checked'),
            subtitle: Text(
              '${_time(r['createdAt'])} · ${r['result'] ?? r['status']}',
            ),
          ),
        ),
        const SizedBox(height: 20),
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
}
