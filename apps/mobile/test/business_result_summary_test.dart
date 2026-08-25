import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/business_result_summary.dart';

Map<String, dynamic> zone(
  String campaignId, {
  String status = 'in_progress',
  String? reviewStatus,
  bool submitted = false,
}) {
  final data = <String, dynamic>{'campaignId': campaignId, 'status': status};
  if (reviewStatus case final value?) data['reviewStatus'] = value;
  if (submitted) data['submittedCompletionId'] = 'completion-$campaignId';
  return data;
}

void main() {
  group('Business result authority', () {
    test('zero campaigns and work in progress have no results', () {
      expect(BusinessResultSummary.fromZones(const []).hasResults, isFalse);
      final summary = BusinessResultSummary.fromZones([zone('active')]);
      expect(summary.hasResults, isFalse);
      expect(summary.awaitingReviewCount, 0);
    });

    test('active campaign with submitted Zone is visible and reviewable', () {
      final summary = BusinessResultSummary.fromZones([
        zone(
          'JgfSusBbwUWAopnJUZJN',
          status: 'submitted',
          reviewStatus: 'verification_pending',
          submitted: true,
        ),
      ]);
      final campaign = summary.forCampaign('JgfSusBbwUWAopnJUZJN');
      expect(campaign.hasResults, isTrue);
      expect(campaign.awaitingReviewCount, 1);
      expect(summary.awaitingReviewCount, 1);
      expect(summary.campaignsAwaitingReview, ['JgfSusBbwUWAopnJUZJN']);
    });

    test('one campaign can contain multiple review obligations', () {
      final summary = BusinessResultSummary.fromZones([
        zone('one', status: 'submitted', reviewStatus: 'verification_pending'),
        zone('one', status: 'submitted', reviewStatus: 'review_pending'),
      ]);
      expect(summary.awaitingReviewCount, 2);
      expect(summary.campaignsAwaitingReview, ['one']);
    });

    test('multiple campaigns remain unambiguous for selector navigation', () {
      final summary = BusinessResultSummary.fromZones([
        zone('one', status: 'submitted', reviewStatus: 'verification_pending'),
        zone('two', status: 'submitted', reviewStatus: 'verification_pending'),
      ]);
      expect(summary.awaitingReviewCount, 2);
      expect(summary.campaignsAwaitingReview, containsAll(['one', 'two']));
    });

    test('submitted and approved mixed Zones retain history', () {
      final summary = BusinessResultSummary.fromZones([
        zone(
          'mixed',
          status: 'submitted',
          reviewStatus: 'verification_pending',
        ),
        zone(
          'mixed',
          status: 'completed',
          reviewStatus: 'approved',
          submitted: true,
        ),
      ]).forCampaign('mixed');
      expect(summary.resultCount, 2);
      expect(summary.awaitingReviewCount, 1);
      expect(summary.approvedCount, 1);
    });

    test('redo and submitted mixed Zones retain prior results', () {
      final summary = BusinessResultSummary.fromZones([
        zone(
          'mixed',
          status: 'in_progress',
          reviewStatus: 'redo_required',
          submitted: true,
        ),
        zone(
          'mixed',
          status: 'submitted',
          reviewStatus: 'verification_pending',
        ),
      ]).forCampaign('mixed');
      expect(summary.resultCount, 2);
      expect(summary.redoCount, 1);
      expect(summary.awaitingReviewCount, 1);
    });

    test('cancelled Zone is not reviewable without submitted evidence', () {
      final empty = BusinessResultSummary.fromZones([
        zone('cancelled', status: 'cancelled'),
      ]);
      expect(empty.hasResults, isFalse);

      final historical = BusinessResultSummary.fromZones([
        zone('cancelled', status: 'cancelled', submitted: true),
      ]).forCampaign('cancelled');
      expect(historical.hasResults, isTrue);
      expect(historical.awaitingReviewCount, 0);
    });

    test('approved, disputed, and rejected results remain discoverable', () {
      final summary = BusinessResultSummary.fromZones([
        zone('history', status: 'completed', reviewStatus: 'approved'),
        zone('history', status: 'submitted', reviewStatus: 'disputed'),
        zone('history', status: 'completed', reviewStatus: 'rejected'),
      ]).forCampaign('history');
      expect(summary.hasResults, isTrue);
      expect(summary.approvedCount, 1);
      expect(summary.disputedCount, 1);
      expect(summary.rejectedCount, 1);
      expect(summary.awaitingReviewCount, 0);
    });
  });

  test('Business surfaces consume the shared Zone-derived summary', () {
    final dashboard = File(
      'lib/screens/business/business_dashboard.dart',
    ).readAsStringSync();
    final results = File(
      'lib/screens/business/business_campaigns_screen.dart',
    ).readAsStringSync();
    final details = File(
      'lib/screens/campaigns/campaign_details_screen.dart',
    ).readAsStringSync();

    for (final source in [dashboard, results]) {
      expect(source, contains("collection('campaignZones')"));
      expect(source, contains('BusinessResultSummary.fromZones'));
    }
    expect(dashboard, contains('awaitingReviewCount'));
    expect(dashboard, contains('reviewCampaigns.length == 1'));
    expect(dashboard, isNot(contains('campaigns.first')));
    expect(results, contains('result.hasResults'));
    expect(results, contains('result.conciseStatus'));
    expect(details, contains('BusinessResultSummary.zoneState'));
  });
}
