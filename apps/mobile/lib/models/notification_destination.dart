import '../navigation/app_routes.dart';

class NotificationDestination {
  const NotificationDestination(
    this.kind,
    this.label, {
    this.route,
    this.campaignId,
  });
  final String kind;
  final String label;
  final String? route;
  final String? campaignId;
}

/// An actionable label exists only when the same resolver has a destination.
NotificationDestination? notificationDestination(Map<String, dynamic> data) {
  String? id(dynamic value) =>
      value is String && value.trim().isNotEmpty && !value.contains('/')
      ? value.trim()
      : null;
  final type = data['type'];
  final link = data['deepLink'] is Map ? data['deepLink'] as Map : const {};
  final destination = link['destination'];
  if (destination == 'growth_agents') {
    final prospect = id(link['prospectId']);
    final report = id(link['reportId']);
    return NotificationDestination(
      'route',
      'Review Agent Activity',
      route:
          '/growth-agents${prospect != null
              ? '?prospect=${Uri.encodeQueryComponent(prospect)}'
              : report != null
              ? '?report=${Uri.encodeQueryComponent(report)}'
              : ''}',
    );
  }
  if (destination == 'referrals' ||
      const {
        'referral_signed_up',
        'referral_reward_earned',
        'referral_earned',
        'referral_available',
        'referral_paid',
        'referral_adjusted',
      }.contains(type)) {
    return const NotificationDestination(
      'route',
      'View Referrals',
      route: '/referral-portal',
    );
  }
  if ([
        'worker_earning_established',
        'payout_approved',
        'earnings_available',
      ].contains(type) ||
      ['earnings', 'wallet'].contains(destination)) {
    return const NotificationDestination('earnings', 'View Earnings');
  }
  if (destination == 'landing_page') {
    final pageId = id(link['pageId']);
    return NotificationDestination(
      'route',
      'View Inquiry',
      route:
          '${AppRoutes.businessLandingPages}${pageId == null ? '' : '?pageId=${Uri.encodeQueryComponent(pageId)}'}',
    );
  }
  if (destination == 'brand_assets') {
    return const NotificationDestination(
      'route',
      'View Brand Assets',
      route: AppRoutes.businessBrandAssets,
    );
  }
  if (type == 'weather_opportunity') {
    return const NotificationDestination('weather', 'View Weather');
  }
  final zoneId = id(link['zoneId']) ?? id(data['zoneId']);
  final campaignId = id(data['campaignId']);
  final roomTypes = {
    'job_assignment',
    'job_room_message',
    'material_logistics_locked',
    'material_change_proposed',
    'material_change_accept',
    'material_change_decline',
    'material_change_confirmed',
    'job_readiness_acknowledged',
    'material_received',
    'material_issue_reported',
    'group_assignment_progress',
    'application_accepted',
    'zone_completion_submitted',
    'completion_submitted',
    'campaign_completed',
    'campaign_canceled',
    'campaign_cancelled',
  };
  if (zoneId != null &&
      (roomTypes.contains(type) ||
          {'job_room', 'material_change_review'}.contains(destination))) {
    return NotificationDestination(
      'route',
      type == 'material_change_proposed'
          ? 'Review Change'
          : ['zone_completion_submitted', 'completion_submitted'].contains(type)
          ? 'Review Work'
          : 'Open Job Room',
      route: AppRoutes.jobRoom(zoneId),
    );
  }
  if (type == 'application_received' && campaignId != null) {
    return NotificationDestination(
      'applicants',
      'View Application',
      campaignId: campaignId,
    );
  }
  if (campaignId != null &&
      {
        'application_accepted',
        'application_rejected',
        'changes_requested',
        'campaign_completed',
        'campaign_canceled',
        'campaign_cancelled',
        'zone_completion_submitted',
        'completion_submitted',
      }.contains(type)) {
    return NotificationDestination(
      'route',
      'View Details',
      route: AppRoutes.campaignDetail(campaignId),
    );
  }
  return null;
}
