import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/admin_agentic_growth_screen.dart';
import 'package:flutter_app/screens/business/agentic_growth_screen.dart';
import 'package:flutter_app/services/agentic_growth_service.dart';

class _FakeAgenticGateway implements AgenticGrowthGateway {
  _FakeAgenticGateway({this.fail = false, this.initialized = true});

  bool fail;
  bool initialized;
  int observeCalls = 0;

  @override
  Future<void> initialize() async => initialized = true;

  @override
  Future<AgenticGrowthWorkspace> load() async {
    if (fail) throw StateError('fixture failure');
    return AgenticGrowthWorkspace({
      'initialized': initialized,
      'externalActionsEnabled': false,
      'killSwitchActive': true,
      'agents': const [
        {'name': 'Marketing Manager', 'state': 'Observing', 'enabled': true},
        {'name': 'Business Assistant', 'state': 'Draft only', 'enabled': true},
        {'name': 'Lead Generation', 'state': 'Research only', 'enabled': true},
        {'name': 'Growth Strategist', 'state': 'Observing', 'enabled': true},
      ],
      'observations': const [
        {
          'evidenceState': 'NO_DATA',
          'summary': 'No saved Social evidence was available.',
        },
      ],
      'recommendations': const [],
    });
  }

  @override
  Future<Map<String, dynamic>> loadAdminSummary() async {
    if (fail) {
      throw FirebaseFunctionsException(
        code: 'internal',
        message: 'internal [0]',
      );
    }
    return {
      'agentCount': 5,
      'runCount': 1,
      'latestRunId': 'agent_run_one',
      'evidenceStates': const ['NO_DATA'],
      'observationCount': 1,
      'recommendationCount': 0,
      'actionObjectCount': 0,
      'killSwitchActiveCount': 1,
      'externalExecutionRouteCount': 0,
    };
  }

  @override
  Future<Map<String, dynamic>> runMarketingObserve(String requestKey) async {
    observeCalls += 1;
    expect(requestKey, 'current_social_evidence');
    return {'runId': 'run-one', 'recommendationCount': 0};
  }
}

Future<void> _pumpAt(
  WidgetTester tester,
  Widget child, {
  Size size = const Size(390, 844),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: child));
  await tester.pumpAndSettle();
}

void main() {
  test('agent mode labels never masquerade as completed work', () {
    const workspace = AgenticGrowthWorkspace({
      'initialized': true,
      'runs': [
        {'agentType': 'marketing_manager', 'status': 'completed'},
        {'agentType': 'lead_generation', 'status': 'failed'},
      ],
    });
    expect(
      workspace.activitySummary({
        'type': 'business_assistant',
        'enabled': true,
        'state': 'Active',
      }),
      contains('No completed run is recorded'),
    );
    expect(
      workspace.activitySummary({'type': 'marketing_manager', 'enabled': true}),
      contains('A stored review completed'),
    );
    expect(
      workspace.activitySummary({'type': 'lead_generation', 'enabled': true}),
      contains('recorded run failed'),
    );
    expect(
      workspace.activitySummary({'type': 'supervisor', 'enabled': false}),
      contains('Not enabled'),
    );
  });

  testWidgets(
    'Business AI Team is plain-language, responsive, and mutation-safe',
    (WidgetTester tester) async {
      final service = _FakeAgenticGateway();
      await _pumpAt(tester, AgenticGrowthScreen(service: service));
      expect(find.text('AI Team'), findsOneWidget);
      expect(find.text('External actions'), findsOneWidget);
      expect(find.text('Off'), findsOneWidget);
      expect(find.text('Marketing Manager'), findsOneWidget);
      expect(find.textContaining('No completed run is recorded'), findsWidgets);
      expect(find.text('Observing'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('More evidence is needed'),
        240,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('More evidence is needed'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('No recommendations yet'),
        240,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('No recommendations yet'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Business AI Team supports empty setup and one observable review',
    (WidgetTester tester) async {
      final service = _FakeAgenticGateway(initialized: false);
      await _pumpAt(tester, AgenticGrowthScreen(service: service));
      expect(find.text('Set up AI Team'), findsOneWidget);
      await tester.tap(find.text('Set up AI Team'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Review current marketing plan'),
        240,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Review current marketing plan'));
      await tester.pumpAndSettle();
      expect(service.observeCalls, 1);
      expect(find.textContaining('Review complete'), findsOneWidget);
    },
  );

  testWidgets('Business AI Team provides bounded retry state', (
    WidgetTester tester,
  ) async {
    final service = _FakeAgenticGateway(fail: true);
    await _pumpAt(tester, AgenticGrowthScreen(service: service));
    expect(find.text('Unable to load your AI Team.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    service.fail = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Marketing Manager'), findsOneWidget);
  });

  testWidgets(
    'Admin errors are readable and retry without exposing raw server messages',
    (tester) async {
      final service = _FakeAgenticGateway(fail: true);
      await _pumpAt(tester, AdminAgenticGrowthScreen(service: service));
      expect(find.text("We couldn't load AI Team operations."), findsOneWidget);
      expect(find.text('internal [0]'), findsNothing);
      service.fail = false;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('ScaledCircle Growth Agents'), findsOneWidget);
    },
  );

  testWidgets(
    'Admin AI Team health is responsive and exposes no internal secrets',
    (WidgetTester tester) async {
      await _pumpAt(
        tester,
        AdminAgenticGrowthScreen(service: _FakeAgenticGateway()),
      );
      expect(find.text('External actions'), findsOneWidget);
      expect(find.text('Provider execution routes: 0'), findsOneWidget);
      expect(find.text('Recorded actions'), findsOneWidget);
      expect(find.text('agent_run_one'), findsOneWidget);
      expect(find.text('NO_DATA'), findsOneWidget);
      expect(find.text('client secret'), findsNothing);
      expect(find.text('action hash'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Desktop AI Team layout renders without overflow', (
    WidgetTester tester,
  ) async {
    await _pumpAt(
      tester,
      AgenticGrowthScreen(service: _FakeAgenticGateway()),
      size: const Size(1280, 900),
    );
    expect(find.text('AI Team'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
