import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/premium_agent_workspace.dart';

void main() {
  test('recommendation actions route to the matching maintained workspace', () {
    expect(
      recommendationDestination({
        'summary': {
          'next': 'Review sourced decision packages and outreach drafts.',
        },
      }),
      '/business/growth-agents?agent=lead_generation',
    );
    expect(
      recommendationDestination({
        'summary': {'next': 'Review customer replies.'},
      }),
      '/business/email-connection',
    );
    expect(
      recommendationDestination({
        'summary': {'next': 'Update approved brand images.'},
      }),
      '/business/brand-assets',
    );
  });
  test(
    'recommendations newest first and normalized duplicates retain history',
    () {
      final rows = distinctAgentRecommendations([
        {
          'id': 'old',
          'period': '2026-09-07',
          'summary': {
            'learned': 'Review the profile',
            'next': 'Update services',
          },
        },
        {
          'id': 'middle',
          'period': '2026-09-10',
          'summary': {'learned': 'Review replies', 'next': 'Open email'},
        },
        {
          'id': 'new',
          'period': '2026-09-11',
          'summary': {
            'learned': 'Review THE profile',
            'next': 'Update  services',
          },
        },
      ]);
      expect(rows.length, 2);
      expect(rows.first['id'], 'new');
      expect((rows.first['history'] as List).length, 2);
    },
  );
  for (final focus in [
    'lead_generation',
    'workforce_recruiter',
    'ad_manager',
    'business_assistant',
    'growth_strategist',
    'team',
  ]) {
    testWidgets(
      '$focus has distinct narrow, large-text actions and truthful data',
      (tester) async {
        tester.view.physicalSize = const Size(360, 850);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            builder: (c, child) => MediaQuery(
              data: MediaQuery.of(
                c,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
            home: Scaffold(
              body: PremiumAgentWorkspace(
                data: {
                  'prospects': [
                    {
                      'id': 'org',
                      'kind': 'referral_partner',
                      'displayName': 'Recruiting partner',
                    },
                    {
                      'id': 'person',
                      'kind': 'scaler',
                      'displayName': 'A candidate',
                    },
                  ],
                  'agents': agentNames.entries
                      .map(
                        (e) => {
                          'type': e.key,
                          'status': 'Needs review',
                          'result': 'No external activity',
                        },
                      )
                      .toList(),
                  'businessContext': {
                    'services': ['Decks'],
                    'maintainedAreas': ['Saved service area'],
                  },
                  'premium': {},
                },
                focus: focus,
                onOpen: (_) {},
                onResearch: () {},
                onReviewPeople: (_, id) {},
                onPerformance: () {},
                preferences: const Text('Search preferences'),
                onRecommendation: (_, decision) {},
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text(agentNames[focus] ?? 'Growth Team'), findsOneWidget);
        for (var i = 0; i < 12; i++) {
          await tester.drag(find.byType(ListView).first, const Offset(0, -500));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
        expect(find.text('Request access review'), findsNothing);
      },
    );
  }
}
