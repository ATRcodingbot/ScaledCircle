import 'package:flutter/material.dart';
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
    if (fail) throw StateError('fixture failure');
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
  testWidgets(
    'Business AI Team is plain-language, responsive, and mutation-safe',
    (WidgetTester tester) async {
      final service = _FakeAgenticGateway();
      await _pumpAt(tester, AgenticGrowthScreen(service: service));
      expect(find.text('AI Team'), findsOneWidget);
      expect(find.text('External actions'), findsOneWidget);
      expect(find.text('Off'), findsOneWidget);
      expect(find.text('Marketing Manager'), findsOneWidget);
      expect(find.text('Draft only'), findsOneWidget);
      expect(find.text('Research only'), findsOneWidget);
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
    'Admin AI Team health is responsive and exposes no internal secrets',
    (WidgetTester tester) async {
      await _pumpAt(
        tester,
        AdminAgenticGrowthScreen(service: _FakeAgenticGateway()),
      );
      expect(find.text('External actions'), findsOneWidget);
      expect(find.text('Provider execution routes: 0'), findsOneWidget);
      expect(find.text('Executable actions'), findsOneWidget);
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
