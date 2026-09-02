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
    expect(screen, contains('Connect read only'));
    expect(screen, contains('Continue with Google'));
    expect(screen, contains("webOnlyWindowName: '_self'"));
    expect(screen, contains('YouTube authorization is ready'));
    expect(screen, contains('Check & confirm'));
    expect(
      screen,
      contains('Publishing, bulk email delivery, and ad changes remain off'),
    );
    expect(screen, contains('30-Day Email Content'));
    expect(screen, contains('Ads — Read Only'));
    expect(screen, contains('Exact balance unavailable through connected API'));
    expect(screen, contains('constraints.maxWidth >= 820'));
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
