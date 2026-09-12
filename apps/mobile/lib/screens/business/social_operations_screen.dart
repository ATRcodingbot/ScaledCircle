import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../../widgets/customer_social_plan_card.dart';
import '../../widgets/customer_social_post_editor.dart';
import '../../widgets/social_plan_overview.dart';
import '../../models/social_plan_presentation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/attribution_service.dart';
import '../../services/social_operations_service.dart';
import '../../widgets/social_runtime_status_card.dart';
import '../../widgets/social_connection_card.dart';
import '../../navigation/context_back_button.dart';

class SocialOperationsScreen extends StatefulWidget {
  const SocialOperationsScreen({super.key, this.initialReview});
  final String? initialReview;

  @override
  State<SocialOperationsScreen> createState() => _SocialOperationsScreenState();
}

class _SocialOperationsScreenState extends State<SocialOperationsScreen> {
  final _service = SocialOperationsService();
  final _attribution = AttributionService();
  SocialOperationsWorkspace? _workspace;
  Map<String, dynamic>? _firstX;
  bool _loading = true;
  int _loadGeneration = 0;
  int _approvalReadAttempts = 0;
  Timer? _approvalRefresh;
  final _approvalReadback = SocialPlanApprovalReadback();
  bool _reviewingContent = false;
  bool _initialReviewOpened = false;
  bool _ratingPosts = false;
  bool _aligningPlan = false;
  bool _preparingFirstX = false;
  bool _authorizingFirstX = false;
  bool _approvingFirstX = false;
  bool _publishingFirstX = false;
  String? _error;
  bool _invitationRequired = false;
  Timer? _connectionRefresh;
  bool _connecting = false;
  bool _reviewingConnection = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _connectionRefresh?.cancel();
    _approvalRefresh?.cancel();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    final generation = ++_loadGeneration;
    setState(() {
      if (!quiet) _loading = true;
      _error = null;
      _invitationRequired = false;
    });
    try {
      final value = await _service.load();
      Map<String, dynamic>? firstX;
      if (value.firstXCertificationAvailable) {
        firstX = await _service.firstXPublishCertification();
      }
      if (mounted && generation == _loadGeneration) {
        setState(() {
          _approvalReadback.reconcile(value.plans);
          _workspace = value;
          _firstX = firstX;
        });
        if (!_initialReviewOpened && widget.initialReview != null) {
          _initialReviewOpened = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              _reviewSavedPlans(
                value,
                strategyOnly: widget.initialReview == 'plan',
              );
            }
          });
        }
        _connectionRefresh?.cancel();
        if (value.connections.any(
          (c) =>
              c['provider'] == 'facebook' &&
              (c['pendingAttemptId']?.toString().isNotEmpty ?? false),
        )) {
          _connectionRefresh = Timer(const Duration(seconds: 30), () {
            if (mounted && generation == _loadGeneration) _load(quiet: true);
          });
        }
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted && generation == _loadGeneration) {
        setState(() {
          _invitationRequired =
              error.details is Map &&
              (error.details as Map)['reason'] == 'SOCIAL_INVITATION_REQUIRED';
          _error = socialEvidenceText(
            error.message,
            'Unable to confirm Social Operations. Try again.',
          );
          if (_invitationRequired) {
            _workspace = null;
            _error =
                'Social Manager is Private Beta / Invite Only. Your other Business tools remain available in Growth.';
          }
        });
      }
    } catch (_) {
      if (mounted && generation == _loadGeneration) {
        setState(
          () => _error =
              'Unable to confirm the latest Social status. Try refreshing.',
        );
      }
    } finally {
      if (mounted && generation == _loadGeneration) {
        setState(() => _loading = false);
        _approvalRefresh?.cancel();
        if (_approvalReadback.pending && _approvalReadAttempts < 3) {
          _approvalReadAttempts++;
          _approvalRefresh = Timer(const Duration(seconds: 2), () {
            if (mounted) _load(quiet: true);
          });
        }
      }
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
              content: Text(
                socialEvidenceText(error.message, 'Unable to create the plan.'),
              ),
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
        content: Text(
          plan['strategy'] is Map
              ? 'Approve this strategy and proposed calendar. Posts still need separate content review and approval. Nothing will be scheduled or published.'
              : 'Approval applies to the current calendar and platform-specific drafts. Nothing will publish until an account is connected and publishing is separately enabled.',
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
      if (!mounted) return;
      setState(() {
        _approvalReadback.acknowledge(
          plan['id'].toString(),
          (plan['planVersion'] as num).toInt(),
        );
        _approvalReadAttempts = 0;
      });
      await _load(quiet: true);
      if (mounted && plan['strategy'] is Map) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
              '30-Day Plan Approved. Review the draft posts next.',
            ),
            action: SnackBarAction(
              label: 'Review Draft Posts',
              onPressed: () {
                final workspace = _workspace;
                if (workspace != null) _reviewSavedPlans(workspace);
              },
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              socialEvidenceText(error.message, 'Unable to approve the plan.'),
            ),
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
              socialEvidenceText(
                error.message,
                'Unable to align the existing plan.',
              ),
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
              content: Text(
                socialEvidenceText(
                  error.message,
                  'Unable to create email content.',
                ),
              ),
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
    'attention_required',
    'error',
  }.contains(status);

  Future<void> _beginConnection(
    String provider, {
    bool managedPublishing = false,
  }) async {
    if (_connecting) return;
    setState(() => _connecting = true);
    try {
      final result = await _service.beginReadOnlyConnection(
        _oauthProvider(provider),
        managedPublishing: managedPublishing,
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
                'Finish connecting with $providerLabel, then choose your Business account.',
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
              'Finish the Facebook steps, then choose your Business Page here.',
            ),
          ),
        );
      }
    } on FirebaseFunctionsException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "We couldn't connect this account. Please try again.",
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _connecting = false);
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
        title: Text('Connect with $providerLabel'),
        content: Text(
          popupOpened
              ? 'Review the permissions in the $providerLabel tab. If it did not open, continue here.'
              : 'Continue to $providerLabel to review the permissions for your Business.',
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
      if (['expired', 'error', 'canceled'].contains(attempt['status'])) {
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
                'Finish connecting with $providerLabel, then choose your Business account.',
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
    } on FirebaseFunctionsException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("We couldn't finish connecting. Please try again."),
          ),
        );
      }
    }
  }

  Future<void> _reviewConnection(Map<String, dynamic> connection) async {
    if (_reviewingConnection) return;
    final attemptId = connection['pendingAttemptId']?.toString() ?? '';
    if (attemptId.isEmpty) return;
    _reviewingConnection = true;
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
                'Finish the Facebook steps first. Then choose your Business Page here.',
              ),
            ),
          );
        }
        return;
      }
      if (!mounted) return;
      final isMeta =
          _oauthProvider(connection['provider']?.toString() ?? '') == 'meta';
      final selected = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (context) =>
            SocialAccountPicker(candidates: candidates, isMeta: isMeta),
      );
      if (selected == null) {
        if (isMeta) await _service.cancelConnectionAttempt(attemptId);
        await _load();
        return;
      }
      await _service.confirmReadOnlyConnection(
        attemptId: attemptId,
        candidateId: selected['candidateId']?.toString() ?? '',
      );
      await _load();
    } on FirebaseFunctionsException {
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Facebook wasn't connected. Please try again."),
          ),
        );
      }
    } finally {
      _reviewingConnection = false;
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
      if (attempt['status'] == 'expired' ||
          attempt['writeScopesRequested'] != true) {
        await _load();
        _showFirstXError(
          'This X authorization attempt expired. Choose Start fresh X authorization.',
        );
        return;
      }
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
            content: Text(
              socialEvidenceText(
                error.message,
                'Performance sync is unavailable.',
              ),
            ),
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
            content: Text(
              socialEvidenceText(
                error.message,
                'Content review is unavailable.',
              ),
            ),
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
            content: Text(
              socialEvidenceText(
                error.message,
                'Past-post review is unavailable.',
              ),
            ),
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
      appBar: AppBar(
        leading: const ContextBackButton(
          fallback: '/business/growth',
          businessOnly: true,
        ),
        title: const Text('Social Operations — Beta'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_approvalReadback.pending)
                      const Text(
                        'Plan approved — status refresh pending. Your approval was saved.',
                      ),
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _invitationRequired
                          ? () => Navigator.pushReplacementNamed(
                              context,
                              '/business/growth',
                            )
                          : _load,
                      child: Text(
                        _invitationRequired ? 'Back to Growth' : 'Try Again',
                      ),
                    ),
                  ],
                ),
              ),
            )
          : _body(_workspace!),
    );
  }

  Widget _body(SocialOperationsWorkspace workspace) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1080),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 820;
          return ListView(
            padding: EdgeInsets.all(wide ? 24 : 16),
            children: [
              Text(
                workspace.managedGrowth
                    ? 'Your managed marketing workspace'
                    : 'Plan, approve, and measure your marketing',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Connect → Plan → Review → Schedule → Measure → Improve',
              ),
              const SizedBox(height: 16),
              SocialRuntimeStatusCard(
                onReviewPosts: () => _reviewSavedPlans(workspace),
                status: _approvalReadback.pending
                    ? {
                        'available': true,
                        'summary': {
                          'title': 'Plan approved — refreshing status…',
                          'description':
                              'Your strategy approval succeeded. We are confirming the latest post-review state.',
                        },
                      }
                    : workspace.runtimeStatus,
                onRefresh: _load,
                compact: true,
              ),
              const SizedBox(height: 16),
              _section('30-Day Plan', _plans(workspace)),
              _section(
                'Content',
                SocialPlanOverview(
                  presentation: SocialPlanPresentation(
                    workspace.plans,
                    workspace.runtimeStatus,
                  ),
                  refreshingApproval: _approvalReadback.pending,
                  onReview: workspace.plans.isEmpty
                      ? _createPlan
                      : () => _reviewSavedPlans(workspace),
                ),
              ),
              _notice(),
              const SizedBox(height: 16),
              _section('Connections', _connections(workspace, wide)),
              if (workspace.firstXCertificationAvailable)
                _section('First X publish candidate', _firstXPublishCard()),
              _section('Content Health', _contentHealth(workspace)),
              _section("What's Working", _learning(workspace)),
              if (workspace.managedGrowth &&
                  workspace.internalDevelopmentAvailable)
                _section('30-Day Email Content', _email(workspace)),
              _section('Ads — Read Only', _ads(workspace, wide)),
            ],
          );
        },
      ),
    ),
  );

  Widget _notice() => const Card(
    child: ListTile(
      leading: Icon(Icons.shield_outlined),
      title: Text('Your accounts. Your approval.'),
      subtitle: Text(
        'Connect your Business accounts to view performance, prepare content and measure results. Publishing follows your approval settings and the permissions shown below.',
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

  Future<void> _cancelConnection(Map<String, dynamic> connection) async {
    try {
      await _service.cancelConnectionAttempt(
        connection['pendingAttemptId']?.toString() ?? '',
      );
      await _load();
    } on FirebaseFunctionsException {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              "We couldn't cancel this connection. Please try again.",
            ),
          ),
        );
      }
    }
  }

  Future<void> _enablePublishing(String provider) async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Enable Managed Publishing'),
        content: const Text(
          'Allow ScaledCircle to schedule and publish Social content according to your approval settings. You will review permissions with Facebook. No content will be published by connecting. Your current setting requires approval for each plan.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Continue with Facebook'),
          ),
        ],
      ),
    );
    if (accepted == true) {
      await _beginConnection(provider, managedPublishing: true);
    }
  }

  Future<void> _manageConnection(Map<String, dynamic> connection) async {
    final provider = connection['provider']?.toString() ?? '';
    final instagram = _workspace?.connections
        .where((c) => c['provider'] == 'instagram')
        .firstOrNull;
    final update = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Manage Connection'),
        content: SizedBox(
          width: 440,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  connection['accountDisplayName']?.toString() ??
                      socialProviderName(provider),
                ),
                if (provider == 'facebook')
                  Text(
                    instagram != null && socialAccountConnected(instagram)
                        ? 'Linked Instagram: ${instagram['handle'] ?? instagram['accountDisplayName']}'
                        : "Instagram isn't connected yet.",
                  ),
                const SizedBox(height: 12),
                Text(
                  'Analytics: ${socialAnalyticsEnabled(connection) ? 'On' : 'Off'}',
                ),
                Text(
                  'Managed Publishing: ${socialPublishingEnabled(connection, _workspace?.publishingEnabled == true) ? 'Ready' : 'Off'}',
                ),
                const SizedBox(height: 12),
                const Text(
                  'You control which Business account is connected. Review permissions to restore missing analytics or reconnect your account.',
                ),
                const SizedBox(height: 8),
                const Text(
                  'Connection permission does not approve posts. Your content approval settings still apply.',
                ),
              ],
            ),
          ),
        ),
        actions: [
          if (socialAnalyticsEnabled(connection))
            TextButton(
              onPressed: () {
                Navigator.pop(context, false);
                unawaited(_syncPerformance(provider));
              },
              child: const Text('Refresh Analytics'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Done'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Update Permissions'),
          ),
        ],
      ),
    );
    if (update == true) await _beginConnection(provider);
  }

  Widget _connections(
    SocialOperationsWorkspace workspace,
    bool wide,
  ) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = constraints.maxWidth < 560
          ? 1
          : wide
          ? 4
          : 2;
      final width = (constraints.maxWidth - 8 * (columns - 1)) / columns;
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final connection in workspace.availableConnections)
            SizedBox(
              width: width,
              child: SocialConnectionCard(
                connection: connection,
                publishingEnabled: workspace.publishingEnabled,
                busy: _connecting,
                onConnect: () =>
                    _beginConnection(connection['provider']?.toString() ?? ''),
                onContinue: () => _continueConnection(connection),
                onChoose: () => _reviewConnection(connection),
                onCancel: () => _cancelConnection(connection),
                onManage: () => _manageConnection(connection),
                onEnablePublishing:
                    workspace.managedPublishingAvailable &&
                        [
                          'facebook',
                          'instagram',
                        ].contains(connection['provider'])
                    ? () => _enablePublishing(connection['provider'].toString())
                    : null,
              ),
            ),
        ],
      );
    },
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
                          ? 'Start fresh X authorization'
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

  List<Map<String, dynamic>> _postReviewPlans(
    SocialOperationsWorkspace workspace, {
    required bool strategyOnly,
    required bool scheduledOnly,
  }) {
    if (strategyOnly) return workspace.plans;
    final drafts =
        SocialPlanPresentation(
          workspace.plans,
          workspace.runtimeStatus,
        ).draftPosts >
        0;
    return workspace.plans
        .map(
          (plan) => <String, dynamic>{
            ...plan,
            'items': (plan['items'] as List? ?? [])
                .whereType<Map>()
                .map(
                  (item) => <String, dynamic>{
                    ...item,
                    'variants': (item['variants'] as List? ?? [])
                        .whereType<Map>()
                        .where(
                          (v) => scheduledOnly
                              ? v['status'] == 'scheduled'
                              : !drafts ||
                                    ![
                                      'approved',
                                      'scheduled',
                                      'published',
                                    ].contains(v['status']),
                        )
                        .toList(),
                  },
                )
                .where((item) => (item['variants'] as List).isNotEmpty)
                .toList(),
          },
        )
        .toList();
  }

  Future<void> _reviewSavedPlans(
    SocialOperationsWorkspace workspace, {
    bool strategyOnly = false,
    bool scheduledOnly = false,
  }) {
    final presentation = SocialPlanPresentation(
      workspace.plans,
      workspace.runtimeStatus,
    );
    final scheduleView =
        scheduledOnly ||
        (!strategyOnly &&
            presentation.draftPosts == 0 &&
            (presentation.count('scheduled') ?? 0) > 0);
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .85,
          child: Column(
            children: [
              ListTile(
                title: Text(
                  scheduleView
                      ? 'View Schedule'
                      : strategyOnly &&
                            SocialPlanPresentation(
                              workspace.plans,
                              workspace.runtimeStatus,
                            ).allApproved
                      ? 'View Approved Plan'
                      : SocialPlanPresentation(
                          workspace.plans,
                          workspace.runtimeStatus,
                        ).allApproved
                      ? (presentation.draftPosts > 0
                            ? 'Review Draft Posts'
                            : 'View Results')
                      : 'Review 30-Day Plan',
                ),
                trailing: IconButton(
                  tooltip: 'Close review',
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ),
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'Reviewing does not approve or schedule any content.',
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    for (final plan in _postReviewPlans(
                      workspace,
                      strategyOnly: strategyOnly,
                      scheduledOnly: scheduleView,
                    ))
                      CustomerSocialPlanCard(
                        plan: plan,
                        initiallyExpanded: true,
                        strategyOnly: strategyOnly,
                        onPreparePost: (post) {
                          Navigator.pop(context);
                          _preparePost(post);
                        },
                        onResolveBlocker: (code, post) {
                          Navigator.pop(context);
                          _resolvePostBlocker(code, post);
                        },
                        onSchedulePost: (post) {
                          Navigator.pop(context);
                          _schedulePost(post);
                        },
                        onApprove: () {
                          Navigator.pop(context);
                          _approvePlan(plan);
                        },
                      ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Back'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _preparePost(Map<String, dynamic> post) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CustomerSocialPostEditor(post: post, service: _service),
      ),
    );
    if (mounted) await _load(quiet: true);
  }

  Future<void> _resolvePostBlocker(
    String code,
    Map<String, dynamic> post,
  ) async {
    if (['creative', 'quality', 'time', 'content'].contains(code)) {
      await _preparePost(post);
      return;
    }
    if (code == 'permission') {
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Manage Connection',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                if (_workspace != null) _connections(_workspace!, false),
              ],
            ),
          ),
        ),
      );
      return;
    }
    if (code == 'paused' || code == 'scheduler') {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            code == 'paused'
                ? 'Publishing settings'
                : 'Social Manager availability',
          ),
          content: Text(
            code == 'paused'
                ? 'Publishing is paused by the workspace safety controls. Drafts are preserved. An Admin must review this safety hold before approved posts can run. Opening these settings does not resume publishing.'
                : 'Social Manager is Private Beta / Invite Only. Your workspace needs current scheduling access before posts can run.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back'),
            ),
            TextButton(
              onPressed: () => launchUrl(
                Uri.parse(
                  'mailto:support@scaledcircle.com?subject=Social%20publishing%20access%20review',
                ),
              ),
              child: const Text('Request access review'),
            ),
          ],
        ),
      );
      return;
    }
    await _load(quiet: true);
  }

  Future<void> _schedulePost(Map<String, dynamic> post) async {
    try {
      final preview = await _service.previewPost({
        'itemId': post['itemId'],
        'provider': post['provider'],
      });
      if (!mounted) return;
      if (preview['ready'] != true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              (preview['reasons'] as List? ?? [])
                  .whereType<Map>()
                  .map((r) => r['message'])
                  .join(' '),
            ),
          ),
        );
        await _load(quiet: true);
        return;
      }
      final reviewed = preview['reviewedPost'] as Map;
      final variant = reviewed['variant'] as Map;
      for (final image
          in (reviewed['images'] as List? ?? []).whereType<Map>()) {
        if (!mounted) return;
        var failed = false;
        await precacheImage(
          NetworkImage(image['url'].toString()),
          context,
          onError: (_, stack) {
            failed = true;
          },
        );
        if (failed) throw StateError('Creative could not be displayed.');
      }
      if (!mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Approve & Schedule'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final image
                    in (reviewed['images'] as List? ?? []).whereType<Map>())
                  Image.network(
                    image['url'].toString(),
                    errorBuilder: (_, error, stack) => const Text(
                      'Image unavailable. Go back before approving.',
                    ),
                  ),
                Text(
                  [
                    socialProviderName(preview['provider']?.toString() ?? ''),
                    reviewed['accountName'],
                    variant['copy'],
                    'Creative: ${variant['mediaRevisionId'] != null ? 'Prepared version shown in the post' : 'Text only'}',
                    'Call to action: ${variant['callToAction'] ?? 'None'}',
                    'Destination: ${variant['destinationUrl'] ?? 'None'}',
                    'Publish: ${DateTime.tryParse(preview['scheduledFor']?.toString() ?? '')?.toLocal()}',
                    'This approves only this exact post and future publish time.',
                  ].join('\n\n'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Back'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Approve & Schedule'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      final result = await _service.approveAndSchedulePost({
        'itemId': post['itemId'],
        'provider': preview['provider'],
        'version': preview['version'],
        'contentHash': preview['contentHash'],
        'bindingHash': preview['bindingHash'],
        'reviewDigest': preview['reviewDigest'],
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result['status'] == 'scheduled'
                ? 'Post scheduled: ${DateTime.tryParse(result['scheduledFor']?.toString() ?? '')?.toLocal()}'
                : 'Scheduling needs attention. Review the current post requirements.',
          ),
        ),
      );
      socialReviewRevision.value++;
      await _load(quiet: true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Scheduling could not be confirmed. Check the saved post status before trying again.',
            ),
          ),
        );
      }
      await _load(quiet: true);
    }
  }

  Widget _plans(SocialOperationsWorkspace workspace) {
    final cadence = workspace.data['cadence'] as Map?;
    final alignment = workspace.internalPlanAlignment;
    final migrationAvailable = alignment?['migrationAvailable'] == true;
    return Column(
      children: [
        if (cadence != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Social cadence',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(cadence['startingCopy']?.toString() ?? ''),
                  const Text(
                    'Adaptive recommendations. Cadence changes need your approval; no managed range has been granted.',
                  ),
                  for (final platform
                      in (cadence['platforms'] as List? ?? []).whereType<Map>())
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '${socialProviderName(platform['provider']?.toString() ?? '')}: ${platform['decision']}\n${platform['reason']}',
                      ),
                    ),
                ],
              ),
            ),
          ),
        if (workspace.managedPublishingAvailable && workspace.plans.isEmpty)
          FilledButton.icon(
            onPressed: _loading
                ? null
                : () async {
                    setState(() => _loading = true);
                    try {
                      await _service.prepareCustomerPlan();
                      await _load();
                    } catch (_) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'The plan could not be confirmed. Refresh to check saved plans before retrying.',
                            ),
                          ),
                        );
                      }
                    } finally {
                      if (mounted) setState(() => _loading = false);
                    }
                  },
            icon: const Icon(Icons.auto_awesome_outlined),
            label: const Text('Prepare my 30-day draft strategy'),
          ),
        if (!_approvalReadback.pending)
          for (final plan in workspace.plans)
            if (socialPlanApproved(plan))
              Card(
                child: ListTile(
                  title: const Text('30-Day Plan · Approved ✓'),
                  subtitle: Text(
                    plan['goal']?.toString() ?? 'Approved strategy',
                  ),
                  trailing: TextButton(
                    onPressed: () =>
                        _reviewSavedPlans(workspace, strategyOnly: true),
                    child: const Text('View Approved Plan'),
                  ),
                ),
              )
            else if (plan['strategy'] is Map)
              CustomerSocialPlanCard(
                plan: plan,
                onApprove: () => _approvePlan(plan),
                onReviewPosts: () => _reviewSavedPlans(workspace),
              )
            else
              Card(
                child: ListTile(
                  leading: const Icon(Icons.calendar_month_outlined),
                  title: Text(
                    plan['goal']?.toString() ?? '30-day content plan',
                  ),
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
    final presentation = SocialPlanPresentation(
      workspace.plans,
      workspace.runtimeStatus,
    );
    final health = workspace.contentHealth;
    final scheduled = (health['scheduled'] as List? ?? const [])
        .whereType<Map>()
        .toList(growable: false);
    final pastPosts = (health['pastPosts'] as List? ?? const [])
        .whereType<Map>()
        .toList(growable: false);
    final assessed =
        health['assessmentStatus'] == 'assessed' ||
        (health['assessedCount'] is num &&
            (health['assessedCount'] as num) > 0);
    final needsAttention = assessed
        ? (health['needsAttentionCount'] as num?)?.toInt()
        : null;
    final strong = assessed ? (health['strongCount'] as num?)?.toInt() : null;
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
            if (presentation.count('scheduled') != null)
              _healthMetric(
                'Scheduled',
                presentation.count('scheduled')!,
                Icons.schedule,
              )
            else
              const Text('Scheduled: Not confirmed'),
            _healthMetric(
              'Reviewed Past Posts',
              pastPosts.isNotEmpty ? pastPosts.length : null,
              Icons.history,
              unknown: 'History unavailable',
            ),
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
                  'Open a draft, prepare its creative and review content quality. Automated checks cover wording, relevance, repetition and timing. You review the actual image and claims before approval. Nothing changes on your connected accounts during review.',
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (presentation.contentAction != null)
                      FilledButton.tonalIcon(
                        onPressed: _reviewingContent
                            ? null
                            : (presentation.count('scheduled') ?? 0) > 0
                            ? () => _reviewSavedPlans(
                                workspace,
                                scheduledOnly: true,
                              )
                            : () => _reviewSavedPlans(workspace),
                        icon: const Icon(Icons.fact_check_outlined),
                        label: Text(
                          _reviewingContent
                              ? 'Reviewing…'
                              : presentation.contentAction!,
                        ),
                      ),
                    if (workspace.internalDevelopmentAvailable &&
                        workspace.data['legacyContentReviewAvailable'] == true)
                      TextButton(
                        onPressed: _reviewingContent
                            ? null
                            : _reviewScheduledContent,
                        child: const Text('Check content quality'),
                      ),
                    if (workspace.internalDevelopmentAvailable &&
                        workspace.data['legacyContentReviewAvailable'] ==
                            true &&
                        (pastPosts.isNotEmpty ||
                            (presentation.count('published') ?? 0) > 0))
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
              title: Text('Content assessment not available yet'),
              subtitle: Text(
                'Use the review action above for your current content. Performance assessments appear when supporting evidence is available.',
              ),
            ),
          ),
      ],
    );
  }

  Widget _healthMetric(
    String label,
    int? value,
    IconData icon, {
    String unknown = 'Not assessed yet',
  }) => SizedBox(
    width: 170,
    child: Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(
          value == null ? unknown : '$value',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(label),
      ),
    ),
  );

  Widget _qualityCard(Map<String, dynamic> assessment) => Card(
    child: ListTile(
      leading: CircleAvatar(child: Text('${assessment['score'] ?? '—'}')),
      title: Text(socialQualityLabel(assessment['recommendation'])),
      subtitle: Text(
        '${socialQualityLabel(assessment['qualityBand'])} · Business approval is required before any replacement, reschedule, or removal.',
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
