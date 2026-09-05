import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';

import '../config/app_environment.dart';

abstract class ScalerCashoutService {
  Future<Map<String, dynamic>> status();
  Future<Map<String, dynamic>> setup();
  Future<Map<String, dynamic>> request(String requestId, int amountCents);
  Future<Map<String, dynamic>> reconcile(
    String operationId, {
    bool retry = false,
  });

  static bool get enabled =>
      const bool.fromEnvironment('ENABLE_TEST_CASHOUT') &&
      (AppEnvironmentConfig.isLocal || AppEnvironmentConfig.isStaging);

  static String requestId() {
    final random = Random.secure();
    return List.generate(
      20,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  static int? parseCents(String value) {
    if (!RegExp(r'^\d{1,3}(\.\d{1,2})?$').hasMatch(value.trim())) return null;
    final parts = value.trim().split('.');
    final cents =
        int.parse(parts[0]) * 100 +
        (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
    return cents > 0 && cents <= 10000 ? cents : null;
  }
}

class FirebaseScalerCashoutService implements ScalerCashoutService {
  Future<Map<String, dynamic>> _call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    if (!ScalerCashoutService.enabled || AppEnvironmentConfig.isProduction) {
      throw StateError('Test payouts are unavailable.');
    }
    final functions = FirebaseFunctions.instanceFor(
      region: AppEnvironmentConfig.functionsRegion,
    );
    final result = await functions.httpsCallable(name).call(data);
    final response = Map<String, dynamic>.from(result.data as Map);
    if (response['mode'] != 'test') {
      throw StateError('Payout environment mismatch.');
    }
    return response;
  }

  @override
  Future<Map<String, dynamic>> status() => _call('getScalerCashoutV1');
  @override
  Future<Map<String, dynamic>> setup() => _call('setupScalerPayoutsV1');
  @override
  Future<Map<String, dynamic>> request(String requestId, int amountCents) =>
      _call('requestScalerCashoutV1', {
        'requestId': requestId,
        'amountCents': amountCents,
      });
  @override
  Future<Map<String, dynamic>> reconcile(
    String operationId, {
    bool retry = false,
  }) => _call('reconcileScalerCashoutV1', {
    'operationId': operationId,
    'retry': retry,
  });
}
