import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_email_campaign_screen.dart';
import 'package:flutter_app/services/business_email_service.dart';

class CampaignService extends BusinessEmailService {
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(
    String op, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(op);
    if (op == 'discoverCampaignHistory') {
      return {
        'message': 'More history remains. Continue the bounded review.',
        'nextPageToken': 'next',
      };
    }
    return {
      'sender': 'owner@example.test',
      'candidates': [
        {
          'id': 'candidate',
          'name': 'A customer',
          'email': 'customer@example.test',
          'status': 'needs_review',
          'sources': [
            {
              'kind': 'owner_workbook',
              'label': 'Original workbook',
              'context': 'Estimate inquiry',
            },
          ],
          'evidence': [],
        },
      ],
      'campaigns': [],
      'history': null,
    };
  }
}

void main() {
  test(
    'spreadsheet import requires four bounded source columns and never pads an audience',
    () {
      expect(
        campaignImportRows(
          'Pat\tpat@example.test\t2025-06-01\tDeck estimate',
        ).single['context'],
        'Deck estimate',
      );
      expect(
        () => campaignImportRows('Pat\tpat@example.test'),
        throwsFormatException,
      );
      expect(
        () => campaignImportRows(
          List.filled(26, 'Pat\tpat@example.test\t2025\tEstimate').join('\n'),
        ),
        throwsFormatException,
      );
      expect(campaignContactStatus('suppressed'), 'Do not contact');
    },
  );
  testWidgets(
    'narrow large-text campaign surface has source review, visible check feedback and no send action',
    (tester) async {
      tester.view.resetPhysicalSize();
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = CampaignService();
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(1.6)),
            child: child!,
          ),
          home: BusinessEmailCampaignScreen(service: service),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Sending and scheduling remain blocked'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Review Opt-Out History'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text('Review Opt-Out History'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review Opt-Out History'));
      await tester.pumpAndSettle();
      expect(
        find.text('More history remains. Continue the bounded review.'),
        findsOneWidget,
      );
      expect(find.text('Continue Opt-Out Review'), findsOneWidget);
      expect(service.calls.where((op) => op.contains('send')).isEmpty, true);
      expect(find.text('Send Campaign'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
