import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/scaler_cashout_activity.dart';

void main() {
  test(
    'cash-out activity distinguishes returned funds, processing and paid',
    () {
      const expected = {
        'failed': 'Cash out — Failed, funds returned',
        'pending': 'Cash out — Processing',
        'completed': 'Cash out — Paid',
        'needs_attention': 'Cash out — Awaiting confirmation',
        'unknown': 'Cash out — Awaiting confirmation',
      };
      for (final entry in expected.entries) {
        final data = Map<String, dynamic>.unmodifiable({
          'mode': 'test',
          'type': 'withdrawal',
          'status': entry.key,
          'amount': 5,
          'description': 'Cash out',
        });
        expect(scalerCashoutActivityLabel(data), entry.value);
        expect(data['amount'], 5);
        expect(data['description'], 'Cash out');
      }
    },
  );
  test('campaign earnings and unverified legacy withdrawals are unchanged', () {
    expect(
      scalerCashoutActivityLabel({'type': 'withdrawal', 'status': 'failed'}),
      isNull,
    );
    expect(
      scalerCashoutActivityLabel({
        'mode': 'live',
        'type': 'withdrawal',
        'status': 'failed',
      }),
      isNull,
    );
    expect(
      scalerCashoutActivityLabel({
        'mode': 'test',
        'type': 'earning',
        'status': 'completed',
      }),
      isNull,
    );
  });
}
