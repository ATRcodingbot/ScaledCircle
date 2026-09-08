import '../../../widgets/reserve_settlement_panel.dart';
import '../../jobs/job_room_screen.dart';
import 'package:flutter/material.dart';
import '../../../widgets/completion_pay_summary.dart';
import '../../../models/canvassing_photo_policy.dart';
import '../../../services/job_room_service.dart';
import '../../../widgets/completion_evidence_panel.dart';
import '../../../widgets/campaign_card_header.dart';

import '../../../models/campaign/campaign_completion.dart';
import '../../../services/campaign/campaign_service.dart';
import '../../../services/completion_payout_service.dart';

class CompletionReviewScreen extends StatefulWidget {
  final String completionId;
  final String scalerId;
  final String campaignId;
  final String? zoneId;

  const CompletionReviewScreen({
    super.key,
    required this.completionId,
    required this.scalerId,
    required this.campaignId,
    this.zoneId,
  });

  @override
  State<CompletionReviewScreen> createState() => _CompletionReviewScreenState();
}

class _CompletionReviewScreenState extends State<CompletionReviewScreen> {
  final CampaignService _campaignService = CampaignService();
  late Future<CampaignCompletion?> _completionFuture;

  bool _processing = false;
  Map<String, dynamic>? _room;
  String? _evidenceError;
  String get _scalerLabel {
    final labels = _room?['participantLabels'];
    if (labels is Map && labels['participants'] is List) {
      for (final item in labels['participants'] as List) {
        if (item is Map && item['uid'] == widget.scalerId) {
          final name = item['displayName']?.toString().trim() ?? '';
          if (name.isNotEmpty) return name;
        }
      }
    }
    final completions = _room?['completions'];
    if (completions is List) {
      for (final item in completions) {
        if (item is Map && item['scalerId'] == widget.scalerId) {
          final email = item['scalerEmail']?.toString().trim() ?? '';
          if (email.isNotEmpty) return email;
        }
      }
    }
    return 'Assigned Scaler — name unavailable';
  }

  String get _campaignLabel {
    final campaign = _room?['campaign'];
    final name = campaign is Map
        ? campaign['campaignName']?.toString().trim()
        : null;
    return name == null || name.isEmpty
        ? 'Campaign name unavailable'
        : campaignDisplayName(name);
  }

  bool get _evidenceReview => widget.zoneId != null;
  bool get _approvalHeld {
    if (!_evidenceReview) return false;
    if (_room == null || _evidenceError != null) return true;
    final evidence = _room!['completionEvidence'];
    if (evidence is Map) {
      return (evidence['policy'] as Map?)?['ordinarySubmissionAllowed'] != true;
    }
    final campaign = _room!['campaign'];
    final zone = _room!['zone'];
    return prohibitsResidentialPhotos(
      (campaign is Map ? campaign['campaignType'] : null) ??
          (zone is Map ? zone['campaignType'] : null),
    );
  }

  @override
  void initState() {
    super.initState();
    _completionFuture = _campaignService
        .getCompletion(widget.completionId)
        .timeout(const Duration(seconds: 25));
    if (widget.zoneId != null) _loadEvidence();
  }

