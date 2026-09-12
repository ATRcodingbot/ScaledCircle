import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_membership_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';

class ReviewService extends BusinessWorkspaceService {
  ReviewService({this.available = true});
  bool available;
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> input = const {},
  ]) async => {
    'plan': 'growth',
    'planName': 'Growth',
    'price': 299,
    'addons': [],
    'periodEndMs': DateTime(2026, 10, 9).millisecondsSinceEpoch,
    'paidAccess': true,
    'canCancel': true,
    'cancelAtPeriodEnd': false,
    'seatStatus': available ? 'verified' : 'unavailable',
    if (available) ...{
      'seatLimit': 3,
      'seatsUsed': 2,
      'seatsReserved': 1,
      'seatsAvailable': 0,
    },
  };
}

class ComplimentaryReviewService extends ReviewService {
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> input = const {},
  ]) async => {
    ...await super.call(name, input),
    'plan': 'managed_growth',
    'planName': 'Managed Growth',
    'complimentary': true,
    'price': 0,
    'monthlyCents': 0,
    'canCancel': false,
    'canWithdrawCancellation': false,
    'seatLimit': 10,
    'seatsUsed': 1,
    'seatsReserved': 0,
    'seatsAvailable': 9,
    'billingHistoryStatus': 'complimentary',
  };
}

class UnavailableReviewService extends ReviewService {
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> input = const {},
  ]) async => throw Exception('private provider diagnostic');
}

void main() {
  testWidgets(
    'complimentary cancellation deep link returns plan management without a fake cancel',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 1800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessMembershipScreen(
            service: ComplimentaryReviewService(),
            businessId: 'review-business',
            section: 'cancel',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('No recurring charge'), findsOneWidget);
      expect(find.text('Cancel at End of Billing Period'), findsNothing);
      expect(find.text('Cancel Membership'), findsNothing);
      expect(find.text('View Available Plans'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('complimentary access never looks like an expired paid plan', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 1800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessMembershipScreen(
          service: ComplimentaryReviewService(),
          businessId: 'review-business',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('No recurring charge'), findsOneWidget);
    expect(find.text('1 of 10 seats used'), findsOneWidget);
    expect(find.text('Reactivate Membership'), findsNothing);
    expect(find.text('Cancel Membership'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('failed membership read does not invite a duplicate purchase', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessMembershipScreen(
          service: UnavailableReviewService(),
          businessId: 'review-business',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('could not be loaded'), findsOneWidget);
    expect(find.text('Reactivate Membership'), findsNothing);
    expect(find.textContaining('private provider diagnostic'), findsNothing);
  });
  for (final width in [390.0, 1280.0]) {
    testWidgets('verified seat counts render on Billing at $width', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(Size(width, 1800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessMembershipScreen(
            service: ReviewService(),
            businessId: 'review-business',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('2 of 3 seats used'), findsOneWidget);
      expect(find.text('0 seats available · Owner included'), findsOneWidget);
      expect(find.text('1 seat reserved for invitations'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('unknown seats show Retry without hiding cancellation', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(700, 1800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final service = ReviewService(available: false);
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessMembershipScreen(
          service: service,
          businessId: 'review-business',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Seat availability could not be verified.'),
      findsOneWidget,
    );
    expect(find.text('Cancel Membership'), findsOneWidget);
    expect(find.text('0 seats available · Owner included'), findsNothing);
    service.available = true;
    await tester.tap(find.text('Retry Seat Availability'));
    await tester.pumpAndSettle();
    expect(find.text('2 of 3 seats used'), findsOneWidget);
  });
}
