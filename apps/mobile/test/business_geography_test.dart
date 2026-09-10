import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/auth/complete_business_profile_screen.dart';
import 'package:flutter_app/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart';
import 'package:flutter_app/services/address_search_service.dart';
import 'package:flutter_app/widgets/mapped_address_field.dart';

Map<String, dynamic> place(String id) => {
  'id': id,
  'canonicalId': 'canonical-$id',
  'selectionId': List.filled(
    64,
    id == 'base'
        ? 'a'
        : id == 'county'
        ? 'b'
        : 'c',
  ).join(),
  'fullAddress': '$id, Maryland, United States',
  'latitude': 39.0,
  'longitude': -77.0,
  'geographyType': id == 'base' ? 'address' : 'county',
  'geometry': [
    {'latitude': 39.0, 'longitude': -77.0},
    {'latitude': 39.1, 'longitude': -77.0},
    {'latitude': 39.1, 'longitude': -76.9},
  ],
};
Map<String, dynamic> profile() => {
  'email': 'owner@example.test',
  'legacyServiceAreas': ['Old county text'],
  'profile': {
    'businessName': 'Preserved Business',
    'contactName': 'Owner',
    'businessDescription': 'Repairs',
    'servicesOffered': ['Repair'],
    'serviceAreas': ['Old county text'],
    'businessAddress': 'Preserved private legacy address',
  },
};
Future<void> show(WidgetTester t, Finder target) async {
  await t.scrollUntilVisible(
    target,
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await t.ensureVisible(target);
  await t.pumpAndSettle();
}

Future<void> choose(WidgetTester t, String field, String value) async {
  final finder = find.byKey(Key(field));
  await show(t, finder);
  final input = find.descendant(
    of: finder,
    matching: find.byType(TextFormField),
  );
  await t.enterText(input, value);
  final button = find.descendant(
    of: finder,
    matching: find.byTooltip('Search map'),
  );
  await t.ensureVisible(button);
  await t.tap(button);
  await t.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setupFirebaseCoreMocks();
  setUpAll(() async => Firebase.initializeApp());
  for (final width in [390.0, 1100.0]) {
    testWidgets(
      'canonical base/multiple areas, duplicate/removal and parent save at $width',
      (t) async {
        await t.binding.setSurfaceSize(Size(width, 900));
        addTearDown(() => t.binding.setSurfaceSize(null));
        Map<String, dynamic>? saved;
        var done = false;
        await t.pumpWidget(
          MaterialApp(
            home: CompleteBusinessProfileScreen(
              load: () async => profile(),
              searchPlaces: (q, _) async => [
                AddressSearchService.parseSuggestion(place(q))!,
              ],
              save: (p) async {
                saved = p;
                return {'profileComplete': true};
              },
              onCompleted: () => done = true,
            ),
          ),
        );
        await t.pumpAndSettle();
        await choose(t, 'business-base-search', 'base');
        await choose(t, 'business-area-search', 'county');
        await choose(t, 'business-area-search', 'county');
        expect(
          find.text('That service area is already selected.'),
          findsOneWidget,
        );
        await choose(t, 'business-area-search', 'city');
        final chips = find.byType(InputChip);
        expect(chips, findsNWidgets(2));
        t
            .widget<InputChip>(
              find.byKey(const ValueKey('service-area-canonical-city')),
            )
            .onDeleted!();
        await t.pumpAndSettle();
        await show(t, find.text('Save and continue'));
        await t.tap(find.text('Save and continue'));
        await t.pumpAndSettle();
        expect(done, true);
        expect(saved!['businessName'], 'Preserved Business');
        expect(saved!['businessAddress'], 'Preserved private legacy address');
        expect(saved!['geography'], {
          'baseSelectionId': place('base')['selectionId'],
          'serviceAreaSelectionIds': [place('county')['selectionId']],
        });
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'legacy text is not confirmation; free text cannot save; resolver error offers Retry',
    (t) async {
      var calls = 0, fail = true;
      await t.pumpWidget(
        MaterialApp(
          home: CompleteBusinessProfileScreen(
            load: () async => profile(),
            searchPlaces: (q, _) async {
              if (fail) throw Exception();
              return [AddressSearchService.parseSuggestion(place(q))!];
            },
            save: (p) async {
              calls++;
              return {'profileComplete': true};
            },
          ),
        ),
      );
      await t.pumpAndSettle();
      await show(t, find.text('Save and continue'));
      await t.tap(find.text('Save and continue'));
      await t.pumpAndSettle();
      expect(calls, 0);
      // Return to the base search without replacing the preserved form state.
      await t.scrollUntilVisible(
        find.byKey(const Key('business-base-search')),
        -300,
        scrollable: find.byType(Scrollable).first,
      );
      await choose(t, 'business-base-search', 'base');
      expect(find.text('Try Again'), findsOneWidget);
      fail = false;
      await t.tap(find.text('Try Again'));
      await t.pumpAndSettle();
      final base = t.widget<MappedAddressField>(
        find.byKey(const Key('business-base-search')),
      );
      expect(base.controller.text, place('base')['fullAddress']);
      expect(calls, 0);
    },
  );
  testWidgets(
    'saved canonical selections survive reload without geocoding again',
    (t) async {
      var searches = 0;
      final data = profile()
        ..['geography'] = {
          'base': place('base'),
          'serviceAreas': [place('county'), place('city')],
        };
      await t.pumpWidget(
        MaterialApp(
          home: CompleteBusinessProfileScreen(
            load: () async => data,
            searchPlaces: (q, _) async {
              searches++;
              return [];
            },
          ),
        ),
      );
      await t.pumpAndSettle();
      await show(t, find.byKey(const Key('business-area-search')));
      expect(find.byType(InputChip), findsNWidgets(2));
      expect(searches, 0);
    },
  );
  testWidgets(
    'campaign suggestions do not choose a territory; explicit choice can be cleared',
    (t) async {
      await t.pumpWidget(
        MaterialApp(
          home: FlyerCampaignScreen(
            loadPreferences: () async => {'areas': []},
            loadProfileAreas: () async => [
              {
                'id': 'county',
                'name': 'Saved County',
                'type': 'place',
                'geometry': place('county')['geometry'],
              },
            ],
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Starting with: Saved County'), findsNothing);
      await t.ensureVisible(find.text('Saved County'));
      await t.tap(find.text('Saved County'));
      await t.pumpAndSettle();
      expect(find.text('Starting with: Saved County'), findsOneWidget);
      await t.ensureVisible(find.text('Choose Another Area'));
      await t.tap(find.text('Choose Another Area'));
      await t.pumpAndSettle();
      expect(find.text('Starting with: Saved County'), findsNothing);
      expect(find.text('Saved County'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  test(
    'pending Return uses authenticated resolver; Sign Out remains separate',
    () {
      final s = File(
        'lib/screens/public/early_access_pending_screen.dart',
      ).readAsStringSync();
      final action = s.substring(
        s.indexOf('Future<void> _returnToSite'),
        s.indexOf('@override\n  Widget build'),
      );
      expect(action, contains("AppNavigation.replace(context, '/')"));
      expect(action, isNot(contains('signOut')));
      expect(s, contains('AuthenticatedSignOutButton'));
      expect(s, isNot(contains('PublicLandingScreen')));
    },
  );
}
