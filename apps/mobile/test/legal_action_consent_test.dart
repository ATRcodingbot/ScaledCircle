import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  String source(String path) => File(path).readAsStringSync();

  test('consent status and acceptance remain separate server authorities', () {
    final service = source('lib/services/legal_consent_service.dart');
    expect(service, contains("httpsCallable('getLegalConsentStatus')"));
    expect(service, contains("agreementTypes: const ['terms', 'privacy']"));
    expect(service, contains("agreementTypes: const ['terms', 'scaler_work']"));
    expect(service, contains("agreementTypes: const ['location_notice']"));
    expect(service, isNot(contains('marketing')));
  });

  test('contractual action surfaces use the shared concise prompt', () {
    final prompt = source('lib/widgets/legal_consent_prompt.dart');
    expect(prompt, contains('Before funding this campaign'));
    expect(prompt, contains('Before applying for or accepting new work'));
    expect(prompt, contains('while this job is actively tracked'));
    expect(prompt, contains("AppRoutes.terms"));
    expect(prompt, contains("AppRoutes.privacy"));
    expect(prompt, contains("AppRoutes.scalerTerms"));

    for (final file in [
      'lib/screens/campaigns/campaign_details_screen.dart',
      'lib/screens/business/create_campaign_screen.dart',
      'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
    ]) {
      expect(source(file), contains('LegalActionConsent.businessFunding'));
    }
    for (final file in [
      'lib/screens/jobs/job_details_screen.dart',
      'lib/screens/scaler/campaigns/scaler_campaign_details_screen.dart',
    ]) {
      expect(source(file), contains('LegalActionConsent.scalerWork'));
    }
    expect(source('lib/screens/jobs/job_details_screen.dart'),
        contains('LegalActionConsent.locationTracking'));
  });

  test('application client no longer writes an application directly', () {
    final service = source('lib/services/campaign_service.dart');
    final method = service.substring(
      service.indexOf('Future<void> applyToCampaign'),
      service.indexOf('// CAMPAIGN APPLICATIONS'),
    );
    expect(method, contains("httpsCallable('applyToCampaign')"));
    expect(method, isNot(contains('.set(')));
    expect(method, isNot(contains('batch.')));
  });
}
