import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../../models/canvassing_photo_policy.dart';
import '../../../models/work_lifecycle_presentation.dart';
import '../../../services/job_room_service.dart';
import '../../../widgets/completion_evidence_panel.dart';
import '../../../widgets/completion_pay_summary.dart';
import '../../../services/campaign/completion_submission_service.dart';
import 'submitted_completion_screen.dart';

class SubmitCompletionScreen extends StatefulWidget {
  final String campaignId, businessId, zoneId, zoneName, routeId;
  final int gpsPointCount;
  final bool routeSimulated;
  final bool canvassing;
  final Future<Map<String, dynamic>> Function()? loadRoom;
  final Future<void> Function(
    String notes,
    bool accessException,
    bool technicalReview,
  )?
  submit;
  const SubmitCompletionScreen({
    super.key,
    required this.campaignId,
    required this.businessId,
    required this.zoneId,
    required this.zoneName,
    required this.routeId,
    required this.gpsPointCount,
    required this.routeSimulated,
    this.canvassing = false,
    this.loadRoom,
    this.submit,
  });
  @override
  State<SubmitCompletionScreen> createState() => _SubmitCompletionScreenState();
}

class _SubmitCompletionScreenState extends State<SubmitCompletionScreen> {
  CompletionSubmissionService? _service;
  CompletionSubmissionService get _completionService =>
      _service ??= CompletionSubmissionService();
  final _notesController = TextEditingController();
  Map<String, dynamic>? _evidence;
  bool _submitting = false,
      _loading = true,
      _exceptionSelected = false,
      _canvassing = false;
  String? _completionId, _loadError;
  Map<String, dynamic> get _policy =>
      Map<String, dynamic>.from(_evidence?['policy'] as Map? ?? {});
  bool get _ordinaryAllowed => _policy['ordinarySubmissionAllowed'] == true;
  bool get _technicalReview => _policy['technicalReviewAllowed'] == true;
  bool get _canSubmit =>
      !_loading &&
      _loadError == null &&
      !_submitting &&
      (!_canvassing ||
          _ordinaryAllowed ||
          _technicalReview ||
          (_policy['exceptionReviewAllowed'] == true &&
              _exceptionSelected &&
              _notesController.text.trim().isNotEmpty));
  @override
  void initState() {
    super.initState();
    _canvassing = widget.canvassing;
    _prepare();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _room() =>
      (widget.loadRoom?.call() ?? const JobRoomService().load(widget.zoneId))
          .timeout(const Duration(seconds: 20));
  Future<void> _prepare() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final room = await _room();
      if (!mounted) return;
      final campaign = room['campaign'] as Map? ?? {};
      _canvassing =
          _canvassing ||
          prohibitsResidentialPhotos(
            campaign['campaignType'] ?? campaign['type'],
          );
      final evidence = room['completionEvidence'];
      if (_canvassing && evidence is! Map) {
        throw StateError('Completion eligibility unavailable');
      }
      if (evidence is Map) _evidence = Map<String, dynamic>.from(evidence);
      if (workIsSubmitted((room['zone'] as Map?)?['status']?.toString())) {
        _showSubmitted();
        return;
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _loadError =
              'Unable to load the final route and pay summary. Your saved route is retained. Retry before submitting.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitCompletion() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    try {
      if (widget.submit != null) {
        await widget.submit!(
          _notesController.text.trim(),
          _exceptionSelected,
          _technicalReview && !_exceptionSelected,
        );
      } else {
        final user = FirebaseAuth.instance.currentUser;
        if (user == null) throw StateError('Sign in to submit');
        _completionId ??= await _completionService.createDraftCompletion(
          campaignId: widget.campaignId,
          businessId: widget.businessId,
          scalerId: user.uid,
          zoneId: widget.zoneId,
          zoneName: widget.zoneName,
          routeId: widget.routeId,
        );
        await _completionService.submitCompletion(
          completionId: _completionId!,
          scalerNotes: _notesController.text.trim(),
          accessException: _exceptionSelected,
          technicalReview: _technicalReview && !_exceptionSelected,
        );
      }
      if (mounted) _showSubmitted();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Submission could not be confirmed. Your route is saved. Retry to check its authoritative result.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSubmitted() {
    ScaffoldMessenger.of(context).clearSnackBars();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => SubmittedCompletionScreen(
          zoneId: widget.zoneId,
          initialEvidence: _evidence,
          loadRoom: widget.loadRoom,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Review Completion')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'Review your route and pay',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
        if (_loading) const LinearProgressIndicator(),
        if (_evidence != null) CompletionPaySummary(evidence: _evidence!),
        if (_canvassing)
          const Text(
            'GPS records your route automatically. No residential photos or manual progress marks are required.',
          ),
        if (_loadError != null) ...[
          Text(_loadError!),
          TextButton(onPressed: _prepare, child: const Text('Retry')),
        ],
        ExpansionTile(
          title: const Text('Route captured'),
          leading: const Icon(Icons.route),
          children: [
            Text(
              '${_evidence?['proofCount'] ?? widget.gpsPointCount} GPS samples${widget.routeSimulated ? ' (test simulation)' : ''}',
            ),
            if (_evidence != null)
              CompletionEvidencePanel(evidence: _evidence!),
          ],
        ),
        ExpansionTile(
          title: const Text('Add a note (optional)'),
          children: [
            TextField(
              controller: _notesController,
              maxLines: 3,
              maxLength: 2000,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Note for Business review',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        if (_canvassing && !_ordinaryAllowed && !_loading) ...[
          FilledButton(
            onPressed: _submitting ? null : () => returnToMyWork(context),
            child: const Text('Continue Route'),
          ),
          const Text(
            'This route has been saved and tracking has stopped. Check My Work before continuing. An access restriction or technical problem can be reviewed without claiming ordinary completion.',
          ),
          if (_policy['exceptionReviewAllowed'] == true)
            CheckboxListTile(
              value: _exceptionSelected,
              onChanged: _submitting
                  ? null
                  : (v) => setState(() => _exceptionSelected = v == true),
              title: const Text('Submit for Exception Review'),
              subtitle: const Text(
                'Describe the access restriction in the optional note above.',
              ),
            ),
        ],
        const SizedBox(height: 20),
        if (!_canvassing ||
            _ordinaryAllowed ||
            _technicalReview ||
            _exceptionSelected)
          FilledButton(
            onPressed: _canSubmit ? _submitCompletion : null,
            child: Text(
              _submitting
                  ? 'Submitting…'
                  : _exceptionSelected
                  ? 'Submit for Exception Review'
                  : _technicalReview && !_ordinaryAllowed
                  ? 'Submit for Technical Review'
                  : 'Submit Completion',
            ),
          ),
        const Text(
          'Submitting sends your work for Business review. It does not post earnings.',
        ),
      ],
    ),
  );
}
