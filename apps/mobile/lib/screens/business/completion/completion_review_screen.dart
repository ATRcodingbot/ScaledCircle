import 'package:flutter/material.dart';

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

  bool _processing = false;

  Future<void> _approveCompletion() async {
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
        SnackBar(content: Text("Unable to approve completion: $e")),
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
        future: _campaignService.getCompletion(widget.completionId),

        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
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
                  subtitle: Text(widget.scalerId),
                ),
              ),

              if (widget.zoneId != null)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.account_balance_wallet_outlined),
                    title: Text('Authoritative approval'),
                    subtitle: Text(
                      'Approval records exactly one Wallet earning from the immutable assignment compensation. Cash-out and provider transfer remain separate.',
                    ),
                  ),
                ),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.route),
                  title: const Text("GPS Verification"),
                  subtitle: Text(
                    completion.hasGpsEvidence
                        ? "${completion.gpsPointCount} recorded route points"
                              "${completion.routeSimulated ? ' (test simulation)' : ''}"
                        : "GPS route evidence unavailable",
                  ),
                  trailing: Icon(
                    completion.hasGpsEvidence
                        ? Icons.verified
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
                  subtitle: Text(widget.campaignId),
                ),
              ),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.info),
                  title: const Text("Status"),
                  subtitle: Text(completion.status.name),
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

              const SizedBox(height: 30),

              if (awaitingReview)
                SizedBox(
                  height: 55,
                  width: double.infinity,

                  child: ElevatedButton(
                    onPressed: _processing ? null : _approveCompletion,

                    child: _processing
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text("Approve Completion"),
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
