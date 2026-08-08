import 'package:flutter/material.dart';

import '../../../models/campaign_model.dart';
import '../../../services/campaign_service.dart';
import 'scaler_campaign_details_screen.dart';

class ScalerCampaignMarketplaceScreen extends StatelessWidget {
  ScalerCampaignMarketplaceScreen({super.key});

  final CampaignService _campaignService = CampaignService();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Available Campaigns")),

      body: StreamBuilder<List<CampaignModel>>(
        stream: _campaignService.getOpenCampaigns(),

        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(child: Text("No campaigns available."));
          }

          final campaigns = snapshot.data!;

          return ListView.builder(
            padding: const EdgeInsets.all(16),

            itemCount: campaigns.length,

            itemBuilder: (context, index) {
              final campaign = campaigns[index];

              return Card(
                margin: const EdgeInsets.only(bottom: 16),

                elevation: 4,

                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),

                child: Padding(
                  padding: const EdgeInsets.all(18),

                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [
                      Text(
                        campaign.campaignName,

                        style: const TextStyle(
                          fontSize: 20,

                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 8),

                      Text(campaign.description),

                      const SizedBox(height: 16),

                      _info(Icons.location_on, campaign.address),

                      _info(
                        Icons.groups,

                        "${campaign.scalerCount} Scalers Needed",
                      ),

                      _info(
                        Icons.payments,

                        "\$${campaign.basePay.toStringAsFixed(2)} + \$${campaign.bonus.toStringAsFixed(2)} Bonus",
                      ),

                      const SizedBox(height: 12),

                      ElevatedButton(
  onPressed: () {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ScalerCampaignDetailsScreen(
          campaign: campaign,
        ),
      ),
    );
  },
  child: const Text("View Job"),
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

  Widget _info(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),

      child: Row(
        children: [
          Icon(icon, size: 18),

          const SizedBox(width: 8),

          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
