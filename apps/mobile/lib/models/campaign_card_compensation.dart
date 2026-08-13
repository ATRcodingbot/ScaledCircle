class CampaignCardCompensation {
  const CampaignCardCompensation({
    required this.primaryText,
    this.secondaryText,
    required this.isGroupCampaign,
  });

  final String primaryText;
  final String? secondaryText;
  final bool isGroupCampaign;

  factory CampaignCardCompensation.fromCampaign(Map<String, dynamic> data) {
    final scalerCount =
        (data['requiredScalerCount'] as num?)?.round() ??
        (data['requestedScalerCount'] as num?)?.round() ??
        1;
    final workerPoolCents = (data['workerPoolCents'] as num?)?.round() ?? 0;
    if (scalerCount > 1 && workerPoolCents > 0) {
      final storedShare = (data['scheduledShareCents'] as num?)?.round() ?? 0;
      final share = storedShare > 0 ? storedShare : workerPoolCents ~/ scalerCount;
      return CampaignCardCompensation(
        primaryText: '${_dollars(workerPoolCents)} group worker pay \u2022 $scalerCount Scalers',
        secondaryText: '${_dollars(share)} scheduled share per Scaler',
        isGroupCampaign: true,
      );
    }
    final homes =
        (data['estimatedHomes'] as num?)?.round() ??
        (data['homes'] as num?)?.round() ??
        0;
    final basePay = (data['basePay'] as num?)?.toDouble() ?? 0;
    final bonus = (data['bonus'] as num?)?.toDouble() ?? 0;
    return CampaignCardCompensation(
      primaryText: '$homes homes \u2022 \$${basePay.toStringAsFixed(2)} base pay'
          '${bonus > 0 ? ' \u2022 \$${bonus.toStringAsFixed(2)} bonus' : ''}',
      isGroupCampaign: false,
    );
  }

  static String _dollars(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';
}
