// Snapshot test doubles only; no Firestore SDK implementation is shipped.
// ignore_for_file: subtype_of_sealed_class
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/notification_destination.dart';
import 'package:flutter_app/screens/notifications/notifications_screen.dart';

class _Document implements QueryDocumentSnapshot {
  _Document(this.value);
  final Map<String, dynamic> value;
  @override
  Map<String, dynamic> data() => value;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Snapshot implements QuerySnapshot {
  _Snapshot(this.docs);
  @override
  final List<QueryDocumentSnapshot> docs;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test(
    'verified work opens Earnings without requiring campaign/private logistics reads',
    () {
      for (final type in [
        'worker_earning_established',
        'payout_approved',
        'earnings_available',
      ]) {
        final target = notificationDestination({'type': type});
        expect(target?.kind, 'earnings');
        expect(target?.label, 'View Earnings');
      }
    },
  );
  test(
    'submitted/canceled work and assignments have maintained details destinations',
    () {
      for (final type in [
        'completion_submitted',
        'zone_completion_submitted',
        'campaign_canceled',
        'campaign_cancelled',
      ]) {
        expect(
          notificationDestination({
            'type': type,
            'zoneId': 'zone',
            'campaignId': 'campaign',
          })?.route,
          '/job-room/zone',
        );
        expect(
          notificationDestination({
            'type': type,
            'campaignId': 'campaign',
          })?.route,
          '/campaign/campaign',
        );
      }
    },
  );
  test('unknown or incomplete destinations remain informational', () {
    for (final data in [
      {},
      {'type': 'unknown', 'campaignId': 'campaign'},
      {'type': 'job_assignment'},
      {
        'deepLink': {'destination': 'job_room'},
      },
      {'type': 'job_assignment', 'zoneId': 'bad/path'},
    ]) {
      expect(notificationDestination(Map<String, dynamic>.from(data)), isNull);
    }
  });
  testWidgets('phone notifications show no fake action and handle long titles', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationsScreen(
          currentUserId: 'self',
          notificationsStream: Stream.value(
            _Snapshot([
              _Document({
                'title': 'Work verified — earnings available',
                'type': 'worker_earning_established',
                'read': true,
              }),
              _Document({
                'title':
                    'An informational message with a longer title that should wrap on a small screen',
                'type': 'information',
                'read': true,
              }),
            ]),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('View Earnings'), findsOneWidget);
    expect(find.text('View'), findsNothing);
    expect(find.byIcon(Icons.arrow_forward), findsOneWidget);
    final informational = find.ancestor(
      of: find.textContaining('An informational message'),
      matching: find.byType(InkWell),
    );
    expect(tester.widget<InkWell>(informational).onTap, isNull);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('View Earnings'));
    await tester.pumpAndSettle();
    expect(find.text('Earnings'), findsOneWidget);
    expect(find.text('Notifications'), findsNothing);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('View Earnings'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
