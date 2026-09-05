import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/scaler_earnings_summary.dart';

void main() {
  Map<String, dynamic> earning(DateTime date, {int cents = 500}) => {
    'type': 'scaler_earnings',
    'walletSide': 'scaler',
    'amountCents': cents,
    'currency': 'usd',
    'createdAt': Timestamp.fromDate(date),
  };
  test(
    'Balance cannot use campaign earnings or TEST fixture funds without live eligibility',
    () {
      expect(ScalerEarningsSummary.withdrawableBalance, 0);
    },
  );
  test(
    'month uses inclusive UTC start and exclusive UTC next-month boundary',
    () {
      final records = [
        earning(DateTime.utc(2026, 8, 31, 23, 59, 59)),
        earning(DateTime.utc(2026, 9, 1)),
        earning(DateTime.utc(2026, 9, 30, 23, 59, 59)),
        earning(DateTime.utc(2026, 10, 1)),
      ];
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          records,
          DateTime.utc(2026, 9, 15),
        ),
        10,
      );
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          records,
          DateTime.parse('2026-08-31T20:00:00-04:00'),
        ),
        10,
      );
    },
  );
  test(
    'only timestamped campaign earnings count; exclude fixture, payout and business records',
    () {
      final valid = earning(DateTime.utc(2026, 9, 5));
      final records = [
        valid,
        {...valid, 'mode': 'test'},
        {...valid, 'type': 'payout'},
        {...valid, 'walletSide': 'business'},
        {...valid, 'createdAt': null},
        {...valid, 'createdAt': '2026-09-05'},
        {...valid, 'currency': 'eur'},
      ];
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          records,
          DateTime.utc(2026, 9, 5),
        ),
        5,
      );
    },
  );
  test(
    'server cents win over legacy dollars; legacy earning records remain supported',
    () {
      final records = [
        earning(DateTime.utc(2026, 12, 5), cents: 123),
        {
          'type': 'scaler_earnings',
          'amount': 2.34,
          'createdAt': Timestamp.fromDate(DateTime.utc(2026, 12, 6)),
        },
        earning(DateTime.utc(2027, 1, 1)),
      ];
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          records,
          DateTime.utc(2026, 12, 31),
        ),
        3.57,
      );
      expect(
        ScalerEarningsSummary.recordedThisMonth([], DateTime.utc(2026, 12)),
        0,
      );
    },
  );
  test(
    'staging campaign evidence is included only in the test projection, never payout fixtures',
    () {
      final records = [
        {...earning(DateTime.utc(2026, 9, 4), cents: 8851), 'mode': 'test'},
        {
          ...earning(DateTime.utc(2026, 9, 5)),
          'type': 'withdrawal',
          'mode': 'test',
        },
      ];
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          records,
          DateTime.utc(2026, 9, 5),
          testEnvironment: true,
        ),
        88.51,
      );
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          records,
          DateTime.utc(2026, 9, 5),
        ),
        0,
      );
    },
  );
  test(
    'staging Available aggregates display components without changing campaign earnings or records',
    () {
      final wallet = <String, dynamic>{
        'availableBalance': 88.51,
        'cashoutMode': 'test',
        'cashoutAvailableCents': 500,
      };
      final before = Map<String, dynamic>.from(wallet);
      expect(
        ScalerEarningsSummary.displayAvailable(wallet, testEnvironment: true),
        93.51,
      );
      expect(
        ScalerEarningsSummary.displayAvailable(wallet, testEnvironment: false),
        0,
      );
      expect(wallet, before);
      final earnings = [earning(DateTime.utc(2026, 9, 4), cents: 8851)];
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          earnings,
          DateTime.utc(2026, 9, 5),
          testEnvironment: true,
        ),
        88.51,
      );
      final afterTestCashout = {...wallet, 'cashoutAvailableCents': 0};
      expect(
        ScalerEarningsSummary.displayAvailable(
          afterTestCashout,
          testEnvironment: true,
        ),
        88.51,
      );
      expect(
        ScalerEarningsSummary.recordedThisMonth(
          earnings,
          DateTime.utc(2026, 9, 5),
          testEnvironment: true,
        ),
        88.51,
      );
      expect(
        ScalerEarningsSummary.displayAvailable({
          ...wallet,
          'cashoutMode': 'live',
        }, testEnvironment: true),
        88.51,
      );
    },
  );
}
