import 'package:flutter/material.dart';

import '../../../models/campaign/campaign_completion.dart';
import '../../../services/campaign/campaign_service.dart';

class CompletionReviewScreen extends StatefulWidget {
  final String completionId;
  final String scalerId;
  final String campaignId;

  const CompletionReviewScreen({
    super.key,
    required this.completionId,
    required this.scalerId,
    required this.campaignId,
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
      await _campaignService.approveCompletion(
        completionId: widget.completionId,
        businessFeedback: "Completion approved.",
      );

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
      await _campaignService.requestCompletionChanges(
        completionId: widget.completionId,
        feedback: "Please update completion proof.",
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

  Widget _proofCard(CompletionProof proof) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: const Icon(Icons.photo),

        title: Text(CompletionProof.proofTypeValue(proof.type)),

        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(proof.fileUrl ?? 'No photo URL available.'),

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
                "Proof Photos",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 10),

              if (completion.proofs.isEmpty)
                const Card(child: ListTile(title: Text("No proof uploaded."))),

              ...completion.proofs.map(_proofCard),

              const SizedBox(height: 30),

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

              const SizedBox(height: 15),

              SizedBox(
                height: 55,
                width: double.infinity,

                child: OutlinedButton(
                  onPressed: _processing ? null : _requestChanges,

                  child: const Text("Request Changes"),
                ),
              ),

              const SizedBox(height: 15),

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
