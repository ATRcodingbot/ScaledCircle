import '../navigation/app_routes.dart';
import '../navigation/workspace_presentation.dart';

NotificationDestination? workspaceNotificationDestination(
  Map<String, dynamic> data,
  Map<String, dynamic>? workspace,
) {
  final target = notificationDestination(data);
  if (target == null || workspace == null || workspace['isOwner'] == true) {
    return target;
  }
  final access = WorkspacePresentation(workspace);
  if (target.kind == 'route') {
    return access.allowsRoute(target.route!) ? target : null;
  }
  if (target.kind == 'applicants') {
    return access.can('campaigns') ? target : null;
  }
  if (target.kind == 'weather') {
    return access.can('intelligence') ? target : null;
  }
  return null;
}

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
  if (destination == 'business_schedule' ||
      type == 'business_schedule_update' ||
      type == 'business_estimate_reminder') {
    final metadata = data['metadata'] is Map
        ? data['metadata'] as Map
        : const {};
    final query = <String, String>{
      if (id(link['businessId'] ?? metadata['businessId'])
          case final String value)
        'workspace': value,
      if (id(link['itemId'] ?? metadata['itemId']) case final String value)
        'item': value,
      if (link['startMs'] is num) 'at': link['startMs'].toString(),
    };
    return NotificationDestination(
      'route',
      'View Schedule',
      route: Uri(
        path: '/business/schedule',
        queryParameters: query.isEmpty ? null : query,
      ).toString(),
    );
  }
  if (destination == 'business_inquiry') {
    return NotificationDestination(
      'route',
      'View Inquiry',
      route: Uri(
        path: '/business/schedule',
        queryParameters: {
          'lead': id(link['leadId']) ?? '',
          'workspace': id(link['businessId']) ?? '',
        },
      ).toString(),
    );
  }
  if (destination == 'business_email') {
    return NotificationDestination(
      'route',
      'View Conversation',
      route: Uri(
        path: '/business/email-connection',
        queryParameters: {'operation': id(link['operationId']) ?? ''},
      ).toString(),
    );
  }
  if (destination == 'business_email_campaign') {
    return NotificationDestination(
      'route',
      'Review Campaign',
      route: Uri(
        path: '/business/email-connection',
        queryParameters: {'campaign': id(link['campaignId']) ?? ''},
      ).toString(),
    );
  }
  if (destination == 'social_review') {
    return const NotificationDestination(
      'route',
      'Review Content',
      route: '/business/social-operations?review=posts',
    );
  }
  if (destination == 'social_draft') {
    if (!{'facebook', 'instagram'}.contains(link['provider']) ||
        id(link['itemId']) == null) {
      return null;
    }
    return NotificationDestination(
      'route',
      'Review Social Draft',
      route: Uri(
        path: AppRoutes.businessSocialOperations,
        queryParameters: {
          'item': id(link['itemId']) ?? '',
          'provider': link['provider'],
        },
      ).toString(),
    );
  }
  if (destination == 'social_published') {
    return NotificationDestination(
      'route',
      'View Published Post',
      route: Uri(
        path: AppRoutes.businessSocialOperations,
        queryParameters: {'published': id(link['jobId']) ?? ''},
      ).toString(),
    );
  }
  if (destination == 'billing') {
    return const NotificationDestination(
      'route',
      'View Billing',
      route: '/billing',
    );
  }
  if ({'job_opportunity', 'travel_job_opportunity'}.contains(type)) {
    final campaignId = id(data['campaignId'] ?? link['campaignId']);
    return NotificationDestination(
      'route',
      'View Work',
      route: campaignId == null
          ? '/scaler/work'
          : AppRoutes.campaignDetail(campaignId),
    );
  }
  if (destination == 'growth_agents' ||
      destination == 'business_growth_agents') {
    final prospect = id(link['prospectId']);
    final report = id(link['reportId']);
    return NotificationDestination(
      'route',
      'Review Agent Activity',
      route:
          '${destination == 'business_growth_agents' ? '/business' : ''}/growth-agents${prospect != null
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
