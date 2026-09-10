import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_growth_home.dart';
import 'package:flutter_app/widgets/social_runtime_status_card.dart';

void main() {
  for (final width in [360.0, 1280.0]) {
    testWidgets('Growth has six clear team destinations at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessGrowthHome(
            loadOverride: () async => {
              'summary': {
                'awaitingApproval': 5,
                'opportunityGroups': [
                  {'label': 'Partner / recruitment channels', 'count': 5},
                ],
              },
              'social': {'planCount': 1},
              'agents': [
                for (final e in {
                  'growth_strategist': 'Growth Manager',
                  'lead_generation': 'Lead Generator',
                  'workforce_recruiter': 'Workforce Recruiter',
                  'marketing_manager': 'Social Manager',
                  'ad_manager': 'Ad Manager',
                  'business_assistant': 'Business Assistant',
                }.entries)
                  {'type': e.key, 'name': e.value, 'status': 'Needs review'},
              ],
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byTooltip('Back'), findsOneWidget);
      expect(find.text('5 Partner / recruitment channels'), findsOneWidget);
      for (final name in [
        'Growth Manager',
        'Lead Generator',
        'Workforce Recruiter',
        'Social Manager',
        'Ad Manager',
        'Business Assistant',
      ]) {
        expect(find.text(name), findsOneWidget);
      }
      expect(find.textContaining('AI Team'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('draft status does not imply publication authority', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SocialRuntimeStatusCard(
            status: const {
              'available': true,
              'summary': {
                'title': 'Needs your review',
                'description':
                    'Your saved strategy and draft posts need your review. Nothing is scheduled.',
              },
              'channels': [],
            },
            onRefresh: () {},
          ),
        ),
      ),
    );
    expect(find.text('Needs your review'), findsOneWidget);
    expect(find.textContaining('Nothing is scheduled'), findsOneWidget);
    expect(
      find.textContaining('Account permissions do not approve posts'),
      findsOneWidget,
    );
  });
}
