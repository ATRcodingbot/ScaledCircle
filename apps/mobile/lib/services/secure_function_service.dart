import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

class SecureFunctionService {
  const SecureFunctionService();

  Future<Map<String, dynamic>> call({
    required String functionName,
    required Map<String, dynamic> data,
  }) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      throw Exception('You must be logged in.');
    }

    final idToken = await user.getIdToken();

    if (idToken == null || idToken.isEmpty) {
      throw Exception('Unable to authenticate the request.');
    }

    final endpoint = Uri.parse(
      'https://us-east1-scaled-circle.cloudfunctions.net/$functionName',
    );

    try {
      final response = await http.post(
        endpoint,
        headers: {
          'Authorization': 'Bearer $idToken',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'data': data}),
      );
      final responseBody = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body) as Map<String, dynamic>;
      final callableError = responseBody['error'];

      if (response.statusCode < 200 ||
          response.statusCode >= 300 ||
          callableError != null) {
        final message = callableError is Map
            ? callableError['message']?.toString()
            : null;

        throw Exception(message ?? 'The secure service request failed.');
      }

      final result = responseBody['result'] ?? responseBody['data'];

      return result is Map
          ? Map<String, dynamic>.from(result)
          : <String, dynamic>{};
    } on FormatException {
      throw Exception('The secure service returned an invalid response.');
    } on http.ClientException catch (error) {
      throw Exception('Unable to reach the secure service: $error');
    }
  }
}
