import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign_funding_presentation.dart';
import 'package:flutter_app/widgets/campaign_funding_status.dart';

void main() {
  test(
    'confirmed payment never substitutes for missing assignment or consent authority',
    () {
      for (final allocation in [
        null,
        {'workerReserveCents': 10000, 'fundingState': 'healthy'},
      ]) {
        final result = CampaignFundingPresentation.fromServer({
          'status': 'paid',
          'allocation': allocation,
        });
        expect(result.title, 'Funding confirmed');
        expect(result.readyToBegin, false);
      }
    },
  );
  test('processing, unknown and refunded payment never enable work', () {
    for (final status in [
      'payment_pending',
      'refunded',
      'unexpected',
      'unfunded',
    ]) {
      expect(
        CampaignFundingPresentation.fromServer({'status': status}).readyToBegin,
        false,
      );
    }
  });
  test('earned obligation survives dispute and refund', () {
    for (final status in ['paid', 'disputed', 'refunded', 'refund_pending']) {
      final result = CampaignFundingPresentation.fromServer({
        'status': status,
        'allocation': {'workerEarnedCents': 10000, 'workerPaidCents': 2500},
      });
      expect(result.obligations, contains('\$75.00 worker payment pending'));
      expect(result.obligations, contains('\$100.00 compensation earned'));
    }
  });
  test('only fresh campaign-bound server eligibility can display ready', () {
    Map<String, dynamic> response(String state) => {
      'status': 'paid',
      'eligibility': {
        'version': 1,
        'campaignId': 'campaign',
        'state': state,
        'checkedAtMs': 1000,
        'expiresAtMs': 16000,
        'readyZoneCount': state == 'ready' ? 1 : 0,
        'zones': [
          {'zoneId': 'zone', 'state': state},
        ],
      },
    };
    expect(
      CampaignFundingPresentation.fromServer(
        response('ready'),
        campaignId: 'campaign',
        nowMs: 2000,
      ).readyToBegin,
      true,
    );
    for (final state in [
      'blocked',
      'awaiting_scaler',
      'assignment_pending',
      'payment_processing',
      'funding_issue',
      'unsupported',
    ]) {
      expect(
        CampaignFundingPresentation.fromServer(
          response(state),
          campaignId: 'campaign',
          nowMs: 2000,
        ).readyToBegin,
        false,
      );
    }
    expect(
      CampaignFundingPresentation.fromServer(
        response('ready'),
        campaignId: 'other',
        nowMs: 2000,
      ).readyToBegin,
      false,
    );
    expect(
      CampaignFundingPresentation.fromServer(
        response('ready'),
        campaignId: 'campaign',
        nowMs: 16001,
      ).readyToBegin,
      false,
    );
  });
  testWidgets(
    'narrow 2x layout renders funding issue and retained obligation',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: CampaignFundingStatus(
                  authorityKey: 'owner/campaign',
                  currentAuthorityKey: () => 'owner/campaign',
                  load: () async => {
                    'status': 'disputed',
                    'allocation': {
                      'workerEarnedCents': 10000,
                      'workerPaidCents': 0,
                    },
                  },
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Funding issue — action required'), findsOneWidget);
      expect(find.text('\$100.00 worker payment pending'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'failed refresh clears prior funded response; expires without cached fallback',
    (tester) async {
      var fail = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CampaignFundingStatus(
              authorityKey: 'owner/campaign',
              currentAuthorityKey: () => 'owner/campaign',
              load: () async {
                if (fail) throw StateError('offline');
                return {'status': 'paid'};
              },
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Funding confirmed'), findsOneWidget);
      await tester.pump(const Duration(seconds: 31));
      expect(find.text('Funding confirmed'), findsNothing);
      fail = true;
      await tester.tap(find.text('Refresh status'));
      await tester.pump();
      expect(find.text('Campaign status unavailable'), findsOneWidget);
      expect(find.text('Ready to begin'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('late response from another account is discarded', (
    tester,
  ) async {
    final response = Completer<Map<String, dynamic>>();
    final changes = StreamController<Object?>();
    var current = 'a/campaign';
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CampaignFundingStatus(
            authorityKey: current,
            currentAuthorityKey: () => current,
            authorityChanges: changes.stream,
            load: () => response.future,
          ),
        ),
      ),
    );
    current = 'b/campaign';
    changes.add(null);
    await tester.pump();
    response.complete({'status': 'paid'});
    await tester.pump();
    expect(find.text('Funding confirmed'), findsNothing);
    expect(find.text('Campaign status unavailable'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    unawaited(changes.close());
  });
}
