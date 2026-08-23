import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_routes.dart';
import 'package:flutter_app/navigation/protected_route_gate.dart';

void main() {
  group('authenticated route policy', () {
    test('maps approved roles to stable dashboard URLs', () {
      expect(
        dashboardRouteForProfile(const {'role': 'admin'}),
        AppRoutes.adminDashboard,
      );
      expect(
        dashboardRouteForProfile(const {
          'role': 'business',
          'accountType': 'business',
        }),
        AppRoutes.businessDashboard,
      );
      expect(
        dashboardRouteForProfile(const {
          'role': 'scaler',
          'accountType': 'scaler',
        }),
        AppRoutes.scalerDashboard,
      );
    });

    test('enforces role and beta authorization before rendering', () {
      const business = {
        'role': 'business',
        'accountType': 'business',
        'active': true,
      };
      const scaler = {
        'role': 'scaler',
        'accountType': 'scaler',
        'betaAccess': 'approved',
      };
      const pending = {'role': 'scaler', 'accountType': 'scaler'};
      expect(
        profileAllowsAudience(business, ProtectedRouteAudience.business),
        isTrue,
      );
      expect(
        profileAllowsAudience(business, ProtectedRouteAudience.scaler),
        isFalse,
      );
      expect(
        profileAllowsAudience(scaler, ProtectedRouteAudience.business),
        isFalse,
      );
      expect(
        profileAllowsAudience(scaler, ProtectedRouteAudience.scaler),
        isTrue,
      );
      expect(
        profileAllowsAudience(pending, ProtectedRouteAudience.scaler),
        isFalse,
      );
    });

    test('builds stable campaign and Job Room URLs', () {
      expect(AppRoutes.campaignDetail('campaign 1'), '/campaign/campaign%201');
      expect(AppRoutes.jobRoom('zone/1'), '/job-room/zone%2F1');
    });

    test(
      'maintained protected workflows use reconstructible route identities',
      () {
        final main = File('lib/main.dart').readAsStringSync();
        final login = File(
          'lib/screens/auth/login_screen.dart',
        ).readAsStringSync();
        final paymentReturn = File(
          'lib/screens/campaigns/campaign_funding_return_screen.dart',
        ).readAsStringSync();
        expect(main, contains("segments.first == 'campaign'"));
        expect(main, contains("segments.first == 'job-room'"));
        expect(main, contains('UnknownRouteGate'));
        expect(main, contains('settings: settings'));
        expect(login, contains('AppNavigation.replace'));
        expect(login, isNot(contains('child: const BusinessDashboard()')));
        expect(login, isNot(contains('child: const ScalerDashboardScreen()')));
        expect(
          paymentReturn,
          contains('AppRoutes.campaignDetail(widget.campaignId)'),
        );
      },
    );
  });
}
