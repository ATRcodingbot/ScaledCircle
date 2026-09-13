import 'package:flutter/material.dart';
import '../../navigation/workspace_presentation.dart';
import '../../navigation/app_router.dart';
import 'business_account_screen.dart';
import 'business_team_screen.dart';
import 'business_membership_screen.dart';
import '../notifications/notifications_screen.dart';
import '../../widgets/authenticated_sign_out_button.dart';

/// The owner dashboard is deliberately constructed lazily, so limited users
/// never initialize its campaigns, zones, weather or financial subscriptions.
class BusinessWorkspaceHome extends StatelessWidget {
  const BusinessWorkspaceHome({
    super.key,
    required this.workspace,
    required this.ownerBuilder,
    required this.scheduleBuilder,
  });
  final Map<String, dynamic> workspace;
  final WidgetBuilder ownerBuilder, scheduleBuilder;
  @override
  Widget build(BuildContext context) {
    final access = WorkspacePresentation(workspace);
    if (access.owner) return ownerBuilder(context);
    if (access.operations) return scheduleBuilder(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(access.name),
        actions: const [MemberAccountActions()],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('Your workspace', style: TextStyle(fontSize: 24)),
          if (access.can('intelligence'))
            ListTile(
              title: const Text('Growth'),
              onTap: () => AppNavigation.push(context, '/business/growth'),
            ),
          if (access.can('campaigns'))
            ListTile(
              title: const Text('Campaigns'),
              onTap: () => AppNavigation.push(context, '/business/campaigns'),
            ),
          if (access.can('analytics'))
            ListTile(
              title: const Text('Results'),
              onTap: () => AppNavigation.push(context, '/business/results'),
            ),
          if (access.can('teamManagement'))
            ListTile(
              title: const Text('Team'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const BusinessTeamScreen()),
              ),
            ),
          if (access.can('billing'))
            ListTile(
              title: const Text('Billing / Plan'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const BusinessMembershipScreen(),
                ),
              ),
            ),
          if (access.permissions.isEmpty)
            Text(
              "You're a member of ${access.name}, but your administrator hasn't assigned workspace responsibilities yet.",
            ),
        ],
      ),
    );
  }
}

class MemberAccountActions extends StatelessWidget {
  const MemberAccountActions({super.key});
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButton(
        tooltip: 'Notifications',
        icon: const Icon(Icons.notifications_outlined),
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const NotificationsScreen()),
        ),
      ),
      IconButton(
        tooltip: 'Account',
        icon: const Icon(Icons.account_circle_outlined),
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const BusinessAccountScreen()),
        ),
      ),
    ],
  );
}

/// Explicit navigation for a member whose home is already the Schedule page.
class MemberWorkspaceMenu extends StatelessWidget {
  const MemberWorkspaceMenu({super.key});
  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
    tooltip: 'Workspace navigation',
    onSelected: (value) {
      if (value == 'signOut') {
        AuthenticatedSignOutButton.signOut(context);
        return;
      }
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => value == 'account'
              ? const BusinessAccountScreen()
              : const NotificationsScreen(),
        ),
      );
    },
    itemBuilder: (_) => const [
      PopupMenuItem(value: 'account', child: Text('Account')),
      PopupMenuItem(value: 'notifications', child: Text('Notifications')),
      PopupMenuItem(value: 'signOut', child: Text('Sign Out')),
    ],
    child: const Padding(
      padding: EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [Text('Workspace'), Icon(Icons.arrow_drop_down)],
      ),
    ),
  );
}
