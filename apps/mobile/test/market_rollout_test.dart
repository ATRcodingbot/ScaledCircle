import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/preferences/market_state_screen.dart';
import 'package:flutter_app/navigation/startup_session_gate.dart';
import 'package:flutter_app/screens/admin/admin_market_rollout_screen.dart';

void main() {
  final states = [
    {
      'id': 'us_census_tigerweb:state:24',
      'name': 'Maryland',
      'status': 'ACTIVE',
    },
    {
      'id': 'us_census_tigerweb:state:42',
      'name': 'Pennsylvania',
      'status': 'PRELAUNCH',
    },
  ];
  Map<String, dynamic> value({bool confirmed = false}) => {
    'stateConfirmed': confirmed,
    'state': confirmed ? states[1] : null,
    'status': confirmed ? 'PRELAUNCH' : 'UNKNOWN',
    'states': states,
    'launchNotifications': false,
  };
  test(
    'state gate is independent of profile, approval, and job-alert geography',
    () {
      expect(
        resolveStartupDestination({
          'signedIn': true,
          'emailVerified': true,
          'profile': {'role': 'scaler', 'active': true},
          'workProfileComplete': true,
          'marketStateConfirmed': false,
        }),
        StartupDestination.marketState,
      );
      expect(
        marketStatusMessage(value(confirmed: true)),
        contains("isn't active in your state"),
      );
      expect(
        marketStatusMessage({'stateConfirmed': true, 'status': 'ACTIVE'}),
        contains('saved service areas'),
      );
      expect(
        marketStatusMessage({'stateConfirmed': true, 'status': 'ACTIVE'}),
        contains('payment readiness'),
      );
    },
  );
  testWidgets(
    'explicit state choice, unchecked launch preference, authoritative success then continue',
    (tester) async {
      var saved = 0, continued = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: MarketStateScreen(
            load: () async => value(),
            save: (state, notifications) async {
              saved++;
              expect(state, states[1]['id']);
              expect(notifications, false);
              return value(confirmed: true);
            },
            onCompleted: () => continued++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Save and continue'),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        false,
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pennsylvania').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save and continue'));
      await tester.tap(find.text('Save and continue'));
      await tester.pumpAndSettle();
      expect(saved, 1);
      expect(continued, 1);
    },
  );
  testWidgets('failed save stays recoverable and never reports completion', (
    tester,
  ) async {
    var continued = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: MarketStateScreen(
          load: () async => value(confirmed: true),
          save: (_, _) async => throw Exception('offline'),
          onCompleted: () => continued++,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save and continue'));
    await tester.tap(find.text('Save and continue'));
    await tester.pumpAndSettle();
    expect(continued, 0);
    expect(find.textContaining('not confirmed'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -250));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
  });
  testWidgets(
    'narrow large-text state selection stays scrollable and readable',
    (tester) async {
      tester.view.reset();
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: MarketStateScreen(
            load: () async => value(confirmed: true),
            save: (_, _) async => value(confirmed: true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Save state'), 250);
      expect(tester.takeException(), isNull);
      expect(find.text('Save state'), findsOneWidget);
    },
  );
  testWidgets(
    'Admin shows Unknown counts and never changes rollout on viewing',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final calls = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: AdminMarketRolloutScreen(
            call: (input) async {
              calls.add(input['action'] as String);
              return {
                'initialized': true,
                'revision': 1,
                'unknown': {'businesses': 3, 'scalers': 4},
                'rows': [
                  for (final state in states)
                    {...state, 'businesses': 0, 'scalers': 0},
                ],
              };
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Unknown — state not confirmed'), 250);
      expect(find.textContaining('3 Businesses · 4 Scalers'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Pennsylvania'), 250);
      expect(tester.takeException(), isNull);
      expect(calls, ['demand']);
    },
  );
}
