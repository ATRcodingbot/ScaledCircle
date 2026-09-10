import 'package:cloud_functions/cloud_functions.dart';

abstract interface class ReferralFinancialGateway {
  Future<Map<String, dynamic>> dashboard();
  Future<String> setup();
  Future<void> cashOut(String requestId, int amountCents);
  Future<void> reconcile(String operationId, {bool retry = false});
}

class ReferralFinancialService implements ReferralFinancialGateway {
  final _functions = FirebaseFunctions.instanceFor(region: 'us-east1');
  @override
  Future<Map<String, dynamic>> dashboard() async => Map<String, dynamic>.from(
    (await _functions.httpsCallable('getReferralFinancialsV1').call()).data
        as Map,
  );
  @override
  Future<String> setup() async =>
      (await _functions.httpsCallable('setupReferralPayoutsV1').call())
              .data['url']
          as String;
  @override
  Future<void> cashOut(String requestId, int amountCents) async {
    await _functions.httpsCallable('cashOutReferralEarningsV1').call({
      'requestId': requestId,
      'amountCents': amountCents,
    });
  }

  @override
  Future<void> reconcile(String operationId, {bool retry = false}) async {
    await _functions.httpsCallable('reconcileReferralPayoutV1').call({
      'operationId': operationId,
      'retry': retry,
    });
  }
}
