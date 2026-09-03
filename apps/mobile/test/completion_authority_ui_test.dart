import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final campaignService = File(
    'lib/services/campaign/campaign_service.dart',
  ).readAsStringSync();
  final submissionService = File(
    'lib/services/campaign/completion_submission_service.dart',
  ).readAsStringSync();
  final exactJob = File(
    'lib/screens/scaler/campaigns/exact_location_job_screen.dart',
  ).readAsStringSync();
  final review = File(
    'lib/screens/business/completion/completion_review_screen.dart',
  ).readAsStringSync();
  final applicants = File(
    'lib/screens/campaigns/campaign_applicants_screen.dart',
  ).readAsStringSync();
  final legacyService = File('lib/services/campaign_service.dart').readAsStringSync();

  test('location setup and assignment use maintained callable authority', () {
    expect(campaignService, contains("functionName: 'createCampaignLocation'"));
    expect(campaignService, contains("functionName: 'deleteCampaignLocation'"));
    expect(applicants, contains("functionName: 'assignScalerToCampaignLocations'"));
    expect(applicants, contains("functionName: 'rejectCampaignApplication'"));
    expect(applicants, isNot(contains('transaction.update(location.reference')));
  });

  test('completion initialization, evidence, and submission are callable-only', () {
    final sources = '$campaignService\n$submissionService';
    for (final operation in [
      'initializeCampaignCompletion',
      'startCampaignCompletion',
      'appendCampaignCompletionEvidence',
      'submitCampaignCompletion',
    ]) {
      expect(sources, contains(operation));
    }
    expect(
      exactJob,
      isNot(contains("collection('campaignLocations').doc(location.id).update")),
    );
    expect(
      exactJob,
      isNot(contains("collection('campaignCompletions').doc(completionId).update")),
    );
  });

  test('Business review uses one bounded review callable', () {
    expect(campaignService, contains("functionName: 'reviewCampaignCompletion'"));
    expect(campaignService, contains("'decision': 'approve'"));
    expect(campaignService, contains("'decision': 'changes_required'"));
    expect(campaignService, contains("'decision': 'reject'"));
    expect(review, isNot(contains("collection('campaignCompletions')")));
  });

  test('legacy generic mutation helpers fail closed', () {
    expect(campaignService, contains('Completion state is server-authoritative'));
    expect(campaignService, contains('Completion evidence is append-only'));
    expect(campaignService, contains('Campaign locations are immutable after creation'));
    expect(legacyService, contains('Choose a zone or exact locations'));
    expect(
      legacyService,
      contains('Completion must be submitted and reviewed through the Job Room'),
    );
  });
}
