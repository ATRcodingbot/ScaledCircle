import 'package:flutter/material.dart';
import '../flyer/flyer_campaign_screen.dart';

class CanvassingCampaignScreen extends StatelessWidget {
  const CanvassingCampaignScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const FlyerCampaignScreen(campaignType: 'neighborhoodCanvassing');
  }
}
