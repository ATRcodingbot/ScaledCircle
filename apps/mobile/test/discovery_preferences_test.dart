import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final screen = File(
    'lib/screens/preferences/areas_preferences_screen.dart',
  ).readAsStringSync();
  final map = File(
    'lib/screens/preferences/service_area_map_picker.dart',
  ).readAsStringSync();
  final service = File(
    'lib/services/discovery_preferences_service.dart',
  ).readAsStringSync();

  test('Business and Scaler setup use plain language', () {
    expect(screen, contains('Where do you work?'));
    expect(screen, contains('Where do you usually want to work?'));
    expect(screen, contains('What kind of work do you want more of?'));
    expect(screen, contains('What kind of jobs are you interested in?'));
    for (final jargon in [
      'geofence',
      'geospatial radius',
      'notification targeting',
      'market territory polygon',
      'taxonomy',
      'discovery filters',
    ]) {
      expect(screen.toLowerCase(), isNot(contains(jargon)));
    }
  });

  test('multiple named areas can be edited, disabled, and deleted', () {
    expect(screen, contains('Add Another Service Area'));
    expect(screen, contains('Make Primary'));
    expect(screen, contains('Enable / Disable'));
    expect(screen, contains("value: 'delete'"));
    expect(screen, contains('Draw an area'));
    expect(map, contains('This does not turn on GPS'));
  });

  test('manual search stays open and Scaler outreach is explicit opt-in', () {
    expect(screen, contains('Manual search stays open'));
    expect(screen, contains('SEARCH ALL JOBS'));
    expect(screen, contains('EXPLORE ANYWHERE'));
    expect(screen, contains('Off by default'));
    expect(screen, contains('door-to-door outreach'));
  });

  test('only callable paths save preferences and derive reasons', () {
    expect(service, contains('saveDiscoveryPreferences'));
    expect(service, contains('evaluateOpportunityMatch'));
    expect(service, isNot(contains('collection(\'users\').doc(_uid).update')));
  });

  test('Growth Profile integrates the shared areas experience', () {
    final wizard = File(
      'lib/screens/business/business_growth_profile_wizard.dart',
    ).readAsStringSync();
    expect(wizard, contains('AreasPreferencesScreen'));
    expect(wizard, contains('Choose Areas on a Map or Add More'));
  });

  test('Scaler discovery separates personalized and unrestricted modes', () {
    final jobs = File(
      'lib/screens/jobs/jobs_marketplace_screen.dart',
    ).readAsStringSync();
    expect(jobs, contains("Text('For You')"));
    expect(jobs, contains("Text('Search All Jobs')"));
    expect(
      jobs,
      contains('Manual search is not limited by your saved preferences.'),
    );
    expect(jobs, contains('Personalize the jobs you see'));
    expect(jobs, contains("jobType == 'door_to_door'"));
  });

  test(
    'Property discovery exposes saved areas and unrestricted exploration',
    () {
      final property = File(
        'lib/screens/business/property_intelligence_center_screen.dart',
      ).readAsStringSync();
      expect(property, contains("Text('My Service Areas')"));
      expect(property, contains("Text('Explore Anywhere')"));
      expect(property, contains('Inside your service area'));
      expect(property, contains('manual exploration is always available'));
      expect(property, contains("Text('Add to Service Areas')"));
      expect(property, contains('Analysis does not create a campaign'));
    },
  );

  test('notification settings do not advertise missing producers', () {
    expect(
      screen,
      isNot(contains("'propertyOpportunities': 'Property opportunities'")),
    );
    expect(
      screen,
      isNot(contains("'managedGrowthReminders': 'Managed Growth reminders'")),
    );
    expect(screen, contains('Weather opportunities in my areas'));
    expect(screen, contains('New jobs in my areas'));
  });
}
