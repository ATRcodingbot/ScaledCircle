import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/preferences/areas_preferences_screen.dart';
import 'package:flutter_app/services/address_search_service.dart';

void main() {
  testWidgets(
    'explicit county search auto-selects one boundary and saves without drawing',
    (tester) async {
      Map<String, dynamic>? persisted;
      const boundary = [
        {'latitude': 38.7, 'longitude': -76.9},
        {'latitude': 39.3, 'longitude': -76.9},
        {'latitude': 39.3, 'longitude': -76.3},
      ];
      await tester.pumpWidget(
        MaterialApp(
          home: AreasPreferencesScreen(
            role: 'business',
            loadPreferences: () async => null,
            searchAddresses: (query) async => const [
              AddressSuggestion(
                id: 'county-24003',
                primaryText: 'Anne Arundel County',
                secondaryText: 'Maryland, United States',
                fullAddress: 'Anne Arundel County, Maryland',
                latitude: 39,
                longitude: -76.6,
                geometry: boundary,
                geometryParts: [boundary],
                geometryType: 'Polygon',
                geographyType: 'county',
                geographicId: '24003',
                sourceVintage: 'January 1, 2025',
              ),
            ],
            savePreferences: (payload) async {
              persisted = payload;
              return {...payload, 'preferenceVersion': 1};
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add Another Service Area'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save Area'),
            )
            .onPressed,
        isNull,
      );
      await tester.enterText(
        find.byType(TextFormField).first,
        'anne arundel county maryland',
      );
      await tester.tap(find.byTooltip('Search map'));
      await tester.pumpAndSettle();
      expect(find.text('We found your area'), findsOneWidget);
      expect(find.text('Anne Arundel County, Maryland'), findsWidgets);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save Area'),
            )
            .onPressed,
        isNotNull,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Save Area'));
      await tester.pumpAndSettle();
      expect((persisted?['areas'] as List).single['geometry'], hasLength(3));
      expect((persisted?['areas'] as List).single['geographicId'], '24003');
      expect(find.text('Main Service Area'), findsOneWidget);
      expect(find.textContaining('saved'), findsOneWidget);
    },
  );

  testWidgets(
    'Save Area waits for authoritative preferences and refreshes the card',
    (tester) async {
      final initial = <String, dynamic>{
        'areas': [
          {
            'id': 'anne-arundel',
            'name': 'Main Service Area',
            'type': 'place',
            'primary': true,
            'enabled': true,
            'places': ['Anne Arundel County, Maryland'],
            'geometry': [
              {'latitude': 38.8, 'longitude': -76.8},
              {'latitude': 39.2, 'longitude': -76.8},
              {'latitude': 39.2, 'longitude': -76.4},
            ],
            'displayName': 'Anne Arundel County, Maryland',
          },
        ],
        'priorityServices': ['Decks'],
        'notifications': <String, bool>{},
      };
      var saveCalls = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: AreasPreferencesScreen(
            role: 'business',
            loadPreferences: () async => initial,
            savePreferences: (payload) async {
              saveCalls += 1;
              return {...payload, 'preferenceVersion': saveCalls};
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Main Service Area'), findsOneWidget);

      await tester.tap(find.byType(PopupMenuButton<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save Area'));
      await tester.pumpAndSettle();

      expect(saveCalls, 1);
      expect(find.text('Main Service Area'), findsOneWidget);
      expect(find.textContaining('Anne Arundel County'), findsWidgets);
      expect(find.textContaining('saved'), findsOneWidget);
    },
  );

  testWidgets('Scaler screen exposes multi-area and truthful alert controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: AreasPreferencesScreen(
          role: 'scaler',
          loadPreferences: () async => null,
          savePreferences: (payload) async => payload,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Add Another Work Area'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('In ScaledCircle'), 400);
    expect(find.text('In ScaledCircle'), findsOneWidget);
    expect(find.text('Email me about matching jobs'), findsOneWidget);
    expect(find.text('Push notifications — Coming Soon'), findsOneWidget);
  });
}
