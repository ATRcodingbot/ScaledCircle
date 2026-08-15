import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

String source(String relativePath) => File(relativePath).readAsStringSync();

void main() {
  test('dedicated Admin routes exist without Sales routes', () {
    final routes = source('lib/navigation/app_routes.dart');
    final main = source('lib/main.dart');
    expect(routes, contains("adminLogin = '/admin/login'"));
    expect(routes, contains("adminDashboard = '/admin'"));
    expect(routes, isNot(contains('/sales')));
    expect(main, contains('AdminLoginScreen'));
    expect(main, contains('AdminDashboardScreen'));
    expect(main, isNot(contains('SalesLoginScreen')));
  });

  test(
    'Admin Login verifies authoritative profile role and records readiness',
    () {
      final login = source('lib/screens/admin/admin_login_screen.dart');
      expect(login, contains("collection('users')"));
      expect(login, contains("['role']?.toString().toLowerCase() != 'admin'"));
      expect(login, contains("functionName: 'confirmAdminLoginReadiness'"));
      expect(login, contains('FirebaseAuth.instance.signOut()'));
    },
  );

  test('Admin Dashboard exposes only Admin and QA release operations', () {
    final dashboard = source('lib/screens/admin/admin_dashboard_screen.dart');
    expect(dashboard, contains('Administrator Accounts'));
    expect(dashboard, contains('Beta Entitlements'));
    expect(dashboard, contains('Platform Issues / Action Required'));
    expect(dashboard, contains('Sales Program — Private Development'));
    expect(dashboard, isNot(contains('AdminSalesScreen')));
    expect(dashboard, isNot(contains('Commission / payout ledger')));
  });

  test(
    'Internal QA UI keeps comped software separate from variable execution',
    () {
      final beta = source(
        'lib/screens/business/internal_beta_entitlements_screen.dart',
      );
      expect(beta, contains("value: 'internal_qa'"));
      expect(beta, contains(r'$999/month list price'));
      expect(beta, contains('Worker pay, ads, printing, postage, fulfillment'));
      expect(beta, contains("'source': _source"));
    },
  );

  test('public Managed Growth checkout remains disabled', () {
    final subscriptions = source(
      'lib/screens/business/subscription_screen.dart',
    );
    expect(subscriptions, contains("plan: 'managed_growth'"));
    expect(subscriptions, contains('availableForPurchase: false'));
  });
}
