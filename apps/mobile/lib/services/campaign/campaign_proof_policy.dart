class CampaignProofPolicy {
  const CampaignProofPolicy._();

  static const Set<String> _marketingCampaigns = {
    'flyerdistribution',
    'doorhangerdistribution',
    'businesscarddistribution',
    'neighborhoodcanvassing',
    'eventmarketing',
  };

  static const Set<String> _photoCampaigns = {
    'yardsigninstallation',
    'yardcleanup',
    'dumprun',
    'junkremoval',
  };

  static bool isMarketing(String? campaignType) {
    return _marketingCampaigns.contains(_normalize(campaignType));
  }

  static bool requiresPhotos(String? campaignType) {
    return _photoCampaigns.contains(_normalize(campaignType));
  }

  static String proofRequirement(String? campaignType) {
    return requiresPhotos(campaignType) ? 'gps_and_photos' : 'gps_route';
  }

  static String _normalize(String? value) {
    return (value ?? '').toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
  }
}
