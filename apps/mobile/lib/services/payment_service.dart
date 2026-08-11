class PaymentService {
  static double calculatePayment({
    required double completionPercentage,
    required double basePay,
    required double bonusPay,
  }) {
    // Less than 10% = no payment.
    if (completionPercentage < 10) {
      return 0;
    }

    // 95%+ completion = full pay + required bonus.
    if (completionPercentage >= 95) {
      return basePay + bonusPay;
    }

    // Partial completion = percentage of base pay
    return basePay * (completionPercentage / 100);
  }

  static String getCompletionStatus(double percentage) {
    if (percentage < 10) {
      return "redo_required";
    }

    if (percentage >= 95) {
      return "completed";
    }

    return "partial_completion";
  }
}
