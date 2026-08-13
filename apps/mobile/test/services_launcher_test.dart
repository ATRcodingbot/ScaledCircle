import 'dart:io';

import 'package:flutter_app/models/scaled_circle_service_catalog.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'service catalog exposes every requested category without hiding locks',
    () {
      expect(
        ScaledCircleServiceCatalog.items.map((item) => item.category).toSet(),
        {'INTELLIGENCE', 'GROWTH', 'EXECUTION', 'ANALYTICS'},
      );
      expect(
        ScaledCircleServiceCatalog.items.map((item) => item.name),
        containsAll([
          'Property Intelligence',
          'Weather Intelligence',
          'AI Business Analysis',
          'Growth Plan',
          'Social Content',
          'Advertising',
          'SEO',
          'Email',
          'Postcards / Direct Mail',
          'Field Campaigns',
          'Campaign Operations / Job Room',
          'Growth Analytics',
          'Campaign Results',
        ]),
      );
    },
  );

  test(
    'entitlements inherit downward while locked services remain visible',
    () {
      final property = ScaledCircleServiceCatalog.items.firstWhere(
        (item) => item.name == 'Property Intelligence',
      );
      final growth = ScaledCircleServiceCatalog.items.firstWhere(
        (item) => item.name == 'Growth Plan',
      );
      expect(property.entitledFor('scale'), isTrue);
      expect(property.entitledFor('managed_growth'), isTrue);
      expect(growth.entitledFor('scale'), isFalse);
      expect(growth.entitledFor('managed_growth'), isTrue);
    },
  );

  test(
    'services UI labels disconnected and manual financial data honestly',
    () {
      final source = File(
        'lib/screens/business/scaled_circle_services_screen.dart',
      ).readAsStringSync();
      expect(source, contains('ScaledCircle Services'));
      expect(source, contains('Upgrade / Learn More'));
      expect(
        source,
        contains('Planned ad budget is not a stored-money balance'),
      );
      expect(source, contains('Actual spend: Not connected'));
      expect(source, contains('30 days • default'));
      expect(source, contains('sent/opened/clicked: Not connected'));
    },
  );

  test(
    'Property channel recommendation is advisory and preserves both handoffs',
    () {
      final source = File(
        'lib/screens/business/property_intelligence_center_screen.dart',
      ).readAsStringSync();
      expect(source, contains('RECOMMENDED PHYSICAL CHANNEL'));
      expect(source, contains('Create Postcard Campaign'));
      expect(source, contains('Choose Scaler Distribution Instead'));
      expect(source, contains('recommendation is advisory'));
      expect(source, contains('does not create a door-to-door outreach job'));
    },
  );
}
