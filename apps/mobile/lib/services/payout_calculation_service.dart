class PayoutCalculationService {
  static const double minimumPayableCompletionPercentage = 10.0;
  static const double automaticBonusCompletionPercentage = 95.0;

  Map<String, dynamic> calculatePayout({
    required double completionPercentage,
    required double basePay,
    required double completionBonus,
  }) {
    final safeCompletion = completionPercentage.clamp(0.0, 100.0);

    final safeBasePay = basePay < 0.0 ? 0.0 : basePay;

    final safeBonus = completionBonus < 0.0 ? 0.0 : completionBonus;

    /*
     * Less than 10% GPS-confirmed completion:
     * no payment.
     */
    if (safeCompletion < minimumPayableCompletionPercentage) {
      return {
        'completionPercentage': safeCompletion,
        'basePayout': 0.0,
        'bonus': 0.0,
        'totalPayout': 0.0,
        'status': 'redo_required',
      };
    }

    /*
     * 95% or greater GPS-confirmed completion:
     * full base pay + completion bonus.
     */
    if (safeCompletion >= automaticBonusCompletionPercentage) {
      final basePayout = _roundMoney(safeBasePay);

      final bonus = _roundMoney(safeBonus);

      return {
        'completionPercentage': safeCompletion,
        'basePayout': basePayout,
        'bonus': bonus,
        'totalPayout': _roundMoney(basePayout + bonus),
        'status': 'completed_with_bonus',
      };
    }

    /*
     * 10% through 94.99%:
     * proportional base pay.
     *
     * Completion bonus is not earned
     * automatically until GPS completion reaches 95%.
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