  Future<void> _loadEvidence() async {
    try {
      final room = await const JobRoomService()
          .load(widget.zoneId!)
          .timeout(const Duration(seconds: 25));
      if (mounted) {
        setState(() {
          _room = room;
          _evidenceError = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _evidenceError = 'Evidence unavailable. Retry before review.',
        );
      }
    }
  }

  Future<void> _approveCompletion() async {
    if (_approvalHeld) return;
    setState(() {
      _processing = true;
    });

    try {
      if (widget.zoneId != null) {
        await CompletionPayoutService().approvePayout(payoutId: widget.zoneId!);
      } else {
        await _campaignService.approveCompletion(
          completionId: widget.completionId,
          businessFeedback: "Completion approved.",
        );
      }

      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("Completion approved.")));

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Approval could not be confirmed. Reopen the Job Room to check its status before trying again.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _processing = false;
        });
      }
    }
  }

  Future<void> _rejectCompletion() async {
    if (widget.zoneId != null) return;
    setState(() {
      _processing = true;
    });

    try {
      await _campaignService.rejectCompletion(
        completionId: widget.completionId,
        feedback: "Completion rejected.",
      );

      if (!mounted) return;

      Navigator.pop(context);
    } finally {
      if (mounted) {
        setState(() {
          _processing = false;
        });
      }
    }
  }

  Future<void> _requestChanges() async {
    setState(() {
      _processing = true;
    });

    try {
      if (widget.zoneId != null) {
        await CompletionPayoutService().requestRedo(
          payoutId: widget.zoneId!,
          feedback: "Please update completion proof.",
        );
      } else {
        await _campaignService.requestCompletionChanges(
          completionId: widget.completionId,
          feedback: "Please update completion proof.",
        );
      }

      if (!mounted) return;

      Navigator.pop(context);
    } finally {
      if (mounted) {
        setState(() {
          _processing = false;
        });
      }
    }
  }

  Widget _proofCard(CompletionProof proof) {
    final isGpsRoute = proof.type == CompletionProofType.gpsRoute;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(isGpsRoute ? Icons.route : Icons.photo),

        title: Text(isGpsRoute ? "GPS Route" : "Photo Evidence"),

        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isGpsRoute)
              Text(proof.note ?? 'Saved GPS route attached.')
            else
              Text(proof.fileUrl ?? 'Photo unavailable.'),

            if (proof.latitude != null && proof.longitude != null)
              Text("GPS: ${proof.latitude}, ${proof.longitude}"),
          ],
        ),
      ),
    );
  }

  String _notesText(CampaignCompletion completion) {
    final notes = completion.scalerNotes;

    if (notes == null || notes.trim().isEmpty) {
      return "No notes submitted.";
    }

    return notes;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Completion Review")),

      body: FutureBuilder<CampaignCompletion?>(
        future: _completionFuture,

        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Completion details could not be loaded. No approval was submitted.',
                  ),
                  TextButton(
                    onPressed: () => setState(() {
                      _completionFuture = _campaignService
                          .getCompletion(widget.completionId)
                          .timeout(const Duration(seconds: 25));
                    }),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          final completion = snapshot.data;

          if (completion == null) {
            return const Center(child: Text("Completion not found."));
          }

          final awaitingReview =
              completion.status == CampaignCompletionStatus.submitted;

          return ListView(
            padding: const EdgeInsets.all(20),

            children: [
              const Icon(Icons.assignment_turned_in, size: 70),

              const SizedBox(height: 20),

              Text(
                "Campaign Completion",
                style: Theme.of(context).textTheme.headlineSmall,
              ),

              const SizedBox(height: 20),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.person),
                  title: const Text("Scaler"),
                  subtitle: Text(_scalerLabel),
                ),
              ),

              if (widget.zoneId != null)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.account_balance_wallet_outlined),
                    title: Text('Review before payment'),
                    subtitle: Text(
                      'Check the route, agreed pay, and payable amount below. Approval records the earning once; withdrawing money is a separate step.',
                    ),
                  ),
                ),

              if (_room?['completionEvidence'] is Map)
                CompletionPaySummary(
                  evidence: Map<String, dynamic>.from(
                    _room!['completionEvidence'] as Map,
                  ),
                  submitted: awaitingReview,
                ),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.route),
                  title: const Text('GPS Route Captured'),
                  subtitle: Text(
                    completion.hasGpsEvidence
                        ? "${completion.gpsPointCount} recorded route points"
                              "${completion.routeSimulated ? ' (test simulation)' : ''}"
                        : "GPS route evidence unavailable",
                  ),
                  trailing: Icon(
                    completion.hasGpsEvidence
                        ? Icons.route
                        : Icons.error_outline,
                    color: completion.hasGpsEvidence
                        ? Colors.green
                        : Colors.red,
                  ),
                ),
              ),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.campaign),
                  title: const Text("Campaign"),
                  subtitle: Text(_campaignLabel),
                ),
              ),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.info),
                  title: const Text("Status"),
                  subtitle: Text(switch (completion.status) {
                    CampaignCompletionStatus.submitted =>
                      'Awaiting Business Review',
                    CampaignCompletionStatus.approved => 'Approved',
                    CampaignCompletionStatus.changesRequested =>
                      'Changes requested',
                    CampaignCompletionStatus.inProgress => 'Work in progress',
                    CampaignCompletionStatus.rejected => 'Not approved',
                    CampaignCompletionStatus.draft => 'Draft',
                  }),
                ),
              ),

              const SizedBox(height: 20),

              const Text(
                "Scaler Notes",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 8),

              Text(_notesText(completion)),

              const SizedBox(height: 20),

              const Text(
                "Completion Evidence",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 10),

              if (completion.proofs.isEmpty)
                const Card(
                  child: ListTile(title: Text("No evidence attached.")),
                ),

              ...completion.proofs.map(_proofCard),

              if (_evidenceReview && _room == null) ...[
                Text(_evidenceError ?? 'Loading authoritative evidence...'),
                TextButton(
                  onPressed: _loadEvidence,
                  child: const Text('Retry evidence'),
                ),
              ],
              if (_room?['completionEvidence'] is Map)
                CompletionEvidencePanel(
                  evidence: Map<String, dynamic>.from(
                    _room!['completionEvidence'] as Map,
                  ),
                ),
              if (_room?['reserveSettlement'] is Map)
                ReserveSettlementPanel(
                  settlement: Map<String, dynamic>.from(
                    _room!['reserveSettlement'] as Map,
                  ),
                ),
              if (widget.zoneId != null)
                TextButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => JobRoomScreen(zoneId: widget.zoneId!),
                    ),
                  ),
                  child: const Text('Message Scaler in Job Room'),
                ),
              const SizedBox(height: 30),

              if (awaitingReview)
                SizedBox(
                  height: 55,
                  width: double.infinity,

                  child: ElevatedButton(
                    onPressed: _processing || _approvalHeld
                        ? null
                        : _approveCompletion,

                    child: _processing
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(
                            _room?['completionEvidence']?['policy']?['payableAmountCents']
                                    is num
                                ? 'Approve \$${((_room!['completionEvidence']['policy']['payableAmountCents'] as num) / 100).toStringAsFixed(2)}'
                                : 'Approve Completion',
                          ),
                  ),
                ),

              if (awaitingReview) const SizedBox(height: 15),

              if (awaitingReview)
                SizedBox(
                  height: 55,
                  width: double.infinity,

                  child: OutlinedButton(
                    onPressed: _processing ? null : _requestChanges,

                    child: const Text("Request Changes"),
                  ),
                ),

              if (awaitingReview && widget.zoneId == null)
                const SizedBox(height: 15),

              if (awaitingReview && widget.zoneId == null)
                TextButton(
                  onPressed: _processing ? null : _rejectCompletion,
                  child: const Text("Reject Completion"),
                ),
            ],
          );
        },
      ),
    );
  }
}
