import 'secure_function_service.dart';

class CampaignTrackingProvision {
  const CampaignTrackingProvision({
    required this.trackingCode,
    required this.trackingUrl,
    required this.qrTrackingUrl,
    required this.phoneTrackingStatus,
    required this.emailTrackingStatus,
    this.landingPageUrl,
  });

  final String trackingCode;
  final String trackingUrl;
  final String qrTrackingUrl;
  final String phoneTrackingStatus;
  final String emailTrackingStatus;
  final String? landingPageUrl;

  factory CampaignTrackingProvision.fromMap(Map<String, dynamic> data) {
    return CampaignTrackingProvision(
      trackingCode: data['trackingCode']?.toString() ?? '',
      trackingUrl: data['trackingUrl']?.toString() ?? '',
      qrTrackingUrl:
          data['qrTrackingUrl']?.toString() ??
          data['trackingUrl']?.toString() ??
          '',
      landingPageUrl: data['landingPageUrl']?.toString(),
      phoneTrackingStatus:
          data['phoneTrackingStatus']?.toString() ?? 'not_requested',
      emailTrackingStatus:
          data['emailTrackingStatus']?.toString() ?? 'not_requested',
    );
  }
}

class CampaignTrackingService {
  const CampaignTrackingService();

  static const SecureFunctionService _secureFunctions =
      SecureFunctionService();

  Future<CampaignTrackingProvision> provision({
    required String campaignId,
    required String destinationType,
    required String destinationUrl,
    required String landingPageHeadline,
    required String landingPageBody,
    required String callToActionLabel,
    required List<String> channels,
    String? forwardingPhoneNumber,
    String? forwardingEmail,
  }) async {
    final result = await _secureFunctions.call(
      functionName: 'provisionCampaignTracking',
      data: {
        'campaignId': campaignId,
        'destinationType': destinationType,
        'destinationUrl': destinationUrl,
        'landingPageHeadline': landingPageHeadline,
        'landingPageBody': landingPageBody,
        'callToActionLabel': callToActionLabel,
        'channels': channels,
        'forwardingPhoneNumber': forwardingPhoneNumber,
        'forwardingEmail': forwardingEmail,
      },
    );

    final provision = CampaignTrackingProvision.fromMap(result);

    if (provision.trackingUrl.isEmpty || provision.trackingCode.isEmpty) {
      throw Exception('Tracking setup did not return a usable campaign link.');
    }

    return provision;
  }
}
