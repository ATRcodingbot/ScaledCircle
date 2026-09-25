/// Presentation of the maintained funding callable. Payment confirmation is
/// deliberately separate from assignment and work-start authority.
class CampaignFundingPresentation {
  const CampaignFundingPresentation(
    this.title,
    this.detail,
    this.obligations, {
    this.readyToBegin = false,
  });

  final String title;
  final String detail;
  final List<String> obligations;

  final bool readyToBegin;

  factory CampaignFundingPresentation.fromServer(
    Map<String, dynamic> state, {
    String? campaignId,
    int? nowMs,
  }) {
    final allocation = state['allocation'];
    final amounts = allocation is Map ? allocation : const <String, dynamic>{};
    int cents(String key) {
      final value = amounts[key];
      return value is int && value >= 0 ? value : 0;
    }

    String money(int value) => '\$${(value / 100).toStringAsFixed(2)}';
    final reserved = cents('workerReserveCents');
    final earned = cents('workerEarnedCents');
    final paid = cents('workerPaidCents');
    final obligations = <String>[
      if (reserved > 0) '${money(reserved)} compensation reserved',
      if (earned > 0) '${money(earned)} compensation earned',
      if (earned > paid) '${money(earned - paid)} worker payment pending',
      if (paid > 0) '${money(paid)} worker compensation paid',
    ];
    final eligibility = state['eligibility'];
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    if (eligibility is Map) {
      final checked = eligibility['checkedAtMs'];
      final expires = eligibility['expiresAtMs'];
      if (eligibility['version'] != 1 ||
          campaignId == null ||
          eligibility['campaignId'] != campaignId ||
          checked is! int ||
          expires is! int ||
          checked > now + 5000 ||
          expires <= now ||
          expires - checked > 15000 ||
          now - checked > 15000) {
        return CampaignFundingPresentation(
          'Campaign status requires verification',
          'The server response is stale or unavailable. Refresh before continuing.',
          obligations,
        );
      }
      const titles = <String, String>{
        'payment_required': 'Payment required',
        'payment_processing': 'Payment processing',
        'funding_confirmed': 'Funding confirmed',
        'awaiting_scaler': 'Awaiting Scaler',
        'assignment_pending': 'Assignment pending / awaiting acceptance',
        'ready': 'Ready to begin',
        'funding_issue': 'Funding issue — action required',
        'in_progress': 'Work in progress',
        'submitted': 'Submitted / awaiting review',
        'worker_payment_pending': 'Worker payment obligation pending',
        'completed': 'Completed',
        'blocked': 'Work start blocked',
        'unsupported': 'Campaign type unavailable',
        'refunded': 'Payment refunded',
      };
      const reasons = <String, String>{
        'consent_required':
            'Current agreements must be accepted before work begins.',
        'funds_pending': 'Campaign funds are still processing.',
        'funds_verification_required':
            'Campaign funds must be verified before work begins.',
        'compensation_reserve_required':
            'Worker compensation must be secured before work begins.',
        'materials_required':
            'Material receipt must be confirmed before work begins.',
        'outside_work_window':
            'Work can begin only during the permitted work hours.',
        'deadline_passed': 'The campaign deadline has passed.',
        'assignment_acceptance_required':
            'The Scaler must accept the current assignment terms.',
        'unsupported_campaign_type':
            'This campaign type is not available for paid execution.',
        'campaign_requirements_not_met':
            'Review the campaign requirements before payment.',
      };
      final code = eligibility['state'];
      final zones = eligibility['zones'];
      final readyCount = eligibility['readyZoneCount'];
      final ready =
          code == 'ready' &&
          readyCount is int &&
          readyCount > 0 &&
          zones is List &&
          zones.where((z) => z is Map && z['state'] == 'ready').length ==
              readyCount;
      final blockedReasons = zones is List
          ? zones.whereType<Map>().map((z) => z['reason']).whereType<String>()
          : <String>[];
      final reason = eligibility['reason'] ?? blockedReasons.firstOrNull;
      final title = code == 'ready' && !ready
          ? 'Campaign status requires verification'
          : titles[code];
      return CampaignFundingPresentation(
        title ?? 'Campaign status requires verification',
        ready
            ? '$readyCount assignment(s) currently pass the server checks. Work start rechecks eligibility.'
            : reasons[reason] ??
                  (code == 'funding_issue' || code == 'refunded'
                      ? 'New work is blocked. Earned compensation remains owed.'
                      : 'This is the current server status. Funding alone does not authorize work to begin.'),
        obligations,
        readyToBegin: ready,
      );
    }
    final status = state['status'];
    final fundingIssue =
        const {
          'disputed',
          'refund_pending',
          'refund_review_required',
          'payment_failed',
        }.contains(status) ||
        const {'disputed', 'shortfall'}.contains(amounts['fundingState']);
    if (fundingIssue) {
      return CampaignFundingPresentation(
        'Funding issue — action required',
        'Work eligibility must be checked again. Earned compensation remains owed.',
        obligations,
      );
    }
    if (status == 'paid') {
      return CampaignFundingPresentation(
        earned > paid
            ? 'Worker payment obligation pending'
            : 'Funding confirmed',
        amounts['fundingState'] == 'held'
            ? 'Funding verification is pending. This does not authorize work to begin.'
            : 'Payment is confirmed. Assignment, acceptance and work-start requirements still apply.',
        obligations,
      );
    }
    if (status == 'payment_pending') {
      return CampaignFundingPresentation(
        'Payment processing',
        'Work cannot begin while payment is processing.',
        obligations,
      );
    }
    if (status == 'refunded') {
      return CampaignFundingPresentation(
        'Payment refunded',
        'This payment cannot fund new work. Any earned compensation remains owed.',
        obligations,
      );
    }
    if (const {'', 'unfunded', 'checkout_expired'}.contains(status)) {
      return CampaignFundingPresentation(
        'Payment required',
        'Review campaign requirements and the current quote before payment. Eligibility is checked by the server.',
        obligations,
      );
    }
    return CampaignFundingPresentation(
      'Campaign status requires verification',
      'Work readiness is unavailable. Refresh the status before continuing.',
      obligations,
    );
  }
}
