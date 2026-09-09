import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/paused_work_panel.dart';
import 'package:flutter_app/widgets/reserve_settlement_panel.dart';
import 'package:flutter_app/widgets/completion_evidence_panel.dart';
import 'package:flutter_app/services/job_room_service.dart';
import 'package:flutter_app/models/work_lifecycle_presentation.dart';

class FakeWorkService extends JobRoomService {
  int calls = 0;
  bool fail = false;
  @override
  Future<Map<String, dynamic>> reviewPausedWork(
    String zoneId,
    String action, {
    int? amountCents,
    String? reason,
    String? offerId,
  }) async {
    calls++;
    if (fail) throw StateError('held');
    return {'status': 'settled'};
  }
}

void main() {
  test(
    'pause presentation is available only in staging or the accepted production policy',
    () {
      expect(supportsWorkPause(staging: true), isTrue);
      expect(
        supportsWorkPause(
          staging: false,
          policyVersion: 'CanvassingRoute80_95V1',
        ),
        isTrue,
      );
      expect(supportsWorkPause(staging: false), isFalse);
      expect(
        supportsWorkPause(staging: false, policyVersion: 'HistoricalPolicy'),
        isFalse,
      );
    },
  );
  testWidgets(
    'pending refund never claims returned money; confirmed receipt does',
    (t) async {
      const amounts = {
        'earnedWorkerCents': 1500,
        'earnedFeeCents': 300,
        'businessReturnCents': 360,
        'finalCostCents': 1800,
      };
      for (final status in ['preview', 'refund_pending', 'refunded']) {
        await t.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ReserveSettlementPanel(
                settlement: {...amounts, 'returnStatus': status},
              ),
            ),
          ),
        );
        expect(find.text('\$3.60'), findsOneWidget);
        expect(find.text('\$18.00'), findsOneWidget);
        expect(
          find.text('Returned to You'),
          status == 'refunded' ? findsOneWidget : findsNothing,
        );
        expect(t.takeException(), isNull);
      }
    },
  );
  testWidgets(
    'pause shows local deadline, saved coverage and resume without starting automatically',
    (t) async {
      int resumes = 0, messages = 0;
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: PausedWorkPanel(
                zoneId: 'z',
                data: {
                  'state': 'paused',
                  'canResume': true,
                  'resumeByMs': DateTime(
                    2026,
                    9,
                    10,
                    17,
                    30,
                  ).millisecondsSinceEpoch,
                  'estimate': {'coveragePercentage': 92.88},
                },
                business: false,
                onChanged: () async {},
                onResume: () => resumes++,
                onMessage: () => messages++,
              ),
            ),
          ),
        ),
      );
      expect(find.textContaining('92.9%'), findsOneWidget);
      expect(find.textContaining('T17:30'), findsNothing);
      expect(resumes, 0);
      await t.tap(find.text('Resume Job'));
      expect(resumes, 1);
      await t.tap(find.text('Message Business'));
      expect(messages, 1);
    },
  );
  testWidgets(
    'partial acceptance shows exact amount and requires confirmation; failure never shows success',
    (t) async {
      final service = FakeWorkService()..fail = true;
      int refreshes = 0;
      await t.binding.setSurfaceSize(const Size(390, 1400));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: PausedWorkPanel(
                zoneId: 'z',
                service: service,
                data: {
                  'state': 'paused',
                  'canResume': true,
                  'estimate': {'coveragePercentage': 50},
                  'offer': {
                    'offerId': 'o',
                    'state': 'offered',
                    'amountCents': 1000,
                    'reason': 'Accepted partial work',
                  },
                },
                business: false,
                onChanged: () async {
                  refreshes++;
                },
                onResume: () {},
                onMessage: () {},
              ),
            ),
          ),
        ),
      );
      await t.tap(find.text('Review and Accept Offer'));
      await t.pumpAndSettle();
      expect(service.calls, 0);
      expect(find.textContaining('Approve \$10.00'), findsOneWidget);
      await t.tap(find.text('Confirm'));
      await t.pumpAndSettle();
      expect(service.calls, 1);
      expect(refreshes, 0);
      expect(find.textContaining('could not be confirmed'), findsOneWidget);
    },
  );
  testWidgets('route diagnostics stay collapsed and timestamps are local', (
    t,
  ) async {
    await t.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: CompletionEvidencePanel(
              tilesEnabled: false,
              evidence: {
                'estimate': {
                  'coveragePercentage': 92.88,
                  'denominatorMeters': 277.9,
                  'plannedWalkingMeters': 555.8,
                },
                'proofCount': 34,
                'startedAt': '2026-09-08T21:33:42.910Z',
                'endedAt': '2026-09-08T21:45:09.414Z',
              },
            ),
          ),
        ),
      ),
    );
    expect(find.textContaining('555.8'), findsNothing);
    expect(find.textContaining('2026-09-08T'), findsNothing);
    expect(find.text('Evidence Details'), findsOneWidget);
    await t.tap(find.text('Evidence Details'));
    await t.pumpAndSettle();
    expect(find.textContaining('555.8'), findsOneWidget);
  });
  test(
    'paused and expired work remain discoverable in their correct surfaces',
    () {
      expect(workSection('paused_work_window'), WorkSection.active);
      expect(workSection('incomplete_review'), WorkSection.review);
      expect(
        routeCaptureLabel({'status': 'paused_work_window'}),
        'Work paused · route saved',
      );
    },
  );
}
