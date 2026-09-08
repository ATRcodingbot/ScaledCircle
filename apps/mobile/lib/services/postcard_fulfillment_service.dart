import 'package:cloud_functions/cloud_functions.dart';

abstract interface class PostcardGateway {
  Future<Map<String, dynamic>> call(String action, Map<String, dynamic> data);
}

class PostcardFulfillmentService implements PostcardGateway {
  PostcardFulfillmentService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');
  final FirebaseFunctions _functions;
  static const endpoints = {
    'workspace': 'getPostcardWorkspaceV1',
    'create': 'createPostcardCampaignV1',
    'requestQuote': 'requestPostcardQuoteV1',
    'confirmQuote': 'confirmPostcardQuoteV1',
    'checkout': 'createPostcardCheckoutV1',
    'reconcile': 'reconcilePostcardPaymentV1',
    'evidence': 'recordPostcardEvidenceV1',
    'advance': 'advancePostcardFulfillmentV1',
    'costs': 'recordPostcardCostsV1',
    'cancel': 'requestPostcardCancellationV1',
    'refund': 'reconcilePostcardRefundV1',
    'artifact': 'downloadPostcardArtifactV1',
  };
  @override
  Future<Map<String, dynamic>> call(
    String action,
    Map<String, dynamic> data,
  ) async => Map<String, dynamic>.from(
    (await _functions.httpsCallable(endpoints[action]!).call(data)).data as Map,
  );
}
