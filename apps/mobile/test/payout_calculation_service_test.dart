import 'package:flutter_app/services/payout_calculation_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final service = PayoutCalculationService();

  Map<String, dynamic> payout(double completion) => service.calculatePayout(
    completionPercentage: completion,
    basePay: 100,
    completionBonus: 25,
  );

  test('completion below 10 percent earns no payment', () {
    expect(payout(9.99)['totalPayout'], 0);
  });

  test('10 percent earns proportional base pay', () {
    final result = payout(10);
    expect(result['basePayout'], 10);
    expect(result['bonus'], 0);
  });

  test('94 percent remains proportional and bonus is optional', () {
    final result = payout(94);
    expect(result['basePayout'], 94);
    expect(result['bonus'], 0);
  });

  test('95 percent earns full base and automatic bonus', () {
    final result = payout(95);
    expect(result['basePayout'], 100);
    expect(result['bonus'], 25);
    expect(result['totalPayout'], 125);
  });

  test('completion is clamped at 100 percent', () {
    final result = payout(120);
    expect(result['completionPercentage'], 100);
    expect(result['totalPayout'], 125);
  });
}
