import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_email_campaign_review.dart';
import 'package:flutter_app/screens/business/business_email_campaign_screen.dart';
import 'package:flutter_app/services/business_email_service.dart';

class ReviewedCampaignService extends BusinessEmailService {
  final calls = <String>[];
  final campaign = <String, dynamic>{
    'campaignId': 'review',
    'version': 2,
    'reviewDigest': 'reviewed-content',
    'sender': 'owner@example.test',
    'subject': 'Your home improvement project',
    'body': 'Hi {{FirstName}},\nCan we help with {{ProjectType}}?',
    'mailingAddress': 'Business mailing address',
    'approved': false,
    'canApprove': true,
    'eligibleCount': 7,
    'status': 'needs_founder_review',
    'results': {'sent': 0, 'replies': 0},
    'audience': [
      for (var i = 0; i < 7; i++)
        {
          'candidateId': 'person$i',
          'name': 'Person $i',
          'email': 'person$i@example.test',
          'firstName': 'Person',
          'projectType': 'your deck',
          'body':
              'Hi Person,\nCan we help with your deck?\nBusiness mailing address\nUnsubscribe: individual link',
          'state': 'not_sent',
          'eligible': true,
          'provenance': [],
        },
    ],
  };
  @override
  Future<Map<String, dynamic>> call(
    String op, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(op);
    if (op == 'loadCampaigns') {
      return {
        'sender': 'owner@example.test',
        'sendingEnabled': true,
        'campaigns': [campaign],
        'candidates': [],
      };
    }
    if (op == 'approveCampaign') {
      return {...campaign, 'approved': true, 'status': 'sending'};
    }
    return Map.of(campaign);
  }
}

void main() {
  testWidgets(
    'saved audience stays seven while new selection is empty; Review Campaign is directly actionable',
    (tester) async {
      final service = ReviewedCampaignService();
      await tester.pumpWidget(
        MaterialApp(home: BusinessEmailCampaignScreen(service: service)),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('7 reviewed recipients'), findsOneWidget);
      await tester.tap(find.text('Review Campaign'));
      await tester.pumpAndSettle();
      expect(find.text('Approve & Send Now'), findsOneWidget);
      expect(service.calls.contains('approveCampaign'), false);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'narrow large-text campaign confirms twice and never sends on opening or Keep Reviewing',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = ReviewedCampaignService();
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(1.6)),
            child: child!,
          ),
          home: BusinessEmailCampaignReview(
            campaign: service.campaign,
            service: service,
            candidates: const [],
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Approve & Send Now'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text('Approve & Send Now'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Approve & Send Now'));
      await tester.pumpAndSettle();
      expect(find.text('Send this campaign to 7 people?'), findsOneWidget);
      expect(service.calls.contains('approveCampaign'), false);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Keep Reviewing'));
      await tester.pumpAndSettle();
      expect(service.calls.contains('approveCampaign'), false);
      await tester.tap(find.text('Approve & Send Now'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Send Campaign'));
      await tester.pumpAndSettle();
      expect(service.calls.where((c) => c == 'approveCampaign').length, 1);
      expect(find.text('Sending'), findsOneWidget);
      expect(find.text('Approve & Send Now'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test('campaign states do not call partial or ambiguous execution Sent', () {
    expect(emailCampaignStatus('partially_sent'), 'Partially sent');
    expect(emailCampaignStatus('needs_attention'), 'Needs attention');
    expect(emailCampaignStatus('scheduled'), 'Scheduled');
  });
}
