import 'package:flutter/material.dart';

import '../../../../../models/campaign/campaign.dart';
import '../flyer/flyer_campaign_screen.dart';

/// Keeps the campaign catalog API while routing every distribution campaign
/// through one maintained, tested wizard implementation.
class MaterialDistributionCampaignScreen extends StatelessWidget {
  const MaterialDistributionCampaignScreen({
    super.key,
    required this.campaignType,
    this.initialServiceArea = const [],
    this.initialServiceAreaName,
    this.initialGoal,
    this.initialService,
    this.propertyIntelligenceAnalysisId,
  });

  final CampaignType campaignType;
  final List<Map<String, double>> initialServiceArea;
  final String? initialServiceAreaName;
  final String? initialGoal;
  final String? initialService;
  final String? propertyIntelligenceAnalysisId;

  String get _legacyType => switch (campaignType) {
    CampaignType.flyerDistribution => 'flyer_distribution',
    CampaignType.doorHangerDistribution => 'door_hanger_distribution',
    CampaignType.businessCardDistribution => 'business_card_distribution',
    _ => campaignType.name,
  };

  @override
  Widget build(BuildContext context) => FlyerCampaignScreen(
    campaignType: _legacyType,
    initialServiceArea: initialServiceArea,
    initialServiceAreaName: initialServiceAreaName,
    initialGoal: initialGoal,
    initialService: initialService,
    propertyIntelligenceAnalysisId: propertyIntelligenceAnalysisId,
  );
}
