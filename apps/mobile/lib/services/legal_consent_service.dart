import 'package:cloud_functions/cloud_functions.dart';

class LegalConsentService {
  LegalConsentService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  Future<void> acceptAccountAgreements({required bool scaler}) async {
    await _accept(
      agreementTypes: ['terms', 'privacy', if (scaler) 'scaler_work'],
      source: 'account_creation',
    );
  }

  Future<void> acceptLocationNotice() => _accept(
    agreementTypes: const ['location_notice'],
    source: 'scaler_tracking',
  );

  Future<void> _accept({required List<String> agreementTypes, required String source}) async {
    await _functions.httpsCallable('recordLegalConsent').call({
      'agreementTypes': agreementTypes,
      'source': source,
    });
  }
}
