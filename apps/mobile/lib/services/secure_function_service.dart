import 'package:cloud_functions/cloud_functions.dart';

class SecureFunctionError implements Exception {
  final String code;
  final String message;
  final String operation;

  const SecureFunctionError({
    required this.code,
    required this.message,
    required this.operation,
  });

  @override
  String toString() => message;
}

class SecureFunctionService {
  const SecureFunctionService();

  Future<Map<String, dynamic>> call({
    required String functionName,
    required Map<String, dynamic> data,
  }) async {
    try {
      final response = await FirebaseFunctions.instanceFor(region: 'us-east1')
          .httpsCallable(functionName)
          .call<Map<String, dynamic>>(data);
      return Map<String, dynamic>.from(response.data);
    } on FirebaseFunctionsException catch (error) {
      throw SecureFunctionError(
        code: error.code,
        message: error.message ?? 'The secure service request failed.',
        operation: functionName,
      );
    }
  }
}
