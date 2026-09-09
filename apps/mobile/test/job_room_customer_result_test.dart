import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/jobs/job_room_screen.dart';
import 'package:flutter_app/services/job_room_service.dart';
import 'package:flutter_app/widgets/job_room_completion_result.dart';

class _FinishedRoom extends JobRoomService {
  @override
  Future<Map<String, dynamic>> load(String id) async => {
    'viewerRole': 'scaler',
    'privateLogisticsAvailable': false,
    'room': {'scalerId': 'scaler'},
    'zone': {'status': 'completed', 'zoneName': 'Neighborhood route'},
    'campaign': {'campaignType': 'neighborhoodCanvassing'},
    'participantLabels': {
      'participants': [
        {'uid': 'scaler', 'displayName': 'Avery Walker'},
      ],
    },
    'compensation': {'baseAmountCents': 1500, 'bonusAmountCents': 300},
    'completionEvidence': {
      'estimate': {'coveragePercentage': 98.5955},
      'proofCount': 35,
      'policy': {
        'baseAmountCents': 1500,
        'payableBaseAmountCents': 1500,
        'bonusAmountCents': 300,
        'payableAmountCents': 1800,
      },
    },
    'completions': [
      {
        'scalerId': 'scaler',
        'status': 'approved',
        'gpsPointCount': 35,
        'proofCount': 1,
        'earning': {
          'type': 'scaler_earnings',
          'amountCents': 1800,
          'baseAmountCents': 1500,
          'bonusAmountCents': 300,
        },
      },
    ],
  };
}

void main() {
  testWidgets(
    'completed phone-width Job Room prioritizes recorded results and hides setup',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: JobRoomScreen(
            zoneId: 'zone',
            service: _FinishedRoom(),
            tilesEnabled: false,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(BackButton), findsOneWidget);
      expect(find.text('Approved'), findsOneWidget);
      expect(find.text('Scaler: Avery Walker'), findsOneWidget);
      expect(find.text('98.60%'), findsOneWidget);
      expect(find.text('Base Pay'), findsOneWidget);
      expect(find.text('\$15.00'), findsOneWidget);
      expect(find.text('Coverage Bonus'), findsOneWidget);
      expect(find.text('\$3.00'), findsOneWidget);
      expect(find.text('Total Approved'), findsOneWidget);
      expect(find.text('\$18.00'), findsOneWidget);
      expect(find.textContaining('35 GPS points'), findsNothing);
      expect(find.textContaining('GPS proof points'), findsNothing);
      expect(find.text('Confirm Ready'), findsNothing);
      expect(find.text('Save Material Logistics'), findsNothing);
      expect(find.text('Review Completion'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(find.text('Evidence Details'), 250);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Evidence Details'));
      await tester.pumpAndSettle();
      expect(find.textContaining('GPS proof points: 35'), findsOneWidget);
    },
  );

  testWidgets(
    'missing payment components never invent an earned bonus or a paid total',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: JobRoomCompletionResult(
              completion: {'status': 'approved'},
              evidence: {
                'estimate': {'coveragePercentage': 100},
              },
              compensation: {'baseAmountCents': 1500, 'bonusAmountCents': 300},
            ),
          ),
        ),
      );
      expect(find.text('\$3.00'), findsNothing);
      expect(find.text('\$18.00'), findsNothing);
      expect(find.text('Not available'), findsNWidgets(2));
      expect(find.text('Accepted Base Pay'), findsOneWidget);
    },
  );

  test('customer label never falls back to an email or internal UID', () {
    expect(
      jobRoomScalerName({}, {
        'scalerId': 'private-uid',
        'scalerEmail': 'private@example.test',
      }),
      'Assigned Scaler — name unavailable',
    );
  });
}
