import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String source(String path) => File(path).readAsStringSync();

void main() {
  test('Business navigation separates campaigns, creation, and results', () {
    final dashboard = source('lib/screens/business/business_dashboard.dart');
    final campaigns = source(
      'lib/screens/business/business_campaigns_screen.dart',
    );

    expect(dashboard, contains("value == 'campaigns'"));
    expect(dashboard, contains('_openCampaigns(context, user.uid)'));
    expect(dashboard, contains("value == 'results'"));
    expect(dashboard, contains('BusinessCampaignView.results'));
    expect(
      dashboard,
      isNot(contains('AppRoutes.campaignDetail(campaigns.first.id)')),
    );
    expect(campaigns, contains("key: const Key('campaign-list-create')"));
    expect(campaigns, contains('No campaign results yet'));
    expect(campaigns, contains('No campaigns yet'));
  });

  test('uncertified response and payout capabilities are truthful', () {
    final subscription = source(
      'lib/screens/business/subscription_screen.dart',
    );
    final services = source('lib/models/scaled_circle_service_catalog.dart');
    final builder = source('lib/screens/business/create_campaign_screen.dart');
    final flyer = source(
      'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
    );
    final responseCard = source(
      'lib/widgets/response_tracking_feature_card.dart',
    );

    for (final capability in [
      'Lead tracking — Coming Soon',
      'Call tracking — Coming Soon',
      'Campaign landing pages — Coming Soon',
    ]) {
      expect(subscription, contains(capability));
    }
    expect(subscription, contains('cash-out coming soon'));
    expect(services, contains("name: 'Scaler Cash-out'"));
    expect(services, contains('comingSoon: true'));
    expect(builder, contains('ResponseTrackingFeatureCard'));
    expect(builder, contains('AppEnvironmentConfig.responseTrackingEnabled'));
    expect(flyer, contains('ResponseTrackingFeatureCard'));
    expect(flyer, contains('AppEnvironmentConfig.responseTrackingEnabled'));
    expect(responseCard, contains('Tracked link'));
    expect(responseCard, contains('QR code'));
    expect(responseCard, contains('Landing pages'));
    expect(responseCard, contains('Tracked calls'));
    expect(responseCard, contains('Lead capture/forms'));
  });

  test(
    'Business review and public marketing language describe real authority',
    () {
      final review = source('lib/screens/business/campaign_zones_screen.dart');
      final publicHome = source(
        'lib/screens/public/public_landing_screen.dart',
      );
      final dashboard = source('lib/screens/business/business_dashboard.dart');

      expect(review, contains("label: 'Base Earning'"));
      expect(review, contains('approve bonus eligibility'));
      expect(review, isNot(contains("label: 'Base Payment'")));
      expect(publicHome, contains('Plan digital marketing drafts'));
      expect(publicHome, isNot(contains('Publish digital marketing')));
      expect(dashboard, contains('View your company profile and reputation.'));
      expect(dashboard, contains("PopupMenuItem(value: 'support'"));
    },
  );
}
