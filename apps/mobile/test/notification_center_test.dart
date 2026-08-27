import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

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
    expect(source, contains("where('userId', isEqualTo: user.uid)"));
    expect(source, contains("orderBy('createdAt', descending: true)"));
    expect(source, contains("'No notifications yet.'"));
  });

  test('operational notifications deep-link to the private Job Room', () {
    expect(source, contains("'job_room'"));
    expect(source, contains("'material_change_review'"));
    expect(source, contains('AppRoutes.jobRoom(linkedZoneId)'));
    expect(source, contains("'job_room_message' => 'Open Job Room'"));
    expect(source, contains("'material_change_proposed' => 'Review Change'"));
  });

  test('landing-page inquiry notifications open the owned inquiry surface', () {
    expect(source, contains("destination == 'landing_page'"));
    expect(source, contains('AppRoutes.businessLandingPages'));
    expect(source, contains("deepLink['pageId']"));
    expect(source, isNot(contains(r'Unable to open notification: $e')));
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
