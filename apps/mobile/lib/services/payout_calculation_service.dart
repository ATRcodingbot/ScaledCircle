class PayoutCalculationService {
  Map<String, dynamic> calculatePayout({
    required double completionPercentage,
    required double basePay,
    required double completionBonus,
  }) {
    final safeCompletion = completionPercentage.clamp(0.0, 100.0);

    final safeBasePay = basePay < 0.0 ? 0.0 : basePay;

    final safeBonus = completionBonus < 0.0 ? 0.0 : completionBonus;

    /*
     * Less than 30% GPS-confirmed completion:
     * no payment.
     */
    if (safeCompletion < 30.0) {
      return {
        'completionPercentage': safeCompletion,
        'basePayout': 0.0,
        'bonus': 0.0,
        'totalPayout': 0.0,
        'status': 'redo_required',
      };
    }

    /*
     * 100% GPS-confirmed completion:
     * full base pay + completion bonus.
     */
    if (safeCompletion >= 100.0) {
      final basePayout = _roundMoney(safeBasePay);

      final bonus = _roundMoney(safeBonus);

      return {
        'completionPercentage': 100.0,
        'basePayout': basePayout,
        'bonus': bonus,
        'totalPayout': _roundMoney(basePayout + bonus),
        'status': 'completed_with_bonus',
      };
    }

    /*
     * 30% through 99.99%:
     * proportional base pay.
     *
     * Completion bonus is not earned
     * until GPS completion reaches 100%.
     */
    final basePayout = _roundMoney(safeBasePay * (safeCompletion / 100.0));

    return {
      'completionPercentage': safeCompletion,
      'basePayout': basePayout,
      'bonus': 0.0,
      'totalPayout': basePayout,
      'status': 'partial_completion',
    };
  }

  double _roundMoney(double value) {
    return (value * 100).round() / 100.0;
  }
}
