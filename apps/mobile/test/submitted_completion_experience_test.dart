import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/work_lifecycle_presentation.dart';
import 'package:flutter_app/widgets/completion_pay_summary.dart';
import 'package:flutter_app/screens/scaler/completion/submit_completion_screen.dart';
import 'package:flutter_app/screens/scaler/completion/submitted_completion_screen.dart';

Map<String, dynamic> evidence(double percent, {bool technical = false}) => {
  'estimate': {'state': 'available', 'coveragePercentage': percent},
  'policy': {
    'baseAmountCents': 1500,
    'acceptedBonusAmountCents': 300,
    'baseThreshold': 80,
    'bonusThreshold': 95,
    'baseEligibility': technical
        ? 'Technical Review Required'
        : percent >= 80
        ? 'Eligible'
        : 'Not Yet Eligible',
    'baseProtected': technical,
    'ordinarySubmissionAllowed': !technical && percent >= 80,
    'coverageBonusEligible': !technical && percent >= 95,
    'payableAmountCents': technical || percent < 80
        ? null
        : percent < 95
        ? 1500
        : 1800,
    'technicalReviewAllowed': technical,
    'exceptionReviewAllowed': true,
  },
};
Map<String, dynamic> room(double percent, {bool submitted = false}) => {
  'campaign': {'campaignType': 'neighborhoodCanvassing'},
  'zone': {'status': submitted ? 'submitted' : 'in_progress'},
  'completionEvidence': evidence(percent),
};
void main() {
  test('submitted cannot be categorized as active work', () {
    expect(workSection('submitted'), WorkSection.review);
    expect(workSection('accepted'), WorkSection.active);
    expect(workSection('completed'), WorkSection.completed);
    expect(
      routeCaptureLabel({'status': 'submitted', 'gpsTracking': false}),
      contains('awaiting review'),
    );
  });
  for (final percent in [79.99, 80.0, 94.99, 95.0, 100.0]) {
    testWidgets(
      'final server result $percent displays exact held pay without proration',
      (t) async {
        await t.binding.setSurfaceSize(const Size(390, 2400));
        addTearDown(() => t.binding.setSurfaceSize(null));
        await t.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: CompletionPaySummary(evidence: evidence(percent)),
              ),
            ),
          ),
        );
        expect(find.text('${percent.toStringAsFixed(1)}%'), findsOneWidget);
        expect(find.textContaining('\$15.00 —'), findsOneWidget);
        expect(
          find.text(
            percent < 80
                ? 'Pending review'
                : percent < 95
                ? '\$15.00'
                : '\$18.00',
          ),
          findsOneWidget,
        );
        expect(find.text('Bonus progress:'), findsOneWidget);
        expect(find.textContaining('5 / 23'), findsNothing);
        expect(find.textContaining('Tracking Active'), findsNothing);
      },
    );
  }
  testWidgets(
    'successful submit disposes old tracking routes and retains coverage and expected pay',
    (t) async {
      await t.binding.setSurfaceSize(const Size(390, 2400));
      addTearDown(() => t.binding.setSurfaceSize(null));
      final completed = Completer<void>();
      var called = 0;
      await t.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: FilledButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => SubmitCompletionScreen(
                      campaignId: 'campaign',
                      businessId: 'business',
                      zoneId: 'zone',
                      zoneName: 'Assigned route',
                      routeId: 'route',
                      gpsPointCount: 35,
                      routeSimulated: false,
                      loadRoom: () async =>
                          room(98.5852, submitted: called > 0),
                      submit: (_, _, _) {
                        called++;
                        return completed.future;
                      },
                    ),
                  ),
                ),
                child: const Text('Open review'),
              ),
            ),
          ),
        ),
      );
      await t.tap(find.text('Open review'));
      await t.pumpAndSettle();
      expect(find.text('98.6%'), findsOneWidget);
      expect(find.text('\$18.00'), findsOneWidget);
      final button = find.widgetWithText(FilledButton, 'Submit Completion');
      await t.ensureVisible(button);
      await t.tap(button);
      await t.pump();
      expect(called, 1);
      completed.complete();
      await t.pumpAndSettle();
      expect(find.text('JOB SUBMITTED'), findsOneWidget);
      expect(find.byType(SubmitCompletionScreen), findsNothing);
      expect(find.text('98.6%'), findsOneWidget);
      expect(find.text('\$18.00'), findsOneWidget);
      expect(find.text('Tracking Active'), findsNothing);
      expect(find.text('Start Job'), findsNothing);
      expect(find.textContaining('earnings after approval'), findsOneWidget);
    },
  );
  testWidgets('below80 does not offer ordinary submission', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 2400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    var called = 0;
    await t.pumpWidget(
      MaterialApp(
        home: SubmitCompletionScreen(
          campaignId: 'c',
          businessId: 'b',
          zoneId: 'z',
          zoneName: 'Zone',
          routeId: 'r',
          gpsPointCount: 12,
          routeSimulated: false,
          loadRoom: () async => room(79.99),
          submit: (_, _, _) async {
            called++;
          },
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(
      find.widgetWithText(FilledButton, 'Submit Completion'),
      findsNothing,
    );
    expect(find.widgetWithText(FilledButton, 'Continue Route'), findsOneWidget);
    expect(called, 0);
  });
  testWidgets(
    'failed refresh retains authoritative saved result and never becomes resumable',
    (t) async {
      await t.binding.setSurfaceSize(const Size(390, 2400));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          home: SubmittedCompletionScreen(
            zoneId: 'z',
            initialEvidence: evidence(98.5),
            loadRoom: () async => throw StateError('offline'),
            onBackToWork: () {},
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('98.5%'), findsOneWidget);
      expect(find.text('\$18.00'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(find.textContaining('Tracking Active'), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    },
  );
  testWidgets('no false success when submission fails', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 2400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(
      MaterialApp(
        home: SubmitCompletionScreen(
          campaignId: 'c',
          businessId: 'b',
          zoneId: 'z',
          zoneName: 'Zone',
          routeId: 'r',
          gpsPointCount: 12,
          routeSimulated: false,
          loadRoom: () async => room(95),
          submit: (_, _, _) async => throw StateError('unavailable'),
        ),
      ),
    );
    await t.pumpAndSettle();
    final b = find.widgetWithText(FilledButton, 'Submit Completion');
    await t.ensureVisible(b);
    await t.tap(b);
    await t.pumpAndSettle();
    expect(find.text('JOB SUBMITTED'), findsNothing);
    expect(
      find.textContaining('Submission could not be confirmed'),
      findsOneWidget,
    );
  });
}
