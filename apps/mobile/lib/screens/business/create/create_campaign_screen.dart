import 'package:flutter/material.dart';

import '../../../../models/campaign/campaign.dart';
import '../../../../navigation/app_routes.dart';
import '../../../../navigation/app_router.dart';

import 'campaigns/distribution/material_distribution_campaign_screen.dart';
import 'campaigns/cleanup/cleanup_campaign_screen.dart';
import 'campaigns/yard_sign/yard_sign_campaign_screen.dart';
import 'campaigns/dump_run/dump_run_campaign_screen.dart';
import 'campaigns/canvassing/canvassing_campaign_screen.dart';

class CreateCampaignScreen extends StatelessWidget {
  const CreateCampaignScreen({super.key, this.flyerDraftAndAreaFlowOverride});

  final Future<void> Function(BuildContext context)?
  flyerDraftAndAreaFlowOverride;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back to Business dashboard',
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            final navigator = Navigator.of(context);

            if (navigator.canPop()) {
              navigator.pop();
              return;
            }

            AppNavigation.replace(context, AppRoutes.businessDashboard);
          },
        ),
        title: const Text("Create Campaign"),
        centerTitle: true,
      ),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const Text(
            "Choose Campaign Type",
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 25),

          _section("Marketing Campaigns"),

          _campaignCard(
            context,
            Icons.mail_outline,
            "Flyer Distribution",
            "Distribute flyers with GPS verification and mapped zones.",
            MaterialDistributionCampaignScreen(
              campaignType: CampaignType.flyerDistribution,
              draftAndAreaFlowOverride: flyerDraftAndAreaFlowOverride,
            ),
          ),

          _campaignCard(
            context,
            Icons.location_on,
            "Neighborhood Canvassing",
            "Generate leads using GPS verified field outreach.",
            const CanvassingCampaignScreen(),
          ),

          _campaignCard(
            context,
            Icons.door_front_door,
            "Door Hanger Distribution",
            "Distribute door hangers throughout mapped neighborhoods.",
            const MaterialDistributionCampaignScreen(
              campaignType: CampaignType.doorHangerDistribution,
            ),
          ),

          const SizedBox(height: 30),

          _section("Field Service Campaigns"),

          _campaignCard(
            context,
            Icons.cleaning_services,
            "Yard Cleanup",
            "Before and after photos with completion verification.",
            const CleanupCampaignScreen(),
          ),

          _campaignCard(
            context,
            Icons.local_shipping,
            "Dump Run",
            "Pickup, hauling, disposal and proof of completion.",
            const DumpRunCampaignScreen(),
          ),

          _campaignCard(
            context,
            Icons.signpost,
            "Yard Sign Installation",
            "GPS verified placement with photo proof.",
            const YardSignCampaignScreen(),
          ),
        ],
      ),
    );
  }

  Widget _section(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),

      child: Text(
        title,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _campaignCard(
    BuildContext context,
    IconData icon,
    String title,
    String description,
    Widget screen,
  ) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),

      child: ListTile(
        contentPadding: const EdgeInsets.all(20),

        leading: Icon(icon, size: 40),

        title: Text(
          title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),

        subtitle: Text(description),

        trailing: const Icon(Icons.arrow_forward_ios),

        onTap: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
        },
      ),
    );
  }
}
