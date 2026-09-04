import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Social Operations is honest, responsive, and read-only', () {
    final screen = File(
      'lib/screens/business/social_operations_screen.dart',
    ).readAsStringSync();
    expect(screen, contains('Social Operations — Beta'));
    expect(
      screen,
      contains('Connect → Plan → Review → Schedule → Measure → Improve'),
    );
    expect(screen, contains('Read-only connection phase'));
    expect(screen, contains('Connect Facebook & Instagram'));
    expect(screen, contains("return 'Connect \${_providerLabel(provider)}'"));
    expect(screen, contains("return 'Reconnect \${_providerLabel(provider)}'"));
    expect(screen, contains("'reauth_required'"));
    expect(screen, contains("? 'Reconnect X'"));
    expect(screen, contains("? 'Needs attention'"));
    expect(screen, contains('Use this account?'));
    expect(screen, contains("'Continue with \$providerLabel'"));
    expect(screen, contains("webOnlyWindowName: '_self'"));
    expect(screen, contains("'\$providerLabel authorization is ready'"));
    expect(screen, contains('Check & confirm'));
    expect(
      screen,
      contains('Publishing, bulk email delivery, and ad changes remain off'),
    );
    expect(screen, contains('30-Day Email Content'));
    expect(screen, contains('Ads — Read Only'));
    expect(screen, contains('Exact balance unavailable through connected API'));
    expect(screen, contains('constraints.maxWidth >= 820'));
    expect(screen, isNot(contains('OAuth client ID')));
    expect(screen, isNot(contains('client secret')));
    expect(screen, isNot(contains('callback URL')));
    expect(screen, isNot(contains('Secret Manager')));
    expect(screen, contains("_section('Content Health'"));
    expect(screen, contains('Needs Attention'));
    expect(screen, contains('Strong Posts'));
    expect(screen, contains('Scheduled'));
    expect(screen, contains('Past Posts'));
    expect(screen, contains('Review scheduled content'));
    expect(screen, contains('Staging plan alignment verified'));
    expect(screen, contains('Align Plan'));
    expect(screen, contains('Rate past posts'));
    expect(
      screen,
      contains(
        'The server may downgrade connection health after a failed refresh.',
      ),
    );
    expect(screen, contains('NO AUTO-DELETE'));
    expect(
      screen,
      contains('Missing provider evidence stays unavailable—not zero.'),
    );
    expect(screen, contains('First X publish candidate'));
    expect(screen, contains('Founder publish approval required'));
    expect(screen, contains('Review exact post for publishing access'));
    expect(
      screen,
      contains('It only allows the next X account permission step.'),
    );
    expect(
      screen,
      contains('Allow ScaledCircle to publish this approved post'),
    );
    expect(screen, contains('Approve this exact X post?'));
    expect(screen, contains('Use this X account?'));
    expect(screen, contains('No public post has been created.'));
    expect(screen, contains("jobStatus == 'completed'"));
    expect(screen, isNot(contains('tweet.write')));
    expect(screen, isNot(contains('media.write')));
  });

  test(
    'client uses bounded callables and never stores provider credentials',
    () {
      final service = File(
        'lib/services/social_operations_service.dart',
      ).readAsStringSync();
      expect(service, contains('getSocialOperationsWorkspace'));
      expect(service, contains('createSocialContentPlanV1'));
      expect(service, contains('approveSocialContentPlanV1'));
      expect(service, contains('createEmailContentPlanV1'));
      expect(service, contains('beginSocialOAuthConnectionV1'));
      expect(service, contains('confirmSocialOAuthConnectionV1'));
      expect(service, contains('syncSocialReadOnlyPerformanceV1'));
      expect(service, contains('syncXSocialReadOnlyPerformanceV1'));
      expect(service, contains('syncMetaSocialReadOnlyPerformanceV1'));
      expect(service, contains('reviewScheduledSocialContentV1'));
      expect(service, contains('rateHistoricalSocialContentV1'));
      expect(service, contains('ingestScaledCircleLaunchPlanV1'));
      expect(service, contains('prepareFirstXPublishFoundationV1'));
      expect(service, contains('createFirstXPublishVersionV3'));
      expect(service, contains('beginFirstXPublishAuthorizationV1'));
      expect(service, contains('recordFirstXFounderApprovalV1'));
      expect(service, contains('confirmFirstXPublishAuthorizationV1'));
      expect(service, contains('createFirstXPublishApprovalV1'));
      expect(service, contains('executeFirstXPublishV1'));
      expect(service, contains('reconcileFirstXPublishV1'));
      expect(service, contains("'managedAuthorization': false"));
      expect(service, isNot(contains('accessToken')));
      expect(service, isNot(contains('clientSecret')));
      expect(service, isNot(contains('ads_management')));
    },
  );

  test('managed growth exposes the Social operating center', () {
    final screen = File(
      'lib/screens/business/managed_growth_screen.dart',
    ).readAsStringSync();
    expect(screen, contains('SocialOperationsScreen'));
    expect(screen, contains('Connections, 30-day calendar'));
  });
}
