import 'package:flutter/material.dart';

import '../../../services/completion_service.dart';

class CompletionReviewScreen extends StatefulWidget {
  final String campaignId;
  final String scalerId;
  final String businessId;

  const CompletionReviewScreen({
    super.key,
    required this.campaignId,
    required this.scalerId,
    required this.businessId,
  });

  @override
  State<CompletionReviewScreen> createState() => _CompletionReviewScreenState();
}

class _CompletionReviewScreenState extends State<CompletionReviewScreen> {
  final CompletionService _completionService = CompletionService();

  bool _processing = false;

  Future<void> _approveCompletion() async {
    setState(() {
      _processing = true;
    });

    try {
      await _completionService.approveCompletion(
        campaignId: widget.campaignId,

        scalerId: widget.scalerId,

        businessId: widget.businessId,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Completion approved successfully.")),
      );

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
      const SnackBar(content: Text("Change request feature coming next.")),
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

          const SizedBox(height: 30),

          const Text(
            "Completion Proof",

            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 10),

          Card(
            child: ListTile(
              leading: const Icon(Icons.photo),

              title: const Text("Submitted Photos"),

              subtitle: const Text("Photos uploaded by scaler."),
            ),
          ),

          const SizedBox(height: 40),

          SizedBox(
            height: 55,

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
