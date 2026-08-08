import 'package:flutter/material.dart';

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

  Future<void> _requestChanges() async {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Change request workflow coming next.")),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Completion Review")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const Icon(Icons.assignment_turned_in, size: 70),

          const SizedBox(height: 20),

          const Text(
            "Campaign Completion Submitted",
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
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
              leading: const Icon(Icons.assignment),

              title: const Text("Completion"),

              subtitle: Text(widget.completionId),
            ),
          ),

          const SizedBox(height: 30),

          const Text(
            "Completion Proof",
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 10),

          const Card(
            child: ListTile(
              leading: Icon(Icons.photo),

              title: Text("Submitted Photos"),

              subtitle: Text("Proof uploaded by scaler."),
            ),
          ),

          const SizedBox(height: 40),

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
        ],
      ),
    );
  }
}
