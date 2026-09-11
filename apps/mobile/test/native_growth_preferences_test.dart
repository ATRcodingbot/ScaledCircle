import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/growth_opportunity_preferences_card.dart';
import 'package:flutter_app/widgets/membership_account_description.dart';
import 'package:flutter_app/widgets/customer_social_plan_card.dart';
import 'package:flutter_app/services/social_operations_service.dart';

void main() {
  test('membership description follows authoritative state', () {
    expect(
      membershipAccountDescription({'complimentary': true}),
      'View your plan and access',
    );
    expect(
      membershipAccountDescription({'paidAccess': true}),
      'Change or manage your membership',
    );
    expect(
      membershipAccountDescription({'cancelAtPeriodEnd': true}),
      'Manage or reactivate your membership',
    );
  });
  test(
    'unfinished channels fail closed without an explicit internal response',
    () {
      final workspace = SocialOperationsWorkspace({
        'connections': [
          for (final p in ['facebook', 'instagram', 'x', 'youtube'])
            {'provider': p},
        ],
      });
      expect(workspace.availableConnections.map((c) => c['provider']), [
        'facebook',
        'instagram',
      ]);
      expect(workspace.internalDevelopmentAvailable, isFalse);
    },
  );
  testWidgets(
    'large-text Growth preferences require deliberate save, failure never claims success',
    (tester) async {
      tester.view.physicalSize = const Size(360, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var saves = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: ListView(
                children: [
                  GrowthOpportunityPreferencesCard(
                    values: const {},
                    onSave: (values) async {
                      saves++;
                      expect(values['government'], isFalse);
                      expect(values['paidLeadSources'], isFalse);
                      throw StateError('test failure');
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Growth Preferences'));
      await tester.pumpAndSettle();
      expect(saves, 0);
      await tester.scrollUntilVisible(
        find.text('Save Growth Preferences'),
        350,
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save Growth Preferences'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save Growth Preferences'));
      await tester.pumpAndSettle();
      expect(saves, 1);
      expect(find.text('Growth Preferences saved.'), findsNothing);
      expect(
        find.text(
          'Preferences could not be confirmed. Retry to save your focus.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('opening large-text strategy review does not approve', (
    tester,
  ) async {
    var approvals = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            body: ListView(
              children: [
                CustomerSocialPlanCard(
                  plan: const {
                    'status': 'ready_for_review',
                    'goal': 'Plan',
                    'items': [],
                  },
                  initiallyExpanded: true,
                  onApprove: () => approvals++,
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(approvals, 0);
    await tester.scrollUntilVisible(find.text('Approve 30-Day Plan'), 250);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Approve 30-Day Plan'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve 30-Day Plan'));
    expect(approvals, 1);
    expect(tester.takeException(), isNull);
  });
}
