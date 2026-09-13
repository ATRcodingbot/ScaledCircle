/// Presentation only. Server membership and per-action authority remain required.
class WorkspacePresentation {
  WorkspacePresentation(Map<String, dynamic> context)
    : owner = context['isOwner'] == true,
      name = context['businessName']?.toString() ?? 'your Business',
      permissions = Set<String>.from(context['permissions'] as List? ?? []);
  final bool owner;
  final String name;
  final Set<String> permissions;
  bool can(String permission) => owner || permissions.contains(permission);
  bool any(Iterable<String> values) =>
      owner || values.any(permissions.contains);
  bool get operations => any(const [
    'scheduleView',
    'scheduleEdit',
    'customersView',
    'customersEdit',
    'jobsView',
    'jobsAssigned',
    'jobsEdit',
    'jobsStatus',
    'assignPeople',
  ]);
  bool allowsRoute(String route) {
    if (owner) return true;
    final path = Uri.tryParse(route)?.path ?? route;
    if (path == '/business' || path == '/business/account') return true;
    if (path == '/business/schedule') return operations;
    if (path == '/business/team') return can('teamManagement');
    if (path == '/business/membership' || path == '/business/billing') {
      return can('billing');
    }
    if (path == '/business/attribution') return can('analytics');
    if (path == '/business/campaigns') return can('campaigns');
    if (path == '/business/results') return can('analytics');
    if (path.startsWith('/campaign') || path.startsWith('/job-room')) {
      return any(const [
        'campaigns',
        'authorizeCampaigns',
        'analytics',
        'payments',
      ]);
    }
    if (path.startsWith('/business/')) return can('intelligence');
    return false;
  }
}
