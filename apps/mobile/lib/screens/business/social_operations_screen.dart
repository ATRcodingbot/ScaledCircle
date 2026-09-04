import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/attribution_service.dart';
import '../../services/social_operations_service.dart';

class SocialOperationsScreen extends StatefulWidget {
  const SocialOperationsScreen({super.key});

  @override
  State<SocialOperationsScreen> createState() => _SocialOperationsScreenState();
}

class _SocialOperationsScreenState extends State<SocialOperationsScreen> {
  final _service = SocialOperationsService();
  final _attribution = AttributionService();
  SocialOperationsWorkspace? _workspace;
  Map<String, dynamic>? _firstX;
  bool _loading = true;
  bool _reviewingContent = false;
  bool _ratingPosts = false;
  bool _aligningPlan = false;
  bool _preparingFirstX = false;
  bool _authorizingFirstX = false;
  bool _approvingFirstX = false;
  bool _publishingFirstX = false;
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
      Map<String, dynamic>? firstX;
      if (value.firstXCertificationAvailable) {
        firstX = await _service.firstXPublishCertification();
      }
      if (mounted) {
        setState(() {
          _workspace = value;
          _firstX = firstX;
        });
      }
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

  Future<void> _alignExistingPlan() async {
    if (_aligningPlan) return;
    setState(() => _aligningPlan = true);
    try {
      final result = await _service.ingestScaledCircleLaunchPlan();
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${result['itemCount'] ?? 0} existing plan items aligned. Nothing was published.',
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error.message ?? 'Unable to align the existing plan.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _aligningPlan = false);
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
    'reauth_required',
    'reauthorization_required',
    'revoked',
    'token_expired',
  }.contains(status);

  String _connectLabel(Map<String, dynamic> connection) {
    final status = connection['status']?.toString() ?? 'disconnected';
    final provider = connection['provider']?.toString() ?? '';
    if (_connectionNeedsReconnect(status)) {
      return 'Reconnect ${_providerLabel(provider)}';
    }
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

  Future<void> _prepareFirstXPublish() async {
    if (_preparingFirstX) return;
    setState(() => _preparingFirstX = true);
    try {
      final foundation = await _service.prepareFirstXPublishFoundation();
      final request = Map<String, dynamic>.from(
        foundation['responseAssetRequest'] as Map,
      );
      final asset = await _attribution.createResponseAsset(
        businessUid: request['businessUid']?.toString(),
        requestId: request['requestId']?.toString(),
        label: request['label']?.toString() ?? '',
        type: request['type']?.toString() ?? 'tracked_link',
        destination: request['destination']?.toString() ?? '',
        source: request['source']?.toString() ?? 'social',
        sourceDetail: request['sourceDetail']?.toString(),
        campaignId: request['campaignId']?.toString(),
        creativeVersion: request['creativeVersion']?.toString(),
      );
      await _service.createFirstXPublishVersion(
        responseAssetId: asset['responseAssetId']?.toString() ?? '',
      );
      await _service.reviewScheduledContent();
      await _load();
      final quality = Map<String, dynamic>.from(
        _firstX?['quality'] as Map? ?? const {},
      );
      if (quality['readyToPublish'] != true ||
          !const ['good', 'strong'].contains(quality['qualityBand'])) {
        throw StateError('The revised post did not pass the quality gate.');
      }
    } on FirebaseFunctionsException catch (error) {
      _showFirstXError(error.message);
    } catch (error) {
      _showFirstXError(error.toString());
    } finally {
      if (mounted) setState(() => _preparingFirstX = false);
    }
  }

  Future<void> _beginFirstXPublishAuthorization() async {
    if (_authorizingFirstX) return;
    setState(() => _authorizingFirstX = true);
    try {
      final result = await _service.beginFirstXPublishAuthorization();
      final uri = Uri.tryParse(result['authorizationUrl']?.toString() ?? '');
      await _load();
      if (result['status'] == 'identity_pending') {
        await _reviewFirstXPublishAuthorization(
          result['attemptId']?.toString() ?? '',
        );
      } else if (uri != null) {
        final popupOpened = await launchUrl(uri, webOnlyWindowName: '_blank');
        await _showContinuation(uri, provider: 'x', popupOpened: popupOpened);
      }
    } on FirebaseFunctionsException catch (error) {
      _showFirstXError(error.message);
    } finally {
      if (mounted) setState(() => _authorizingFirstX = false);
    }
  }

  Future<void> _recordFirstXFounderApproval() async {
    if (_approvingFirstX) return;
    final approved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Approve publishing access for this exact post?'),
        content: const SingleChildScrollView(
          child: Text(
            'This records Founder approval for the exact v3 copy, certified Smart Mapping media, tracked destination, and selected time. It only allows the next X account permission step. It does not publish anything.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Approve exact post'),
          ),
        ],
      ),
    );
    if (approved != true) return;
    setState(() => _approvingFirstX = true);
    try {
      await _service.recordFirstXFounderApproval();
      await _load();
    } on FirebaseFunctionsException catch (error) {
      _showFirstXError(error.message);
    } finally {
      if (mounted) setState(() => _approvingFirstX = false);
    }
  }

  Future<void> _reviewFirstXPublishAuthorization(String attemptId) async {
    if (attemptId.isEmpty) return;
    try {
      final attempt = await _service.connectionAttempt(attemptId);
      final candidates = (attempt['candidates'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      if (attempt['status'] != 'identity_pending' || candidates.isEmpty) {
        _showFirstXError(
          'Authorization is not ready. Finish X consent, then check again.',
        );
        return;
      }
      if (!mounted) return;
      final selected = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Use this X account?'),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'This upgrade allows ScaledCircle to publish only the exact post you approve. It does not enable automatic posting.',
                ),
                const SizedBox(height: 12),
                for (final candidate in candidates)
                  Card(
                    child: ListTile(
                      title: Text(
                        candidate['accountDisplayName']?.toString() ?? '',
                      ),
                      subtitle: Text(candidate['handle']?.toString() ?? ''),
                      trailing: FilledButton.tonal(
                        onPressed: () =>
                            Navigator.pop(dialogContext, candidate),
                        child: const Text('Use this account'),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
          ],
        ),
      );
      if (selected == null) return;
      await _service.confirmFirstXPublishAuthorization(
        attemptId: attemptId,
        candidateId: selected['candidateId']?.toString() ?? '',
      );
      await _load();
    } on FirebaseFunctionsException catch (error) {
      _showFirstXError(error.message);
    }
  }

  Future<void> _createFirstXApproval() async {
    if (_approvingFirstX) return;
    final approved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Approve this exact X post?'),
        content: const SingleChildScrollView(
          child: Text(
            'Smart Mapping helps a Maryland Business focus a local campaign street by street. Choose the neighborhoods you can serve, connect each response to the campaign, and review what happened before expanding the map.\n\nSee ScaledCircle work: https://scaledcircle.com/#/businesses\n\n#MarylandBusiness\n\nSmart Mapping media and the tracked destination are locked to this approval. Nothing else is approved.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Approve exact post'),
          ),
        ],
      ),
    );
    if (approved != true) return;
    setState(() => _approvingFirstX = true);
    try {
      await _service.createFirstXPublishApproval();
      await _load();
    } on FirebaseFunctionsException catch (error) {
      _showFirstXError(error.message);
    } finally {
      if (mounted) setState(() => _approvingFirstX = false);
    }
  }

  Future<void> _executeFirstXPublish(String publishJobId) async {
    if (_publishingFirstX) return;
    setState(() => _publishingFirstX = true);
    try {
      await _service.executeFirstXPublish(publishJobId);
      await _load();
    } on FirebaseFunctionsException catch (error) {
      _showFirstXError(error.message);
      await _load();
    } finally {
      if (mounted) setState(() => _publishingFirstX = false);
    }
  }

  Future<void> _reconcileFirstXPublish(String publishJobId) async {
    if (_publishingFirstX) return;
    setState(() => _publishingFirstX = true);
    try {
      await _service.reconcileFirstXPublish(publishJobId);
      await _load();
    } on FirebaseFunctionsException catch (error) {
      _showFirstXError(error.message);
    } finally {
      if (mounted) setState(() => _publishingFirstX = false);
    }
  }

  void _showFirstXError(String? message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message ?? 'The bounded X certification needs attention.',
        ),
      ),
    );
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
      // The server may downgrade connection health after a failed refresh.
      // Reload before presenting the error so the card never remains falsely connected.
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Performance sync is unavailable.'),
          ),
        );
      }
    }
  }

  Future<void> _reviewScheduledContent() async {
    if (_reviewingContent) return;
    setState(() => _reviewingContent = true);
    try {
      final result = await _service.reviewScheduledContent();
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${result['assessedCount'] ?? 0} unpublished item(s) reviewed. Nothing was changed or published.',
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Content review is unavailable.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _reviewingContent = false);
    }
  }

  Future<void> _ratePastPosts(int lookbackDays) async {
    if (_ratingPosts) return;
    setState(() => _ratingPosts = true);
    try {
      final result = await _service.ratePastPosts(lookbackDays);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${result['ratedCount'] ?? 0} historical item(s) reviewed for the last $lookbackDays days. No provider post was changed.',
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Past-post review is unavailable.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _ratingPosts = false);
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
          if (workspace.firstXCertificationAvailable)
            _section('First X publish candidate', _firstXPublishCard()),
          _section('30-Day Plan', _plans(workspace)),
          _section('Content Health', _contentHealth(workspace)),
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
          final connected = const {
            'connected_read_only',
            'connected_write',
          }.contains(status);
          final authorizing =
              status == 'authorizing' || status == 'identity_pending';
          final needsAttention = _connectionNeedsReconnect(status);
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
                        ? status == 'connected_write'
                              ? 'Connected · Approval required before posting'
                              : 'Connected · Read only'
                        : authorizing
                        ? 'Authorizing'
                        : needsAttention
                        ? 'Needs attention'
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

  Widget _firstXPublishCard() {
    final certification = _firstX ?? const <String, dynamic>{};
    final quality = Map<String, dynamic>.from(
      certification['quality'] as Map? ?? const {},
    );
    final connection = Map<String, dynamic>.from(
      certification['connection'] as Map? ?? const {},
    );
    final responseAsset = Map<String, dynamic>.from(
      certification['responseAsset'] as Map? ?? const {},
    );
    final approval = Map<String, dynamic>.from(
      certification['approval'] as Map? ?? const {},
    );
    final job = Map<String, dynamic>.from(
      certification['publishJob'] as Map? ?? const {},
    );
    final prepared =
        certification['versionStatus'] != null &&
        certification['versionStatus'] != 'not_created';
    final founderApproved =
        certification['founderPublishApprovalRecorded'] == true;
    final writeConnected = connection['status'] == 'connected_write';
    final connectionNeedsAttention = _connectionNeedsReconnect(
      connection['status']?.toString() ?? '',
    );
    final jobStatus = job['status']?.toString();
    final attemptId = connection['pendingAttemptId']?.toString() ?? '';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Smart Mapping · X · Founder review required',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'Smart Mapping helps a Maryland Business focus a local campaign street by street. Choose the neighborhoods you can serve, connect each response to the campaign, and review what happened before expanding the map.\n\nSee ScaledCircle work: scaledcircle.com/#/businesses\n\n#MarylandBusiness',
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  label: Text(
                    quality.isEmpty
                        ? 'Quality review pending'
                        : '${quality['score'] ?? '—'}/100 · ${quality['qualityBand'] ?? 'review'}',
                  ),
                ),
                Chip(
                  label: Text(
                    founderApproved
                        ? 'Founder publish approval recorded'
                        : 'Founder publish approval required',
                  ),
                ),
                Chip(
                  label: Text(
                    responseAsset.isEmpty
                        ? 'Tracked destination pending'
                        : 'Tracked destination ready',
                  ),
                ),
                const Chip(label: Text('Timing confidence · Low')),
                Chip(
                  label: Text(
                    writeConnected
                        ? 'X publishing permission ready'
                        : 'Publishing permission not granted',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              jobStatus == 'completed'
                  ? 'Published and reconciled'
                  : jobStatus == 'unknown_provider_outcome'
                  ? 'Provider outcome needs reconciliation'
                  : jobStatus == 'scheduled'
                  ? 'Approved for ${job['scheduledFor'] ?? 'the selected time'}'
                  : 'No public post has been created.',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (!prepared)
                  FilledButton.tonal(
                    onPressed: _preparingFirstX ? null : _prepareFirstXPublish,
                    child: Text(
                      _preparingFirstX ? 'Preparing…' : 'Prepare exact post',
                    ),
                  ),
                if (prepared && !founderApproved)
                  FilledButton.tonal(
                    onPressed: _approvingFirstX
                        ? null
                        : _recordFirstXFounderApproval,
                    child: Text(
                      _approvingFirstX
                          ? 'Recording approval…'
                          : 'Review exact post for publishing access',
                    ),
                  ),
                if (prepared &&
                    founderApproved &&
                    !writeConnected &&
                    attemptId.isEmpty)
                  FilledButton.tonal(
                    onPressed: _authorizingFirstX
                        ? null
                        : _beginFirstXPublishAuthorization,
                    child: Text(
                      connectionNeedsAttention
                          ? 'Reconnect X'
                          : 'Allow ScaledCircle to publish this approved post',
                    ),
                  ),
                if (prepared &&
                    founderApproved &&
                    !writeConnected &&
                    attemptId.isNotEmpty)
                  FilledButton.tonal(
                    onPressed: _authorizingFirstX
                        ? null
                        : () => _reviewFirstXPublishAuthorization(attemptId),
                    child: const Text('Check & confirm X account'),
                  ),
                if (prepared && writeConnected && approval.isEmpty)
                  FilledButton(
                    onPressed: _approvingFirstX ? null : _createFirstXApproval,
                    child: Text(
                      _approvingFirstX ? 'Approving…' : 'Review exact approval',
                    ),
                  ),
                if (jobStatus == 'scheduled')
                  FilledButton(
                    onPressed: _publishingFirstX
                        ? null
                        : () => _executeFirstXPublish(
                            job['publishJobId']?.toString() ?? '',
                          ),
                    child: Text(
                      _publishingFirstX
                          ? 'Publishing…'
                          : 'Publish approved X post',
                    ),
                  ),
                if (jobStatus == 'unknown_provider_outcome')
                  FilledButton.tonal(
                    onPressed: _publishingFirstX
                        ? null
                        : () => _reconcileFirstXPublish(
                            job['publishJobId']?.toString() ?? '',
                          ),
                    child: const Text('Reconcile provider outcome'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _plans(SocialOperationsWorkspace workspace) {
    final alignment = workspace.internalPlanAlignment;
    final migrationAvailable = alignment?['migrationAvailable'] == true;
    return Column(
      children: [
        for (final plan in workspace.plans)
          Card(
            child: ListTile(
              leading: const Icon(Icons.calendar_month_outlined),
              title: Text(plan['goal']?.toString() ?? '30-day content plan'),
              subtitle: Text(
                '${(plan['itemCount'] as num?)?.toInt() ?? (plan['items'] is List ? (plan['items'] as List).length : 0)} calendar items · ${plan['status'] ?? 'ready for review'}',
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
        if (alignment != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.verified_outlined),
              title: Text(
                migrationAvailable
                    ? 'Existing ScaledCircle plan is ready to align'
                    : 'Staging plan alignment verified',
              ),
              subtitle: Text(
                migrationAvailable
                    ? 'Use the maintained plan authority to preserve the existing launch-plan lineage in this workspace.'
                    : 'Plan ${alignment['sourcePlanId']} · Canonical Business ${alignment['canonicalBusinessId']}',
              ),
              trailing: migrationAvailable
                  ? FilledButton.tonal(
                      onPressed: _aligningPlan ? null : _alignExistingPlan,
                      child: Text(_aligningPlan ? 'Aligning…' : 'Align Plan'),
                    )
                  : const Chip(label: Text('ALIGNED')),
            ),
          ),
      ],
    );
  }

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

  Widget _contentHealth(SocialOperationsWorkspace workspace) {
    final health = workspace.contentHealth;
    final scheduled = (health['scheduled'] as List? ?? const [])
        .whereType<Map>()
        .toList(growable: false);
    final pastPosts = (health['pastPosts'] as List? ?? const [])
        .whereType<Map>()
        .toList(growable: false);
    final needsAttention =
        (health['needsAttentionCount'] as num?)?.toInt() ?? 0;
    final strong = (health['strongCount'] as num?)?.toInt() ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _healthMetric(
              'Needs Attention',
              needsAttention,
              Icons.warning_amber,
            ),
            _healthMetric('Strong Posts', strong, Icons.star_outline),
            _healthMetric('Scheduled', scheduled.length, Icons.schedule),
            _healthMetric('Past Posts', pastPosts.length, Icons.history),
          ],
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Would you be proud to have this represent your Business?',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                const Text(
                  'ScaledCircle checks relevance, hook, copy, CTA, visual quality, repetition, platform fit, discovery language, and timing. Recommendations never change or remove provider content automatically.',
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: _reviewingContent
                          ? null
                          : _reviewScheduledContent,
                      icon: const Icon(Icons.fact_check_outlined),
                      label: Text(
                        _reviewingContent
                            ? 'Reviewing…'
                            : 'Review scheduled content',
                      ),
                    ),
                    PopupMenuButton<int>(
                      enabled: !_ratingPosts,
                      onSelected: _ratePastPosts,
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: 7, child: Text('Last 7 days')),
                        PopupMenuItem(value: 30, child: Text('Last 30 days')),
                        PopupMenuItem(value: 90, child: Text('Last 90 days')),
                      ],
                      child: Chip(
                        avatar: const Icon(Icons.analytics_outlined),
                        label: Text(
                          _ratingPosts ? 'Reviewing…' : 'Rate past posts',
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        for (final assessment in scheduled.take(6))
          _qualityCard(Map<String, dynamic>.from(assessment)),
        for (final rating in pastPosts.take(6))
          _pastPostCard(Map<String, dynamic>.from(rating)),
        if (scheduled.isEmpty && pastPosts.isEmpty)
          const Card(
            child: ListTile(
              leading: Icon(Icons.health_and_safety_outlined),
              title: Text('No content needs attention yet'),
              subtitle: Text(
                'Review scheduled content or select a past-post lookback. Missing provider evidence stays unavailable—not zero.',
              ),
            ),
          ),
      ],
    );
  }

  Widget _healthMetric(String label, int value, IconData icon) => SizedBox(
    width: 170,
    child: Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(
          '$value',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(label),
      ),
    ),
  );

  Widget _qualityCard(Map<String, dynamic> assessment) => Card(
    child: ListTile(
      leading: CircleAvatar(child: Text('${assessment['score'] ?? '—'}')),
      title: Text('${assessment['recommendation'] ?? 'keep'}'.toUpperCase()),
      subtitle: Text(
        '${assessment['qualityBand'] ?? 'unrated'} · Business approval is required before any replacement, reschedule, or removal.',
      ),
      trailing: const Chip(label: Text('REVIEW ONLY')),
    ),
  );

  Widget _pastPostCard(Map<String, dynamic> rating) => Card(
    child: ListTile(
      leading: const Icon(Icons.history),
      title: Text(
        '${rating['provider'] ?? 'Provider'} · ${rating['overallRecommendation'] ?? 'keep'}',
      ),
      subtitle: Text(
        'Creative: ${rating['creativeScore'] ?? 'Unavailable'} · Performance: ${rating['performanceScore'] ?? 'Insufficient evidence'}',
      ),
      trailing: const Chip(label: Text('NO AUTO-DELETE')),
    ),
  );

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
