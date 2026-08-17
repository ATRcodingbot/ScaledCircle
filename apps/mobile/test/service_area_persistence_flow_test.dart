import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/preferences/areas_preferences_screen.dart';

void main() {
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
