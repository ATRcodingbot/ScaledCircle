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

  test('Admin Dashboard exposes the minimum operations command center', () {
    final dashboard = source('lib/screens/admin/admin_dashboard_screen.dart');
    expect(dashboard, contains('ScaledCircle Command Center'));
    expect(dashboard, contains('Needs attention'));
    expect(dashboard, contains('Operational overview'));
    expect(dashboard, contains('Recent activity'));
    expect(dashboard, contains('System health'));
    expect(dashboard, contains('Administrator accounts'));
    expect(dashboard, contains('Beta entitlements'));
    expect(dashboard, isNot(contains("title: 'Sales Program'")));
    expect(dashboard, isNot(contains('AdminSalesScreen')));
    expect(dashboard, isNot(contains('Commission / payout ledger')));
  });

  test('Admin Dashboard cards have explicit actions or disabled semantics', () {
    final dashboard = source('lib/screens/admin/admin_dashboard_screen.dart');
    final cards = source('lib/screens/admin/admin_dashboard_card.dart');
    expect(dashboard, contains('AdminOperationsService'));
    expect(dashboard, contains('AdminCampaignTimelineScreen'));
    expect(dashboard, contains('updateSupportStatus'));
    expect(dashboard, contains('AdminRoleManagementScreen'));
    expect(dashboard, contains('InternalBetaEntitlementsScreen'));
    expect(dashboard, contains('AdminSubscriptionOverviewScreen'));
    expect(dashboard, contains('AdminPlatformHealthScreen'));
    expect(cards, contains('SystemMouseCursors.click'));
    expect(cards, contains('canRequestFocus: true'));
    expect(cards, contains('enabled: _interactive'));
    expect(cards, contains('Icons.lock_outline'));
  });

  test('Admin destinations independently enforce authoritative role', () {
    final gate = source('lib/screens/admin/admin_role_gate.dart');
    final subscriptions = source(
      'lib/screens/admin/admin_subscription_overview_screen.dart',
    );
    final health = source(
      'lib/screens/admin/admin_platform_health_screen.dart',
    );
    expect(gate, contains("collection('users')"));
    expect(gate, contains("['role'] != 'admin'"));
    expect(subscriptions, contains('AdminRoleGate'));
    expect(health, contains('AdminRoleGate'));
  });

  test('Admin summaries are truthful and require no provider request', () {
    final subscriptions = source(
      'lib/screens/admin/admin_subscription_overview_screen.dart',
    );
    final health = source(
      'lib/screens/admin/admin_platform_health_screen.dart',
    );
    expect(subscriptions, contains('Not available'));
    expect(subscriptions, contains('Revenue / MRR'));
    expect(subscriptions, contains('No Stripe or provider request'));
    expect(health, contains('Stripe health telemetry'));
    expect(health, contains('Advertising integrations'));
    expect(health, contains('Direct Mail provider'));
    expect(health, contains('exposes no secret metadata or values'));
    expect(health, isNot(contains('OPENAI_API_KEY')));
    expect(health, isNot(contains('CENSUS_API_KEY')));
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
