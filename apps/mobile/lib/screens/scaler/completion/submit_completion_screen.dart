import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../models/campaign/campaign_completion.dart';
import '../../../services/campaign/campaign_service.dart';

class SubmitCompletionScreen extends StatefulWidget {
  final String campaignId;

  const SubmitCompletionScreen({super.key, required this.campaignId});

  @override
  State<SubmitCompletionScreen> createState() => _SubmitCompletionScreenState();
}

class _SubmitCompletionScreenState extends State<SubmitCompletionScreen> {
  final CampaignService _campaignService = CampaignService();

  final TextEditingController _notesController = TextEditingController();

  bool _submitting = false;

  final List<CompletionProof> _proofs = [];

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submitCompletion() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("You must be logged in.")));

      return;
    }

    setState(() {
      _submitting = true;
    });

    try {
      final completion = CampaignCompletion(
        id: '',
        campaignId: widget.campaignId,
        scalerId: user.uid,
        businessId: '',
        type: CampaignCompletionType.campaign,
        status: CampaignCompletionStatus.submitted,
        proofs: _proofs,
        scalerNotes: _notesController.text.trim(),
        createdAt: DateTime.now(),
        submittedAt: DateTime.now(),
      );

      final completionId = await _campaignService.createCompletion(
        completion: completion,
      );

      await _campaignService.createApplicationCompletionLink(
        campaignId: widget.campaignId,
        scalerId: user.uid,
        completionId: completionId,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Completion submitted for review.")),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Unable to submit completion: $e")),
      );
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  void _addProofPlaceholder() {
    setState(() {
      _proofs.add(
        CompletionProof(
          id: DateTime.now().millisecondsSinceEpoch.toString(),

          type: CompletionProofType.checkpointPhoto,

          fileUrl: "placeholder_photo",

          capturedAt: DateTime.now(),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Submit Completion")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const Text(
            "Completion Proof",
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 10),

          const Text(
            "Upload proof and submit the campaign for business review.",
          ),

          const SizedBox(height: 25),

          Card(
            child: ListTile(
              leading: const Icon(Icons.photo_camera),

              title: Text("${_proofs.length} Proof Items Added"),

              trailing: IconButton(
                icon: const Icon(Icons.add),

                onPressed: _addProofPlaceholder,
              ),
            ),
          ),

          const SizedBox(height: 20),

          TextField(
            controller: _notesController,

            maxLines: 5,

            decoration: const InputDecoration(
              labelText: "Completion Notes",

              hintText: "Describe the work completed...",

              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 35),

          SizedBox(
            height: 55,

            child: ElevatedButton(
              onPressed: _submitting ? null : _submitCompletion,

              child: _submitting
                  ? const SizedBox(
                      height: 22,

                      width: 22,

                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text("Submit Completion"),
            ),
          ),
        ],
      ),
    );
  }
}
