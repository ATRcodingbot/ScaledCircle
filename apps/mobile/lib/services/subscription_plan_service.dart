class SubscriptionPlanService {
  static const Map<String, Map<String, dynamic>> plans = {
    'starter': {
      'name': 'Starter',
      'price': 99.0,
      'maxActiveCampaigns': 2,
      'maxScalersPerCampaign': 3,
      'unlimitedCampaigns': false,
      'unlimitedScalers': false,
      'features': [
        'campaign_mapping',
        'gps_verification',
        'completion_verification',
        'scaler_marketplace',
        'payouts',
        'basic_analytics',
        'basic_ai_planning',
      ],
    },
    'growth': {
      'name': 'Growth',
      'price': 299.0,
      'maxActiveCampaigns': 10,
      'maxScalersPerCampaign': 15,
      'unlimitedCampaigns': false,
      'unlimitedScalers': false,
      'features': [
        'campaign_mapping',
        'gps_verification',
        'completion_verification',
        'scaler_marketplace',
        'payouts',
        'basic_analytics',
        'advanced_analytics',
        'advanced_ai_planning',
        'ai_content_creation',
        'lead_tracking',
        'qr_tracking',
        'call_tracking',
        'landing_pages',
        'exportable_reports',
      ],
    },
    'scale': {
      'name': 'Scale',
      'price': 499.0,
      'maxActiveCampaigns': null,
      'maxScalersPerCampaign': null,
      'unlimitedCampaigns': true,
      'unlimitedScalers': true,
      'features': [
        'campaign_mapping',
        'gps_verification',
        'completion_verification',
        'scaler_marketplace',
        'payouts',
        'basic_analytics',
        'advanced_analytics',
        'advanced_ai_planning',
        'ai_content_creation',
        'lead_tracking',
        'qr_tracking',
        'call_tracking',
        'landing_pages',
        'exportable_reports',
        'priority_scaler_matching',
        'api_integrations',
        'crm_integrations',
        'recurring_campaigns',
        'franchise_management',
        'priority_support',
      ],
    },
  };

  Map<String, dynamic> getPlan(String plan) {
    final data = plans[plan];

    if (data == null) {
      throw Exception('Unknown subscription plan.');
    }

    return data;
  }

  String getPlanName(String plan) {
    return getPlan(plan)['name']?.toString() ?? plan;
  }

  double getPlanPrice(String plan) {
    return (getPlan(plan)['price'] as num?)?.toDouble() ?? 0.0;
  }

  int? getMaxActiveCampaigns(String plan) {
    return (getPlan(plan)['maxActiveCampaigns'] as num?)?.toInt();
  }

  int? getMaxScalersPerCampaign(String plan) {
    return (getPlan(plan)['maxScalersPerCampaign'] as num?)?.toInt();
  }

  bool hasFeature({required String plan, required String feature}) {
    final features = (getPlan(plan)['features'] as List?)?.map(
      (item) => item.toString(),
    );

    return features?.contains(feature) ?? false;
  }

  bool canCreateCampaign({
    required String plan,
    required int currentActiveCampaigns,
  }) {
    final maxCampaigns = getMaxActiveCampaigns(plan);

    if (maxCampaigns == null) {
      return true;
    }

    return currentActiveCampaigns < maxCampaigns;
  }

  bool canRequestScalers({
    required String plan,
    required int requestedScalers,
  }) {
    final maxScalers = getMaxScalersPerCampaign(plan);

    if (maxScalers == null) {
      return true;
    }

    return requestedScalers <= maxScalers;
  }
}
