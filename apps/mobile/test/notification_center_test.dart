import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/notification_destination.dart';

void main() {
  final source = File(
    'lib/screens/notifications/notifications_screen.dart',
  ).readAsStringSync();
  final businessDashboard = File(
    'lib/screens/business/business_dashboard.dart',
  ).readAsStringSync();
  final scalerDashboard = File(
    'lib/screens/scaler/dashboard/scaler_dashboard_screen.dart',
  ).readAsStringSync();

  test('notification center is recipient scoped and newest first', () {
    expect(source, contains("where('userId', isEqualTo: userId)"));
    expect(source, contains("orderBy('createdAt', descending: true)"));
    expect(source, contains("'No notifications yet.'"));
  });

  test('operational notifications deep-link to the private Job Room', () {
    for (final type in [
      'job_assignment',
      'job_room_message',
      'material_logistics_locked',
      'material_change_proposed',
    ]) {
      final target = notificationDestination({'type': type, 'zoneId': 'zone'});
      expect(target?.route, '/job-room/zone');
      expect(
        target?.label,
        type == 'material_change_proposed' ? 'Review Change' : 'Open Job Room',
      );
    }
    expect(
      notificationDestination({
        'deepLink': {'destination': 'material_change_review', 'zoneId': 'zone'},
      })?.route,
      '/job-room/zone',
    );
  });

  test('landing-page inquiry notifications open the owned inquiry surface', () {
    expect(
      notificationDestination({
        'deepLink': {'destination': 'landing_page', 'pageId': 'page'},
      })?.route,
      '/business/landing-pages?pageId=page',
    );
    expect(source, isNot(contains(r'Unable to open notification: $e')));
  });

  test('generated visual completion opens Brand Assets', () {
    expect(
      notificationDestination({
        'deepLink': {'destination': 'brand_assets'},
      })?.route,
      '/business/brand-assets',
    );
  });

  test('notification interaction acknowledges only the selected item', () {
    expect(source, contains('await _markAsRead(notification.reference)'));
    expect(source, contains("'read': true"));
    expect(source, contains("where('read', isEqualTo: false)"));
  });

  test('Business and Scaler dashboards expose unread badges', () {
    for (final dashboard in [businessDashboard, scalerDashboard]) {
      expect(dashboard, contains("collection('notifications')"));
      expect(dashboard, contains("where('read', isEqualTo: false)"));
      expect(dashboard, contains('if (unreadCount > 0)'));
      expect(dashboard, contains("unreadCount > 99 ? '99+'"));
    }
  });
}
