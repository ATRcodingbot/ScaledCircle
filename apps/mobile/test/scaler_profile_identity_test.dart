import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/scaler/profile/scaler_profile_screen.dart';
import 'package:flutter_app/services/discovery_preferences_service.dart';

const _types = [
  MarketplaceWorkType(
    id: 'dump_run',
    customerLabel: 'Dump Runs',
    description: 'Local dump runs.',
    scalerSelectable: true,
    requiresVehicle: true,
    requiresOutreachConsent: false,
  ),
];

const _preferences = <String, dynamic>{
  'areas': [
    {'displayName': 'Baltimore County, Maryland', 'enabled': true},
  ],
  'maxTravelMiles': 40,
  'jobTypes': ['dump_run', 'door_to_door'],
  'vehicleType': 'pickup_truck',
  'outreachOptIn': true,
  'alertDelivery': {'email': true},
};

Widget _screen({
  required Stream<Map<String, dynamic>?> profile,
  ScalerProfileUpdater? update,
  String? scalerId,
  String? authDisplayName,
}) => MaterialApp(
  home: ScalerProfileScreen(
    scalerId: scalerId,
    currentUserId: scalerId == null ? 'scaler-qa' : null,
    authDisplayName: authDisplayName,
    profileStream: (_) => profile,
    preferencesStream: (_) => Stream.value(_preferences),
    updatePresentationProfile:
        update ??
        ({required displayName, required bio}) async => {
          'displayName': displayName,
          'bio': bio,
        },
    loadWorkTypes: () async => _types,
    reputationBuilder: (_) => const Text('Reputation summary'),
  ),
);

void main() {
  testWidgets('signup displayName is distinct from role and modern subtitle', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(
        profile: Stream.value({
          'displayName': 'Gregory Harkins',
          'role': 'scaler',
          'active': true,
          'betaAccess': 'approved',
        }),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Gregory Harkins'), findsOneWidget);
    expect(find.byKey(const ValueKey('scaler-role-label')), findsOneWidget);
    expect(find.text('Local Gig Worker'), findsOneWidget);
    expect(find.text('Independent Marketing Professional'), findsNothing);
    expect(find.text('EDIT PROFILE'), findsOneWidget);
    expect(find.text('EDIT WORK PREFERENCES'), findsOneWidget);
    expect(find.text('Dump Runs'), findsOneWidget);
    expect(find.textContaining('door_to_door'), findsNothing);
    expect(find.text('Door-to-Door Outreach'), findsOneWidget);
  });

  testWidgets(
    'Display Name edit persists as inert text without changing role',
    (tester) async {
      final profiles = StreamController<Map<String, dynamic>?>.broadcast();
      addTearDown(profiles.close);
      Map<String, dynamic>? submitted;
      await tester.pumpWidget(
        _screen(
          profile: profiles.stream,
          update: ({required displayName, required bio}) async {
            submitted = {'displayName': displayName, 'bio': bio};
            profiles.add({
              'displayName': displayName,
              'bio': bio,
              'role': 'scaler',
              'active': true,
              'betaAccess': 'approved',
            });
            return submitted!;
          },
        ),
      );
      profiles.add({
        'displayName': 'Gregory Harkins',
        'role': 'scaler',
        'active': true,
        'betaAccess': 'approved',
      });
      await tester.pumpAndSettle();
      await tester.tap(find.text('EDIT PROFILE'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('display-name-field')),
        '<script>Greg</script>',
      );
      await tester.enterText(
        find.byKey(const ValueKey('profile-bio-field')),
        '<b>Available locally</b>',
      );
      await tester.tap(find.text('Save Profile'));
      await tester.pumpAndSettle();

      expect(submitted?['displayName'], '<script>Greg</script>');
      expect(find.text('<script>Greg</script>'), findsOneWidget);
      expect(find.text('<b>Available locally</b>'), findsOneWidget);
      expect(find.text('Scaler'), findsOneWidget);
      expect(find.text('Local Gig Worker'), findsOneWidget);
    },
  );

  testWidgets('blank and whitespace-only Display Names are rejected', (
    tester,
  ) async {
    var calls = 0;
    await tester.pumpWidget(
      _screen(
        profile: Stream.value({'displayName': 'Gregory Harkins'}),
        update: ({required displayName, required bio}) async {
          calls += 1;
          return {};
        },
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('EDIT PROFILE'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('display-name-field')),
      '   ',
    );
    await tester.tap(find.text('Save Profile'));
    await tester.pump();

    expect(find.text('Enter your display name.'), findsOneWidget);
    expect(calls, 0);
  });

  testWidgets('Auth name and neutral name are safe profile fallbacks', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(profile: Stream.value({}), authDisplayName: 'Auth Name'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Auth Name'), findsOneWidget);

    await tester.pumpWidget(_screen(profile: Stream.value({})));
    await tester.pumpAndSettle();
    expect(find.text('Your Profile'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('scaler-display-name')),
        matching: find.text('Scaler'),
      ),
      findsNothing,
    );
  });

  testWidgets(
    'public reputation profile exposes display name but not private data',
    (tester) async {
      await tester.pumpWidget(
        _screen(
          scalerId: 'public-scaler-id',
          profile: Stream.value({
            'displayName': 'Public Scaler',
            'email': 'private@example.test',
            'firebaseUid': 'private-uid',
            'bio': 'Available for local work.',
          }),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Public Scaler'), findsOneWidget);
      expect(find.text('Available for local work.'), findsOneWidget);
      expect(find.text('private@example.test'), findsNothing);
      expect(find.text('private-uid'), findsNothing);
      expect(find.text('WORK PREFERENCES'), findsNothing);
      expect(find.text('EDIT PROFILE'), findsNothing);
    },
  );
}
