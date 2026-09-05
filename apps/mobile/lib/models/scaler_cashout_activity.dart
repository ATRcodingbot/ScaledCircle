/// Display-only projection of the maintained TEST cash-out transaction status.
/// Campaign earnings and legacy withdrawals retain their existing descriptions.
String? scalerCashoutActivityLabel(Map<String, dynamic> data) {
  if (data['mode'] != 'test' || data['type'] != 'withdrawal') return null;
  return switch (data['status']) {
    'completed' => 'Cash out — Paid',
    'failed' => 'Cash out — Failed, funds returned',
    'pending' => 'Cash out — Processing',
    _ => 'Cash out — Awaiting confirmation',
  };
}
