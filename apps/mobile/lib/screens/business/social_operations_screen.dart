import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/social_operations_service.dart';

class SocialOperationsScreen extends StatefulWidget {
  const SocialOperationsScreen({super.key});

  @override
  State<SocialOperationsScreen> createState() => _SocialOperationsScreenState();
}

class _SocialOperationsScreenState extends State<SocialOperationsScreen> {
  final _service = SocialOperationsService();
  SocialOperationsWorkspace? _workspace;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await _service.load();
      if (mounted) setState(() => _workspace = value);
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _error = error.message ?? 'Unable to load Social Operations.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createPlan() async {
    final goal = TextEditingController();
    var mode = 'manual';
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: const Text('Start a 30-day content plan'),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: goal,
                  decoration: const InputDecoration(
                    labelText: 'Growth goal',
                    hintText:
                        'Example: Help local businesses understand ScaledCircle',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: mode,
                  decoration: const InputDecoration(
                    labelText: 'Automation level',
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'manual',
                      child: Text('Manual — approve every item'),
                    ),
                    DropdownMenuItem(
                      value: 'approve_plan',
                      child: Text('Approve Plan — calendar approval'),
                    ),
                  ],
                  onChanged: (value) =>
                      setModalState(() => mode = value ?? 'manual'),
                ),
                const SizedBox(height: 12),
                const Text(
                  'This creates reviewable drafts only. It does not connect accounts, publish posts, send email, or launch ads.',
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.pop(dialogContext, goal.text.trim().isNotEmpty),
              child: const Text('Create Draft Plan'),
            ),
          ],
        ),
      ),
    );
    if (accepted == true) {
      try {
        final now = DateTime.now().toUtc();
        await _service.createPlan(
          goal: goal.text.trim(),
          startsOn: now,
          automationMode: mode,
        );
        await _load();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                '30-day draft plan created for review. Nothing was published.',
              ),
            ),
          );
        }
      } on FirebaseFunctionsException catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.message ?? 'Unable to create the plan.'),
            ),
          );
        }
      }
    }
    goal.dispose();
  }

  Future<void> _approvePlan(Map<String, dynamic> plan) async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approve this exact plan?'),
        content: const Text(
          'Approval applies to the current calendar and platform-specific drafts. Nothing will publish until an account is connected and publishing is separately enabled.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Approve Plan'),
          ),
        ],
      ),
    );
    if (approved != true) return;
    try {
      await _service.approvePlan(
        planId: plan['id']?.toString() ?? '',
        planVersion: (plan['planVersion'] as num?)?.toInt() ?? 0,
      );
      await _load();
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Unable to approve the plan.'),
          ),
        );
      }
    }
  }

  Future<void> _createEmailPlan() async {
    final goal = TextEditingController();
    final create = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create 30 days of email content'),
        content: SizedBox(
          width: 520,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: goal,
                decoration: const InputDecoration(
                  labelText: 'Email strategy goal',
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Creates balanced reviewable content for an existing consented audience. It does not send email.',
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
            onPressed: () =>
                Navigator.pop(context, goal.text.trim().isNotEmpty),
            child: const Text('Create Content'),
          ),
        ],
      ),
    );
    if (create == true) {
      try {
        await _service.createEmailPlan(
          goal: goal.text.trim(),
          startsOn: DateTime.now().toUtc(),
        );
        await _load();
      } on FirebaseFunctionsException catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.message ?? 'Unable to create email content.'),
            ),
          );
        }
      }
    }
    goal.dispose();
  }

  String _providerLabel(String provider) => switch (provider) {
    'facebook' => 'Facebook',
    'instagram' => 'Instagram',
    'x' => 'X',
    'youtube' => 'YouTube',
    'meta_ads' => 'Meta Ads',
    'google_ads' => 'Google Ads',
    _ => provider,
  };

  String _oauthProvider(String provider) =>
      provider == 'facebook' || provider == 'instagram' ? 'meta' : provider;

  bool _connectionNeedsReconnect(String status) => const {
    'expired',
    'reauthorization_required',
    'revoked',
    'token_expired',
  }.contains(status);

  String _connectLabel(Map<String, dynamic> connection) {
    final status = connection['status']?.toString() ?? 'disconnected';
    if (_connectionNeedsReconnect(status)) return 'Reconnect';
    final provider = connection['provider']?.toString() ?? '';
    if (_oauthProvider(provider) == 'meta') {
      return 'Connect Facebook & Instagram';
    }
    return 'Connect ${_providerLabel(provider)}';
  }

  Future<void> _beginConnection(String provider) async {
    try {
      final result = await _service.beginReadOnlyConnection(
        _oauthProvider(provider),
      );
      final uri = Uri.tryParse(result['authorizationUrl']?.toString() ?? '');
      await _load();
      if (result['status'] == 'identity_pending') {
        final connection = _workspace?.connections
            .where((item) => item['pendingAttemptId'] == result['attemptId'])
            .firstOrNull;
        if (connection != null) await _reviewConnection(connection);
        return;
      }
      if (uri == null) {
        final providerLabel = _providerLabel(provider);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Authorization is already in progress. Return from $providerLabel, then check and confirm.',
              ),
            ),
          );
        }
        return;
      }
      final popupOpened = await launchUrl(uri, webOnlyWindowName: '_blank');
      if (mounted) {
        await _showContinuation(
          uri,
          provider: provider,
          popupOpened: popupOpened,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Complete read-only authorization, then return here to confirm the exact account.',
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'This connection is not ready yet.'),
          ),
        );
      }
    }
  }

  Future<void> _showContinuation(
    Uri uri, {
    required String provider,
    required bool popupOpened,
  }) async {
    if (!mounted) return;
    final providerLabel = _providerLabel(provider);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('$providerLabel authorization is ready'),
        content: Text(
          popupOpened
              ? 'Complete $providerLabel consent in the opened tab. If it is unavailable, continue here in this tab.'
              : 'Your browser blocked the authorization window. Continue securely in this tab.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              unawaited(launchUrl(uri, webOnlyWindowName: '_self'));
            },
            child: Text('Continue with $providerLabel'),
          ),
        ],
      ),
    );
  }

  Future<void> _continueConnection(Map<String, dynamic> connection) async {
    final attemptId = connection['pendingAttemptId']?.toString() ?? '';
    if (attemptId.isEmpty) return;
    try {
      final attempt = await _service.connectionAttempt(attemptId);
      if (attempt['status'] == 'identity_pending') {
        await _reviewConnection(connection);
        return;
      }
      if (attempt['status'] == 'expired') {
        await _beginConnection(connection['provider']?.toString() ?? '');
        return;
      }
      final uri = Uri.tryParse(attempt['authorizationUrl']?.toString() ?? '');
      if (uri == null) {
        final providerLabel = _providerLabel(
          connection['provider']?.toString() ?? '',
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'The existing authorization is still open. Return from $providerLabel, then check and confirm.',
              ),
            ),
          );
        }
        return;
      }
      await _showContinuation(
        uri,
        provider: connection['provider']?.toString() ?? '',
        popupOpened: false,
      );
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Unable to continue authorization.'),
          ),
        );
      }
    }
  }

  Future<void> _reviewConnection(Map<String, dynamic> connection) async {
    final attemptId = connection['pendingAttemptId']?.toString() ?? '';
    if (attemptId.isEmpty) return;
    try {
      final attempt = await _service.connectionAttempt(attemptId);
      final candidates = (attempt['candidates'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      if (attempt['status'] != 'identity_pending' || candidates.isEmpty) {
        await _load();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Authorization is not ready for identity confirmation yet.',
              ),
            ),
          );
        }
        return;
      }
      if (!mounted) return;
      final selected = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Use this account?'),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Only read-only identity and analytics access will be connected. Publishing remains off.',
                ),
                const SizedBox(height: 12),
                for (final candidate in candidates)
                  Card(
                    child: ListTile(
                      title: Text(
                        candidate['accountDisplayName']?.toString() ??
                            'Provider account',
                      ),
                      subtitle: Text(
                        [
                              candidate['handle']?.toString(),
                              candidate['linkedAccountDisplayName']?.toString(),
                              candidate['linkedHandle']?.toString(),
                              candidate['candidateId']?.toString(),
                            ]
                            .whereType<String>()
                            .where((value) => value.isNotEmpty)
                            .join(' · '),
                      ),
                      trailing: FilledButton.tonal(
                        onPressed: () => Navigator.pop(context, candidate),
                        child: const Text('Use this account'),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
          ],
        ),
      );
      if (selected == null) return;
      await _service.confirmReadOnlyConnection(
        attemptId: attemptId,
        candidateId: selected['candidateId']?.toString() ?? '',
      );
      await _load();
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Unable to confirm this account.'),
          ),
        );
      }
    }
  }

  Future<void> _syncPerformance(String provider) async {
    try {
      final result = await _service.syncReadOnlyPerformance(provider);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${result['importedSnapshotCount'] ?? 0} read-only performance snapshot(s) imported.',
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Performance sync is unavailable.'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Social Operations — Beta')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _load,
                      child: const Text('Try Again'),
                    ),
                  ],
                ),
              ),
            )
          : _body(_workspace!),
    );
  }

  Widget _body(SocialOperationsWorkspace workspace) => LayoutBuilder(
    builder: (context, constraints) {
      final wide = constraints.maxWidth >= 820;
      return ListView(
        padding: EdgeInsets.all(wide ? 24 : 16),
        children: [
          Text(
            workspace.managedGrowth
                ? 'Your managed marketing workspace'
                : 'Plan, approve, and measure your marketing',
            style: Theme.of(
              context,
            ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          const Text('Connect → Plan → Review → Schedule → Measure → Improve'),
          const SizedBox(height: 16),
          _notice(),
          const SizedBox(height: 16),
          _section('Connections', _connections(workspace, wide)),
          _section('30-Day Plan', _plans(workspace)),
          _section("What's Working", _learning(workspace)),
          if (workspace.managedGrowth)
            _section('30-Day Email Content', _email(workspace)),
          _section('Ads — Read Only', _ads(workspace, wide)),
        ],
      );
    },
  );

  Widget _notice() => const Card(
    child: ListTile(
      leading: Icon(Icons.shield_outlined),
      title: Text('Read-only connection phase'),
      subtitle: Text(
        'Account identity and available analytics may be connected. Publishing, bulk email delivery, and ad changes remain off.',
      ),
    ),
  );

  Widget _section(String title, Widget child) => Padding(
    padding: const EdgeInsets.only(bottom: 22),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        child,
      ],
    ),
  );

  Widget _connections(
    SocialOperationsWorkspace workspace,
    bool wide,
  ) => GridView.count(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    crossAxisCount: wide ? 4 : 2,
    childAspectRatio: wide ? 1.55 : 1.25,
    crossAxisSpacing: 8,
    mainAxisSpacing: 8,
    children: workspace.connections
        .map((connection) {
          final status = connection['status']?.toString() ?? 'disconnected';
          final connected = status == 'connected_read_only';
          final authorizing =
              status == 'authorizing' || status == 'identity_pending';
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _providerLabel(connection['provider'].toString()),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const Spacer(),
                  Text(
                    connected
                        ? 'Connected · Read only'
                        : authorizing
                        ? 'Authorizing'
                        : 'Not connected',
                  ),
                  if (connected)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          [
                                connection['accountDisplayName'],
                                connection['handle'],
                              ]
                              .whereType<String>()
                              .where((value) => value.isNotEmpty)
                              .join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        TextButton(
                          onPressed: () => _syncPerformance(
                            connection['provider']?.toString() ?? '',
                          ),
                          child: const Text('Sync insights'),
                        ),
                      ],
                    )
                  else
                    Align(
                      alignment: Alignment.centerLeft,
                      child: authorizing
                          ? Wrap(
                              spacing: 4,
                              children: [
                                TextButton(
                                  onPressed: () =>
                                      _continueConnection(connection),
                                  child: Text(
                                    'Continue with ${_providerLabel(connection['provider']?.toString() ?? '')}',
                                  ),
                                ),
                                TextButton(
                                  onPressed: () =>
                                      _reviewConnection(connection),
                                  child: const Text('Check & confirm'),
                                ),
                              ],
                            )
                          : TextButton(
                              onPressed: () => _beginConnection(
                                connection['provider']?.toString() ?? '',
                              ),
                              child: Text(_connectLabel(connection)),
                            ),
                    ),
                ],
              ),
            ),
          );
        })
        .toList(growable: false),
  );

  Widget _plans(SocialOperationsWorkspace workspace) => Column(
    children: [
      for (final plan in workspace.plans)
        Card(
          child: ListTile(
            leading: const Icon(Icons.calendar_month_outlined),
            title: Text(plan['goal']?.toString() ?? '30-day content plan'),
            subtitle: Text(
              '${plan['items'] is List ? (plan['items'] as List).length : 0} calendar items · ${plan['status'] ?? 'ready for review'}',
            ),
            trailing: plan['status'] == 'ready_for_review'
                ? FilledButton.tonal(
                    onPressed: () => _approvePlan(plan),
                    child: const Text('Review & Approve'),
                  )
                : const Chip(label: Text('APPROVED')),
          ),
        ),
      Card(
        child: ListTile(
          leading: const Icon(Icons.add_circle_outline),
          title: Text(
            '${workspace.plans.length} saved plan${workspace.plans.length == 1 ? '' : 's'}',
          ),
          subtitle: const Text(
            'Platform-specific versions remain drafts until explicitly approved.',
          ),
          trailing: FilledButton(
            onPressed: _createPlan,
            child: const Text('Start Plan'),
          ),
        ),
      ),
    ],
  );

  Widget _learning(SocialOperationsWorkspace workspace) {
    final ready = workspace.learning['status'] == 'evidence_available';
    return Card(
      child: ListTile(
        leading: Icon(ready ? Icons.insights_outlined : Icons.hourglass_empty),
        title: Text(
          ready
              ? 'Weekly learning available'
              : 'Waiting for real performance evidence',
        ),
        subtitle: Text(
          workspace.learning['summary']?.toString() ??
              'Published performance will appear here after accounts are connected.',
        ),
      ),
    );
  }

  Widget _email(SocialOperationsWorkspace workspace) => Card(
    child: ListTile(
      leading: const Icon(Icons.email_outlined),
      title: Text(
        '${workspace.emailPlans.length} content plan${workspace.emailPlans.length == 1 ? '' : 's'}',
      ),
      subtitle: const Text(
        'Subjects, preview text, body, CTA, timing, and audience intent. Bulk sending is not enabled.',
      ),
      trailing: FilledButton.tonal(
        onPressed: _createEmailPlan,
        child: const Text('Create Content'),
      ),
    ),
  );

  Widget _ads(SocialOperationsWorkspace workspace, bool wide) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: workspace.ads
        .map((account) {
          final status = account['status']?.toString() ?? 'not_connected';
          final balance = Map<String, dynamic>.from(
            account['balance'] as Map? ?? const {},
          );
          return SizedBox(
            width: wide ? 360 : double.infinity,
            child: Card(
              child: ListTile(
                leading: const Icon(Icons.campaign_outlined),
                title: Text(_providerLabel(account['provider'].toString())),
                subtitle: Text(
                  '${status == 'connected' ? 'Connected' : 'Not connected'}\n'
                  'Billing: ${account['billingStatus'] == 'unavailable' ? 'Unavailable until connected' : account['billingStatus']}\n'
                  'Balance: ${balance['status'] == 'available' ? balance['amountMinor'] : 'Exact balance unavailable through connected API'}',
                ),
                isThreeLine: true,
                trailing: const Chip(label: Text('READ ONLY')),
              ),
            ),
          );
        })
        .toList(growable: false),
  );
}
