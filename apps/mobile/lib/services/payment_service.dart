class PaymentService {
  static double calculatePayment({
    required double completionPercentage,
    required double basePay,
    required double bonusPay,
  }) {
    // Less than 30% = no automatic payment
    if (completionPercentage < 30) {
      return 0;
    }

    // 100% completion = full pay + bonus
    if (completionPercentage >= 100) {
      return basePay + bonusPay;
    }

    // Partial completion = percentage of base pay
    return basePay * (completionPercentage / 100);
  }

  static String getCompletionStatus(double percentage) {
    if (percentage < 20) {
      return "redo_required";
    }

    if (percentage < 30) {
      return "business_review";
    }

    if (percentage >= 100) {
      return "completed";
    }

    return "partial_completion";
  }
}
