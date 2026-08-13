import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/property_intelligence_service.dart';

void main() {
  const geometry = <Map<String, double>>[
    {'latitude': 38.97, 'longitude': -76.50},
    {'latitude': 38.98, 'longitude': -76.48},
    {'latitude': 38.96, 'longitude': -76.47},
  ];

  test(
    'standalone analysis request contains geometry but no campaign state',
    () {
      final request = PropertyIntelligenceService.buildExploratoryRequest(
        geometry,
      );

      expect(request['geometry'], geometry);
      for (final forbidden in [
        'campaignId',
        'zoneId',
        'status',
        'fundingStatus',
        'assignmentId',
        'workerPoolCents',
      ]) {
        expect(request, isNot(contains(forbidden)));
      }
    },
  );

  test(
    'standalone center is available without creating campaign documents',
    () {
      final source = File(
        'lib/screens/business/property_intelligence_center_screen.dart',
      ).readAsStringSync();

      expect(source, contains('PropertyIntelligenceCenterScreen'));
      expect(source, contains("'Analyze Area'"));
      expect(source, contains('analyzeArea(_geometry)'));
      expect(source, isNot(contains("collection('campaigns')")));
      expect(source, isNot(contains("collection('campaignZones')")));
      expect(source, isNot(contains('fundCampaign')));
      expect(source, isNot(contains('assignScaler')));
    },
  );

  test(
    'direct route renders an entitlement gate before the operational map',
    () {
      final source = File(
        'lib/screens/business/property_intelligence_center_screen.dart',
      ).readAsStringSync();
      expect(source, contains('hasActiveScalePropertyIntelligence'));
      expect(source, contains('_buildPremiumGate'));
      expect(source, contains("'Upgrade to Scale'"));
      expect(
        source,
        contains('entitled ? _buildOperationalCenter() : _buildPremiumGate()'),
      );
    },
  );

  test('dashboard exposes open and locked Scale upgrade states', () {
    final source = File(
      'lib/screens/business/business_dashboard.dart',
    ).readAsStringSync();
    expect(source, contains('_buildPropertyIntelligenceCard(user.uid)'));
    expect(source, contains("'AI intelligence included with Scale.'"));
    expect(source, contains("'Upgrade to Scale'"));
    expect(source, contains('PropertyIntelligenceCenterScreen'));
  });

  test(
    'public site markets Property Intelligence without a live analysis call',
    () {
      final source = File(
        'lib/screens/public/public_landing_screen.dart',
      ).readAsStringSync();
      expect(source, contains("'AI PROPERTY INTELLIGENCE'"));
      expect(source, contains(r'Included with Scale — \$499/month'));
      expect(source, contains(r"'Unlock with Scale — \$499/month'"));
      expect(source, isNot(contains('analyzePropertyIntelligence')));
      expect(source, contains('DATA-INFORMED LOCAL CAMPAIGNS'));
      expect(source, contains('qualified AI analysis'));
    },
  );

  test('AI controls use the shared callable and keep facts separate', () {
    final center = File(
      'lib/screens/business/property_intelligence_center_screen.dart',
    ).readAsStringSync();
    final panel = File(
      'lib/widgets/property_intelligence_panel.dart',
    ).readAsStringSync();
    expect(center, contains('ScaledCircleIntelligenceService'));
    expect(center, contains('AI OPPORTUNITY ANALYSIS'));
    expect(
      center,
      contains('Known property and weather facts remain authoritative'),
    );
    expect(center, contains('Combine With Weather'));
    expect(panel, contains('Ask AI About This Area'));
  });

  test('standalone analyses do not become My Campaigns entries', () {
    final center = File(
      'lib/screens/business/property_intelligence_center_screen.dart',
    ).readAsStringSync();
    final dashboard = File(
      'lib/screens/business/business_dashboard.dart',
    ).readAsStringSync();

    expect(center, isNot(contains("collection('campaigns')")));
    expect(center, isNot(contains("collection('campaignZones')")));
    expect(dashboard, contains("collection('campaigns')"));
    expect(dashboard, isNot(contains('stagingFixture')));
    expect(dashboard, isNot(contains('Staging Property Intelligence')));
  });

  test('comparison works from in-memory exploratory analyses', () {
    final source = File(
      'lib/screens/business/property_intelligence_center_screen.dart',
    ).readAsStringSync();

    expect(source, contains('final List<_ExploratoryAnalysis> _analyses'));
    expect(source, contains("'Compare Property Intelligence'"));
    expect(source, contains('Analyze at least two areas'));
  });

  test('campaign handoff is explicit and transfers selected geometry', () {
    final center = File(
      'lib/screens/business/property_intelligence_center_screen.dart',
    ).readAsStringSync();
    final creator = File(
      'lib/screens/business/create_campaign_screen.dart',
    ).readAsStringSync();
    final zones = File(
      'lib/screens/business/campaign_zones_screen.dart',
    ).readAsStringSync();

    expect(center, contains('CreateCampaignScreen('));
    expect(center, contains('initialServiceArea:'));
    expect(center, contains('initialServiceAreaType:'));
    expect(center, contains('propertyIntelligenceAnalysisId:'));
    expect(creator, contains('widget.initialServiceArea'));
    expect(creator, contains("'serviceAreaPointCount'"));
    expect(zones, contains("'Use Analyzed Area'"));
    expect(zones, contains("'Property Intelligence Area'"));
  });

  test('standalone center reuses campaign shapes and supports redraw', () {
    final source = File(
      'lib/screens/business/property_intelligence_center_screen.dart',
    ).readAsStringSync();
    expect(source, contains('CampaignAreaShape.values'));
    expect(source, contains('CampaignAreaGeometry.fromInput'));
    expect(source, contains("label: const Text('Clear / Change Area')"));
  });

  test('campaign map retains Property Intelligence toggle', () {
    final source = File(
      'lib/screens/business/campaign_area_screen.dart',
    ).readAsStringSync();

    expect(source, contains("title: const Text('Property Intelligence')"));
    expect(source, contains('_loadPropertyIntelligence()'));
  });

  test('group pay remains optional with one Scaler by default', () {
    final source = File(
      'lib/screens/business/create_campaign_screen.dart',
    ).readAsStringSync();

    expect(
      source,
      contains("scalerCountController = TextEditingController(text: '1')"),
    );
    expect(source, contains("'recommendedScalerCount': 1"));
    expect(source, contains("'Scalers for this area'"));
    expect(source, contains('divides the worker pool among the group'));
  });
}
