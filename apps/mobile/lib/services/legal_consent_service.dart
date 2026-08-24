import 'package:cloud_functions/cloud_functions.dart';

class LegalConsentService {
  LegalConsentService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFunctions _functions;

  Future<List<Map<String, String>>> missingFor(String context) async {
    final result = await _functions.httpsCallable('getLegalConsentStatus').call({
      'context': context,
    });
    final data = Map<String, dynamic>.from(result.data as Map);
    return (data['missing'] as List<dynamic>? ?? const [])
        .map((item) => Map<String, String>.from(item as Map))
        .toList(growable: false);
  }

  Future<bool> hasCurrent(String context) async =>
      (await missingFor(context)).isEmpty;

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

  Future<void> acceptBusinessFundingAgreements() => _accept(
    agreementTypes: const ['terms', 'privacy'],
    source: 'authenticated_legal',
  );

  Future<void> acceptScalerWorkAgreements() => _accept(
    agreementTypes: const ['terms', 'scaler_work'],
    source: 'authenticated_legal',
  );

  Future<void> _accept({required List<String> agreementTypes, required String source}) async {
    await _functions.httpsCallable('recordLegalConsent').call({
      'agreementTypes': agreementTypes,
      'source': source,
    });
  }
}
