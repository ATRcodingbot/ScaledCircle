import 'package:cloud_functions/cloud_functions.dart';

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
      throw Exception(error.message ?? 'The secure service request failed.');
    }
  }
}
