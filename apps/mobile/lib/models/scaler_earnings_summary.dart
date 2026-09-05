import 'package:cloud_firestore/cloud_firestore.dart';

/// Read-only campaign projection. No live withdrawable-balance authority is
/// currently exposed. TEST aggregation is display-only and never authorizes cash-out.
class ScalerEarningsSummary {
  static const double withdrawableBalance = 0;

  static double displayAvailable(
    Map<String, dynamic> wallet, {
    required bool testEnvironment,
  }) {
    if (!testEnvironment) return withdrawableBalance;
    double nonnegative(dynamic value) =>
        value is num && value.isFinite && value >= 0 ? value.toDouble() : 0;
    final campaignAvailable = nonnegative(wallet['availableBalance']);
    final testFixtureAvailable = wallet['cashoutMode'] == 'test'
        ? nonnegative(wallet['cashoutAvailableCents']) / 100
        : 0.0;
    return ((campaignAvailable * 100).round() +
            (testFixtureAvailable * 100).round()) /
        100;
  }

  static double recordedThisMonth(
    Iterable<Map<String, dynamic>> records,
    DateTime now, {
    bool testEnvironment = false,
  }) {
    final utc = now.toUtc();
    final start = DateTime.utc(utc.year, utc.month);
    final end = DateTime.utc(utc.year, utc.month + 1);
    var cents = 0;
    for (final record in records) {
      if (record['type'] != 'scaler_earnings' ||
          (!testEnvironment && record['mode'] == 'test') ||
          (record['walletSide'] != null && record['walletSide'] != 'scaler') ||
          (record['currency'] != null && record['currency'] != 'usd')) {
        continue;
      }
      final timestamp = record['createdAt'];
      if (timestamp is! Timestamp) continue;
      final date = timestamp.toDate().toUtc();
      if (date.isBefore(start) || !date.isBefore(end)) continue;
      final minor = record['amountCents'];
      final dollars = record['amount'];
      if (minor is int && minor >= 0) {
        cents += minor;
      } else if (minor == null &&
          dollars is num &&
          dollars.isFinite &&
          dollars >= 0) {
        cents += (dollars * 100).round();
      }
    }
    return cents / 100;
  }
}
