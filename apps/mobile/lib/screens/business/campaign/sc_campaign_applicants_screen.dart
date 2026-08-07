import 'package:flutter/material.dart';

import '../../../services/campaign_service.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Campaign Applicants")),
      body: StreamBuilder(
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

              final scalerId = applicant["scalerId"] ?? "";

              final status = applicant["status"] ?? "pending";

              final isProcessing = _processingScalerId == scalerId;

              return Card(
                margin: const EdgeInsets.only(bottom: 12),

                child: Padding(
                  padding: const EdgeInsets.all(16),

                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [
                      Text(
                        "Scaler: $scalerId",
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 8),

                      Text("Status: $status"),

                      const SizedBox(height: 16),

                      if (status == "pending")
                        SizedBox(
                          width: double.infinity,

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
                                : const Text("Accept Scaler"),
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
