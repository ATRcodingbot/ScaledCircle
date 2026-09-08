import 'package:flutter/material.dart';
import '../../../models/work_lifecycle_presentation.dart';
import '../../../navigation/app_router.dart';
import '../../../navigation/app_routes.dart';
import '../../../services/job_room_service.dart';
import '../../../widgets/completion_pay_summary.dart';
import '../../jobs/jobs_marketplace_screen.dart';

void returnToMyWork(BuildContext context) {
  ScaffoldMessenger.of(context).clearSnackBars();
  final router = AppRouterScope.maybeOf(context);
  final navigator = Navigator.of(context);
  navigator.popUntil((route) => route.isFirst);
  if (router != null) {
    router.navigate(AppRoutes.myWork, replace: true);
  } else {
    navigator.pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => const JobsMarketplaceScreen(initialIndex: 1),
      ),
    );
  }
}

/// A successful submission never returns to a resumable tracking screen.
class SubmittedCompletionScreen extends StatefulWidget {
  const SubmittedCompletionScreen({
    super.key,
    required this.zoneId,
    this.initialEvidence,
    this.loadRoom,
    this.onBackToWork,
  });
  final String zoneId;
  final Map<String, dynamic>? initialEvidence;
  final Future<Map<String, dynamic>> Function()? loadRoom;
  final VoidCallback? onBackToWork;
  @override
  State<SubmittedCompletionScreen> createState() =>
      _SubmittedCompletionScreenState();
}

class _SubmittedCompletionScreenState extends State<SubmittedCompletionScreen> {
  Map<String, dynamic>? _evidence;
  String? _error;
  bool _loading = true;
  bool _reviewed = false;
  @override
  void initState() {
    super.initState();
    _evidence = widget.initialEvidence;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final room =
          await (widget.loadRoom?.call() ??
                  const JobRoomService().load(widget.zoneId))
              .timeout(const Duration(seconds: 20));
      final status = (room['zone'] as Map?)?['status']?.toString();
      if (!workIsSubmitted(status) &&
          workSection(status) != WorkSection.completed) {
        throw StateError('Submission result requires reconciliation');
      }
      if (room['completionEvidence'] is! Map) {
        throw StateError('Submission evidence is not available');
      }
      if (mounted) {
        setState(() {
          _reviewed = workSection(status) == WorkSection.completed;
          _evidence = Map<String, dynamic>.from(
            room['completionEvidence'] as Map,
          );
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Your submission is saved. The latest review details could not be loaded. Retry to refresh them.',
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) (widget.onBackToWork ?? () => returnToMyWork(context))();
    },
    child: Scaffold(
      appBar: AppBar(
        title: const Text('Job Submitted'),
        automaticallyImplyLeading: false,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Icon(Icons.task_alt, size: 48),
          const Text(
            'JOB SUBMITTED',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          Text(
            _reviewed
                ? 'Business review is complete. Check Wallet for your authoritative earning status.'
                : 'Your route has been submitted. The Business can now review the work. We’ll update your earnings after approval.',
          ),
          if (_evidence != null && !_reviewed)
            CompletionPaySummary(evidence: _evidence!, submitted: true)
          else if (!_reviewed)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Text('Awaiting Business Review · payment details pending'),
            ),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) ...[
            Text(_error!),
            TextButton(onPressed: _load, child: const Text('Retry')),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: widget.onBackToWork ?? () => returnToMyWork(context),
            child: const Text('Back to My Work'),
          ),
        ],
      ),
    ),
  );
}
