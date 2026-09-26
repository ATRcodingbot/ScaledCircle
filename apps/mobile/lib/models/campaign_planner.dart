/// Planning presentation consumes server-derived geometry intelligence only.
class CampaignMaterialIntelligence {
  const CampaignMaterialIntelligence(this.data);
  final Map<String, dynamic> data;

  int? get distributionPoints => _count(data['eligibleDistributionPoints']);
  int? get suggestedQuantity =>
      distributionPoints == null ? null : _count(data['suggestedQuantity']);
  int? difference(int quantity) =>
      suggestedQuantity == null ? null : quantity - suggestedQuantity!;
  static int? _count(dynamic value) =>
      value is num && value >= 0 ? value.toInt() : null;
}

DateTime? campaignPlanningDate(dynamic value) {
  if (value is DateTime) return value;
  if (value is num) return DateTime.fromMillisecondsSinceEpoch(value.toInt());
  if (value is String) return DateTime.tryParse(value);
  if (value is Map && (value['_seconds'] ?? value['seconds']) is num) {
    return DateTime.fromMillisecondsSinceEpoch(
      ((value['_seconds'] ?? value['seconds']) as num).toInt() * 1000,
    );
  }
  try {
    return value?.toDate() as DateTime?;
  } catch (_) {
    return null;
  }
}

String campaignPlanningDateLabel(dynamic value) {
  final date = campaignPlanningDate(value)?.toLocal();
  if (date == null) return 'Date unavailable';
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return '${months[date.month - 1]} ${date.day}, ${date.year}';
}

String campaignPlanningTypeLabel(String value) => switch (value) {
  'flyer_distribution' => 'Flyer Distribution',
  'door_hanger_distribution' => 'Door Hanger Distribution',
  'business_card_distribution' => 'Business Card Distribution',
  'neighborhoodCanvassing' => 'Door-to-Door Outreach',
  'yard_sign_installation' => 'Yard Sign Installation',
  _ => value.replaceAll('_', ' '),
};
