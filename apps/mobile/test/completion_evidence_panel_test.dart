import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/completion_evidence_panel.dart';

void main() {
  testWidgets(
    'review shows route evidence, exact money hold, checkpoints and no household claims',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: CompletionEvidencePanel(
                tilesEnabled: false,
                evidence: {
                  'estimate': {
                    'state': 'available',
                    'coveragePercentage': 20.7,
                    'coveredMeters': 115,
                    'denominatorMeters': 555,
                    'remainingMeters': 440,
                  },
                  'policy': {
                    'baseAmountCents': 1500,
                    'baseEligibility': 'HELD',
                    'payableAmountCents': null,
                    'checkpointCount': 0,
                    'requiredCheckpointCount': 2,
                    'remainingCheckpoints': 2,
                  },
                  'proofCount': 29,
                  'historicalCalculatedAmountCents': 311,
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Evidence Details'));
      await tester.pumpAndSettle();
      expect(find.text('Accepted base compensation: \$15.00'), findsOneWidget);
      expect(
        find.text('Held payable amount before approval: HELD — not authorized'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Historical calculation: \$3.11'),
        findsOneWidget,
      );
      expect(
        find.textContaining('no manual progress report required'),
        findsOneWidget,
      );
      expect(find.textContaining('5 / 23'), findsNothing);
      expect(find.textContaining('GPS proximity estimate'), findsOneWidget);
      expect(find.text('Assigned walking area'), findsOneWidget);
      expect(
        find.textContaining('Minimum for base eligibility: 80%'),
        findsOneWidget,
      );
    },
  );
  for (final value in [1500, 1800]) {
    testWidgets(
      'eligible review shows exact held cents $value without proration',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: CompletionEvidencePanel(
                  tilesEnabled: false,
                  evidence: {
                    'policy': {
                      'baseAmountCents': 1500,
                      'baseEligibility': 'Eligible',
                      'payableAmountCents': value,
                      'acceptedBonusAmountCents': 300,
                      'bonusStatus': value == 1800
                          ? 'Earned - held for approval'
                          : 'Not Earned',
                    },
                    'estimate': {
                      'state': 'available',
                      'coveragePercentage': value == 1800 ? 95.0 : 84.0,
                    },
                  },
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Evidence Details'));
        await tester.pumpAndSettle();
        expect(
          find.text(
            'Held payable amount before approval: \$${(value / 100).toStringAsFixed(2)}',
          ),
          findsOneWidget,
        );
        expect(find.text('Accepted coverage bonus: \$3.00'), findsOneWidget);
        expect(
          find.text(
            value == 1800
                ? 'Bonus: Earned - held for approval'
                : 'Bonus: Not Earned',
          ),
          findsOneWidget,
        );
        expect(
          find.text('Accepted base compensation: \$15.00'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Minimum for base eligibility: 80%'),
          findsOneWidget,
        );
      },
    );
  }
}
