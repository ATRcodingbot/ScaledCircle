import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/preferences/areas_preferences_screen.dart';
import 'package:flutter_app/services/discovery_preferences_service.dart';

const _workTypes = [
  MarketplaceWorkType(
    id: 'flyer_distribution',
    customerLabel: 'Flyer Distribution',
    description: 'Distribute flyers locally.',
    scalerSelectable: true,
    requiresVehicle: false,
    requiresOutreachConsent: false,
  ),
];

Map<String, dynamic> _preferences({
  required List<String> jobTypes,
  bool outreachOptIn = false,
}) => {
  'areas': [
    {
      'id': 'baltimore-county',
      'name': 'Baltimore County',
      'displayName': 'Baltimore County, Maryland',
      'enabled': true,
      'primary': true,
    },
  ],
  'jobTypes': jobTypes,
  'outreachOptIn': outreachOptIn,
  'crewOptIn': false,
  'notifications': <String, bool>{},
  'alertDelivery': <String, bool>{'inApp': true, 'email': false},
};

Future<void> _pumpPreferences(
  WidgetTester tester, {
  required Map<String, dynamic> preferences,
  Future<Map<String, dynamic>> Function(Map<String, dynamic>)?
  completePreferences,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: AreasPreferencesScreen(
        role: 'scaler',
        onboarding: true,
        loadPreferences: () async => preferences,
        loadWorkTypes: () async => _workTypes,
        completePreferences: completePreferences ?? (payload) async => payload,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _showSummary(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.text("YOU'RE INTERESTED IN"),
    500,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'legacy door_to_door is normalized into separate outreach consent',
    (tester) async {
      await _pumpPreferences(
        tester,
        preferences: _preferences(
          jobTypes: ['flyer_distribution', 'door_to_door'],
        ),
      );
      await _showSummary(tester);

      expect(find.text('Flyer Distribution'), findsWidgets);
      expect(find.textContaining('door_to_door'), findsNothing);
      expect(find.text('Door-to-Door Outreach: Yes'), findsOneWidget);
    },
  );

  testWidgets('Flyer Distribution does not imply outreach consent', (
    tester,
  ) async {
    await _pumpPreferences(
      tester,
      preferences: _preferences(jobTypes: ['flyer_distribution']),
    );
    await _showSummary(tester);

    expect(find.text('Door-to-Door Outreach: No'), findsOneWidget);
  });

  testWidgets(
    'outreach consent persists separately from canonical work types',
    (tester) async {
      Map<String, dynamic>? saved;
      await _pumpPreferences(
        tester,
        preferences: _preferences(jobTypes: ['flyer_distribution']),
        completePreferences: (payload) async {
          saved = Map<String, dynamic>.from(payload);
          return payload;
        },
      );

      await tester.scrollUntilVisible(
        find.text('I am willing to do door-to-door outreach'),
        400,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(
        find.widgetWithText(
          SwitchListTile,
          'I am willing to do door-to-door outreach',
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Save & Continue'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Save & Continue'));
      await tester.pumpAndSettle();

      expect(saved?['outreachOptIn'], isTrue);
      expect(saved?['jobTypes'], ['flyer_distribution']);
    },
  );
}
