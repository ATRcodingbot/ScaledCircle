import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../models/campaign_model.dart';
import '../../../services/campaign_service.dart';
import '../../reviews/create_review_screen.dart';

class ScalerCampaignDetailsScreen extends StatefulWidget {
  final CampaignModel campaign;

  const ScalerCampaignDetailsScreen({super.key, required this.campaign});

  @override
  State<ScalerCampaignDetailsScreen> createState() =>
      _ScalerCampaignDetailsScreenState();
}

class _ScalerCampaignDetailsScreenState
    extends State<ScalerCampaignDetailsScreen> {
  final CampaignService _campaignService = CampaignService();

  bool _applying = false;

  Future<void> _applyForCampaign() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("You must be logged in.")));

      return;
    }

    setState(() {
      _applying = true;
    });

    try {
      await _campaignService.applyToCampaign(
        campaignId: widget.campaign.id,
        scalerId: user.uid,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("Application submitted!")));

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) {
        setState(() {
          _applying = false;
        });
      }
    }
  }

  Future<void> _openBusinessReview() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    final businessId = widget.campaign.businessId;

    if (businessId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Business information unavailable.")),
      );

      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreateReviewScreen(
          campaignId: widget.campaign.id,

          reviewerId: user.uid,

          reviewerType: "scaler",

          targetId: businessId,

          targetType: "business",
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final campaign = widget.campaign;

    return Scaffold(
      appBar: AppBar(title: const Text("Campaign Details")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          Text(
            campaign.campaignName,

            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 10),

          Text(campaign.description),

          const SizedBox(height: 25),

          _info(Icons.location_on, campaign.address),

          _info(Icons.groups, "${campaign.scalerCount} Scalers Needed"),

          _info(
            Icons.payments,
            "\$${campaign.basePay.toStringAsFixed(2)} Base Pay",
          ),

          _info(
            Icons.card_giftcard,
            "\$${campaign.bonus.toStringAsFixed(2)} Completion Bonus",
          ),

          const SizedBox(height: 25),

          const Text(
            "Verification Requirements",

            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 10),

          _check("Before Photo", campaign.beforePhotoRequired),

          _check("After Photo", campaign.afterPhotoRequired),

          _check("Business Approval", campaign.businessApprovalRequired),

          const SizedBox(height: 40),

          if (campaign.status == "completed")
            SizedBox(
              height: 55,

              child: ElevatedButton.icon(
                icon: const Icon(Icons.star_outline),

                label: const Text("Review Business"),

                onPressed: _openBusinessReview,
              ),
            )
          else
            SizedBox(
              height: 55,

              child: ElevatedButton(
                onPressed: _applying ? null : _applyForCampaign,

                child: _applying
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text("Apply For Campaign"),
              ),
            ),
        ],
      ),
    );
  }

  Widget _info(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),

      child: Row(
        children: [
          Icon(icon),

          const SizedBox(width: 12),

          Expanded(child: Text(text)),
        ],
      ),
    );
  }

  Widget _check(String label, bool enabled) {
    return Row(
      children: [
        Icon(enabled ? Icons.check_circle : Icons.cancel),

        const SizedBox(width: 10),

        Text(label),
      ],
    );
  }
}
