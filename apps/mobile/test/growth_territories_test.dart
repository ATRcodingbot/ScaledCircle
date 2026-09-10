import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/growth_territories_dialog.dart';

void main() {
  testWidgets(
    'territory priority order and optimistic revision submitted explicitly',
    (t) async {
      Map<String, dynamic>? saved;
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GrowthTerritoriesDialog(
              scope: {
                'preferenceVersion': 3,
                'areas': [
                  {'id': 'city', 'label': 'Baltimore City'},
                  {'id': 'county', 'label': 'Baltimore County'},
                ],
              },
              call: (v) async {
                saved = v;
                return {'saved': true};
              },
            ),
          ),
        ),
      );
      await t.tap(find.byTooltip('Move up').last);
      await t.pump();
      await t.tap(find.text('Save priorities'));
      await t.pumpAndSettle();
      expect(saved!['input']['selectionIds'], ['county', 'city']);
      expect(saved!['input']['expectedRevision'], 3);
    },
  );
  testWidgets(
    'resolver failure remains visible and does not fabricate an area',
    (t) async {
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GrowthTerritoriesDialog(
              scope: {'preferenceVersion': 0, 'areas': []},
              call: (_) async => throw Exception('offline'),
            ),
          ),
        ),
      );
      await t.enterText(find.byType(TextField), 'Baltimore City');
      await t.tap(find.text('Search areas'));
      await t.pumpAndSettle();
      expect(find.textContaining('Could not confirm'), findsOneWidget);
      expect(
        t
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save priorities'),
            )
            .onPressed,
        isNull,
      );
    },
  );
}
