import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../services/campaign/campaign_service.dart';
import '../completion/completion_review_screen.dart';
import '../../scaler/profile/scaler_profile_screen.dart';

class ScCampaignApplicantsScreen extends StatefulWidget {
  final String campaignId;

  const ScCampaignApplicantsScreen({super.key, required this.campaignId});

  @override
  State<ScCampaignApplicantsScreen> createState() =>
      _ScCampaignApplicantsScreenState();
}

class _ScCampaignApplicantsScreenState
    extends State<ScCampaignApplicantsScreen> {
  final CampaignService _campaignService = CampaignService();

  String? _processingScalerId;

  @override
  void initState() {
    super.initState();
  }

  Future<void> _acceptScaler(String scalerId) async {
    setState(() {
      _processingScalerId = scalerId;
    });

    try {
      await _campaignService.acceptScalerApplication(
        campaignId: widget.campaignId,
        scalerId: scalerId,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Scaler accepted successfully.")),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text("Unable to accept scaler: $e")));
    } finally {
      if (mounted) {
        setState(() {
          _processingScalerId = null;
        });
      }
    }
  }

  Future<void> _rejectScaler(String scalerId) async {
    setState(() {
      _processingScalerId = scalerId;
    });

    try {
      await _campaignService.updateApplicationStatus(
        campaignId: widget.campaignId,
        scalerId: scalerId,
        status: "rejected",
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Scaler application rejected.")),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text("Unable to reject scaler: $e")));
    } finally {
      if (mounted) {
        setState(() {
          _processingScalerId = null;
        });
      }
    }
  }

  void _openScalerProfile(String scalerId) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ScalerProfileScreen(scalerId: scalerId),
      ),
    );
  }

  void _openCompletionReview(String scalerId, String completionId) {
    if (completionId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Completion record unavailable.")),
      );

      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CompletionReviewScreen(
          completionId: completionId,
          campaignId: widget.campaignId,
          scalerId: scalerId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Campaign Applicants")),

      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _campaignService.getCampaignApplications(widget.campaignId),

        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(child: Text("No applicants yet."));
          }

          final applicants = snapshot.data!.docs;

          return ListView.builder(
            padding: const EdgeInsets.all(16),

            itemCount: applicants.length,

            itemBuilder: (context, index) {
              final applicant = applicants[index].data();

              final scalerId = applicant['scalerId'] ?? '';

              final status = applicant['status'] ?? 'pending';

              final completionId = applicant['completionId'] ?? '';

              final isProcessing = _processingScalerId == scalerId;

              return Card(
                margin: const EdgeInsets.only(bottom: 12),

                child: Padding(
                  padding: const EdgeInsets.all(16),

                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [
                      Row(
                        children: [
                          const CircleAvatar(child: Icon(Icons.person)),

                          const SizedBox(width: 12),

                          const Expanded(
                            child: Text(
                              "Scaler Applicant",

                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 8),

                      Text("Status: $status"),

                      const SizedBox(height: 16),

                      SizedBox(
                        width: double.infinity,

                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.person_search),

                          label: const Text("View Scaler Profile"),

                          onPressed: scalerId.isEmpty
                              ? null
                              : () => _openScalerProfile(scalerId),
                        ),
                      ),

                      const SizedBox(height: 10),

                      if (status == "pending")
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: isProcessing
                                    ? null
                                    : () => _rejectScaler(scalerId),
                                child: const Text("Reject"),
                              ),
                            ),

                            const SizedBox(width: 12),

                            Expanded(
                              child: ElevatedButton(
                                onPressed: isProcessing
                                    ? null
                                    : () => _acceptScaler(scalerId),
                                child: isProcessing
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Text("Accept"),
                              ),
                            ),
                          ],
                        ),

                      if (status == "submitted")
                        SizedBox(
                          width: double.infinity,

                          child: ElevatedButton.icon(
                            icon: const Icon(Icons.assignment_turned_in),

                            label: const Text("Review Completion"),

                            onPressed: () =>
                                _openCompletionReview(scalerId, completionId),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
