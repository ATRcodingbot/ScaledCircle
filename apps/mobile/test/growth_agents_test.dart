import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/growth_agents_screen.dart';
import 'package:flutter_app/models/notification_destination.dart';

void main() {
  for (final width in [360.0, 1280.0]) {
    testWidgets('Growth agents decision package fits $width', (tester) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: GrowthAgentsScreen(
            loadOverride: () async => {
              'summary': {
                'awaitingApproval': 1,
                'businessesFound': 1,
                'partnersFound': 0,
                'individualScalersFound': 0,
                'next': 'Review sources',
              },
              'preferences': {'mode': 'important'},
              'agents': [],
              'runs': [],
              'reports': [],
              'prospects': [
                {
                  'id': 'p',
                  'displayName': 'Example organization',
                  'kind': 'business',
                  'geography': 'Maryland',
                  'sourceUrl': 'https://example.org',
                  'approvalState': 'awaiting_approval',
                  'draft': 'Proposed contact, not sent.',
                },
              ],
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Individual Scaler candidates: 0'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Example organization'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Example organization'));
      await tester.pumpAndSettle();
      expect(find.text('Proposed outreach — not sent'), findsOneWidget);
      expect(find.text('Email: Unknown'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  test('Agent notifications open exact decision package', () {
    final route = notificationDestination({
      'deepLink': {
        'destination': 'growth_agents',
        'prospectId': 'growth_prospect_123',
      },
    });
    expect(route?.route, '/growth-agents?prospect=growth_prospect_123');
    expect(
      notificationDestination({
        'deepLink': {'destination': 'growth_agents', 'reportId': 'report_123'},
      })?.route,
      '/growth-agents?report=report_123',
    );
  });
}
