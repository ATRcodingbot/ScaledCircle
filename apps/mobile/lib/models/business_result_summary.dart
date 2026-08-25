enum BusinessZoneResultState {
  none,
  awaitingReview,
  approved,
  redoRequired,
  disputed,
  rejected,
  historical,
}

class BusinessCampaignResultSummary {
  const BusinessCampaignResultSummary({
    required this.campaignId,
    required this.resultCount,
    required this.awaitingReviewCount,
    required this.approvedCount,
    required this.redoCount,
    required this.disputedCount,
    required this.rejectedCount,
  });

  final String campaignId;
  final int resultCount;
  final int awaitingReviewCount;
  final int approvedCount;
  final int redoCount;
  final int disputedCount;
  final int rejectedCount;

  bool get hasResults => resultCount > 0;
  bool get needsReview => awaitingReviewCount > 0;

  String get conciseStatus {
    if (awaitingReviewCount > 0) {
      return '$awaitingReviewCount Zone${awaitingReviewCount == 1 ? '' : 's'} awaiting review';
    }
    if (approvedCount > 0) {
      return '$approvedCount approved Zone result${approvedCount == 1 ? '' : 's'}';
    }
    if (redoCount > 0) {
      return '$redoCount Zone${redoCount == 1 ? '' : 's'} in redo';
    }
    if (disputedCount > 0) return 'Result under dispute';
    if (rejectedCount > 0) return 'Result history available';
    return 'Results available';
  }

  static const empty = BusinessCampaignResultSummary(
    campaignId: '',
    resultCount: 0,
    awaitingReviewCount: 0,
    approvedCount: 0,
    redoCount: 0,
    disputedCount: 0,
    rejectedCount: 0,
  );
}

class BusinessResultSummary {
  BusinessResultSummary._(this.byCampaignId);

  final Map<String, BusinessCampaignResultSummary> byCampaignId;

  int get awaitingReviewCount => byCampaignId.values.fold(
    0,
    (total, summary) => total + summary.awaitingReviewCount,
  );

  bool get hasResults =>
      byCampaignId.values.any((summary) => summary.hasResults);

  List<String> get campaignsAwaitingReview => byCampaignId.entries
      .where((entry) => entry.value.needsReview)
      .map((entry) => entry.key)
      .toList(growable: false);

  BusinessCampaignResultSummary forCampaign(String campaignId) =>
      byCampaignId[campaignId] ?? BusinessCampaignResultSummary.empty;

  static BusinessZoneResultState zoneState(Map<String, dynamic> zone) {
    final status = _text(zone['status']);
    final reviewStatus = _text(zone['reviewStatus']);
    final hasSubmissionEvidence =
        _nonEmpty(zone['submittedCompletionId']) ||
        zone['submittedAt'] != null ||
        zone['completionSubmittedAt'] != null ||
        ((zone['submittedRoutePointCount'] as num?)?.toInt() ?? 0) > 0 ||
        ((zone['gpsRoutePointCount'] as num?)?.toInt() ?? 0) > 0;

    if (status == 'submitted' &&
        const {
          'verification_pending',
          'review_pending',
          'submitted',
        }.contains(reviewStatus.isEmpty ? status : reviewStatus)) {
      return BusinessZoneResultState.awaitingReview;
    }
    if (const {'approved', 'auto_approved'}.contains(reviewStatus)) {
      return BusinessZoneResultState.approved;
    }
    if (const {
      'redo_required',
      'request_redo',
      'redo_requested',
    }.contains(reviewStatus)) {
      return BusinessZoneResultState.redoRequired;
    }
    if (reviewStatus == 'disputed') return BusinessZoneResultState.disputed;
    if (reviewStatus == 'rejected') return BusinessZoneResultState.rejected;
    if (hasSubmissionEvidence) return BusinessZoneResultState.historical;
    return BusinessZoneResultState.none;
  }

  static BusinessResultSummary fromZones(Iterable<Map<String, dynamic>> zones) {
    final mutable = <String, List<BusinessZoneResultState>>{};
    for (final zone in zones) {
      final campaignId = zone['campaignId']?.toString().trim() ?? '';
      if (campaignId.isEmpty) continue;
      final state = zoneState(zone);
      if (state == BusinessZoneResultState.none) continue;
      mutable.putIfAbsent(campaignId, () => []).add(state);
    }

    return BusinessResultSummary._({
      for (final entry in mutable.entries)
        entry.key: BusinessCampaignResultSummary(
          campaignId: entry.key,
          resultCount: entry.value.length,
          awaitingReviewCount: entry.value
              .where((state) => state == BusinessZoneResultState.awaitingReview)
              .length,
          approvedCount: entry.value
              .where((state) => state == BusinessZoneResultState.approved)
              .length,
          redoCount: entry.value
              .where((state) => state == BusinessZoneResultState.redoRequired)
              .length,
          disputedCount: entry.value
              .where((state) => state == BusinessZoneResultState.disputed)
              .length,
          rejectedCount: entry.value
              .where((state) => state == BusinessZoneResultState.rejected)
              .length,
        ),
    });
  }

  static String _text(Object? value) =>
      value?.toString().trim().toLowerCase() ?? '';

  static bool _nonEmpty(Object? value) =>
      value?.toString().trim().isNotEmpty == true;
}
