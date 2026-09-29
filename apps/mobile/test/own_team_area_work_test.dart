import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:flutter_app/widgets/own_team_area_work.dart';

Map<String, dynamic> fixture({bool completed = false}) => {
  'canComplete': true,
  'canAddPerson': true,
  'people': [
    {'id': 'crew:one', 'name': 'Alex'},
    {'id': 'crew:two', 'name': 'Sam'},
  ],
  'areas': [
    {
      'id': 'a',
      'name': 'Area 1',
      'geometryDigest': 'digest-a',
      'assignedPeople': [
        {'id': 'crew:one', 'name': 'Alex'},
      ],
    },
    {
      'id': 'b',
      'name': 'Area 2',
      'geometryDigest': 'digest-b',
      'assignedPeople': [],
    },
  ],
  'records': completed
      ? [
          {
            'id': 'history',
            'zoneIds': ['a'],
            'completedAtMs': DateTime(2026, 9, 20).millisecondsSinceEpoch,
            'recordedAtMs': DateTime(2026, 9, 21).millisecondsSinceEpoch,
            'attributionRevision': 0,
            'zoneWork': [
              {
                'zoneId': 'a',
                'people': [
                  {'id': 'crew:two', 'name': 'Sam'},
                ],
                'notes': 'Original note',
              },
            ],
            'amendments': [],
          },
        ]
      : [],
};
Future<void> press(WidgetTester t, String text) async {
  final f = find.text(text).first;
  await t.ensureVisible(f);
  await t.tap(f);
  await t.pumpAndSettle();
}

void main() {
  testWidgets(
    'assignment is separate, two marketers confirmed on only one area, exact geometry sent',
    (t) async {
      final writes = <(String, Map<String, dynamic>)>[];
      var done = false;
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: OwnTeamAreaWork(
                businessId: 'biz',
                campaignId: 'campaign',
                operation: (op, input) async {
                  if (op == 'ownTeamAreaWork') return fixture(completed: done);
                  writes.add((op, input));
                  done = true;
                  return {'recorded': true};
                },
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Assigned to: Alex'), findsOneWidget);
      expect(find.text('Worked by: Not recorded'), findsNWidgets(2));
      expect(writes, isEmpty);
      await press(t, 'Record who worked this area');
      await press(t, 'Alex');
      await press(t, 'Sam');
      expect(writes, isEmpty);
      await press(t, 'I confirm this entire saved area was worked.');
      await press(t, 'Record Completion');
      expect(writes.single.$1, 'markMarketingComplete');
      expect(writes.single.$2['zoneIds'], ['a']);
      expect(
        ((writes.single.$2['zoneWork'] as List).single as Map)['personIds'],
        ['crew:one', 'crew:two'],
      );
      expect(writes.single.$2['expectedAreaDigests'], {'a': 'digest-a'});
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'amendment uses existing history and revision, never completion; names filter stays area-specific',
    (t) async {
      final writes = <(String, Map<String, dynamic>)>[];
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: OwnTeamAreaWork(
                businessId: 'biz',
                campaignId: 'campaign',
                operation: (op, input) async {
                  if (op == 'ownTeamAreaWork') return fixture(completed: true);
                  writes.add((op, input));
                  return {'saved': true};
                },
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Worked by: Sam'), findsOneWidget);
      expect(find.text('Worked by: Not recorded'), findsOneWidget);
      await press(t, 'Add / correct worked-by record');
      await press(t, 'Alex');
      await press(t, 'I confirm this attribution correction.');
      await press(t, 'Save amendment');
      expect(writes.single.$1, 'amendOwnTeamAreaWork');
      expect(writes.single.$2['historyId'], 'history');
      expect(writes.single.$2['expectedRevision'], 0);
      await t.enterText(find.byType(TextField).first, 'Sam');
      await t.pumpAndSettle();
      expect(find.text('Area 1'), findsOneWidget);
      expect(find.text('Area 2'), findsNothing);
    },
  );
  testWidgets(
    'internal person uses existing resource operation and no completion/invitation',
    (t) async {
      final writes = <(String, Map<String, dynamic>)>[];
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: OwnTeamAreaWork(
                businessId: 'biz',
                campaignId: 'campaign',
                operation: (op, input) async {
                  if (op == 'ownTeamAreaWork') return fixture();
                  writes.add((op, input));
                  return {'saved': true};
                },
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      await press(t, 'Add internal marketer');
      expect(
        find.text(
          'People/Crew record only. No login, invitation, paid seat or payment.',
        ),
        findsOneWidget,
      );
      await t.enterText(find.widgetWithText(TextFormField, 'Name'), 'Taylor');
      await press(t, 'Add person');
      expect(writes.single.$1, 'saveResource');
      expect(writes.single.$2, {
        'name': 'Taylor',
        'status': 'active',
        'expectedVersion': 0,
      });
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'narrow 2x text and keyboard selection remain usable; cancel makes no write',
    (t) async {
      await t.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => t.binding.setSurfaceSize(null));
      var writes = 0;
      await t.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: OwnTeamAreaWork(
                  businessId: 'biz',
                  campaignId: 'campaign',
                  operation: (op, input) async {
                    if (op == 'ownTeamAreaWork') return fixture();
                    writes++;
                    return {};
                  },
                ),
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      await press(t, 'Record who worked this area');
      await t.sendKeyEvent(LogicalKeyboardKey.tab);
      await t.sendKeyEvent(LogicalKeyboardKey.space);
      await t.pumpAndSettle();
      await press(t, 'Cancel');
      expect(writes, 0);
      expect(t.takeException(), isNull);
    },
  );
}
