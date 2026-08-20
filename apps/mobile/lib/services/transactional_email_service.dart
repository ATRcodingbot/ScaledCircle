import 'package:cloud_functions/cloud_functions.dart';

class TransactionalEmailService {
  TransactionalEmailService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  Future<void> finalizePublicSignup({
    required String role,
    required String displayName,
    required String postalCode,
    required String discoverySource,
    String contactNumber = '',
    String companyName = '',
    String referrerName = '',
  }) async {
    await _functions.httpsCallable('finalizePublicAccountSignup').call({
      'role': role,
      'displayName': displayName.trim(),
      'postalCode': postalCode.trim(),
      'contactNumber': contactNumber.trim(),
      'companyName': companyName.trim(),
      'discoverySource': discoverySource.trim(),
      'referrerName': referrerName.trim(),
    });
  }

  Future<void> resendVerification() async {
    await _functions.httpsCallable('resendEmailVerification').call();
  }
}
