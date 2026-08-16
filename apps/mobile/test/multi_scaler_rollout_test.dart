import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('production campaign forms fail closed to one Scaler', () {
    final paths = <String>[
      'lib/screens/business/create_campaign_screen.dart',
      'lib/screens/business/create/campaigns/distribution/material_distribution_campaign_screen.dart',
      'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
    ];

    for (final path in paths) {
      final source = File(path).readAsStringSync();
      if (path.contains('material_distribution_campaign_screen.dart')) {
        expect(source, contains('FlyerCampaignScreen('));
        continue;
      }
      expect(source, contains('enabled: AppEnvironmentConfig.isLocal'));
      expect(source, contains('? int.tryParse(scalerCountController.text.trim())'));
      expect(source, contains("'Multi-Scaler crews — Private Beta."));
      expect(source, contains("return 'Enter 12 or fewer for now';"));
    }
  });

  test('environment selection remains a compile-time constant', () {
    final source = File(
      'lib/config/app_environment.dart',
    ).readAsStringSync();

    expect(source, contains('static const bool isLocal'));
    expect(source, contains("_rawEnvironment == 'local'"));
    expect(source, contains('LocalFirebaseOptions.currentPlatform'));
  });
}
