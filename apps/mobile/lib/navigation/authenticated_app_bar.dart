import 'package:flutter/material.dart';
import '../config/native_release_policy.dart';
import 'app_shell_identity.dart';
import 'app_router.dart';
import 'context_back_button.dart';
import 'business_back_button.dart';
import 'workspace_presentation.dart';
import '../services/business_workspace_service.dart';
import '../widgets/scaled_circle_brand.dart';
import '../widgets/authenticated_sign_out_button.dart';
import '../screens/notifications/notifications_screen.dart';
import '../screens/business/business_account_screen.dart';
import '../screens/scaler/profile/scaler_profile_screen.dart';

String appShellParent(String path, String home) {
  if (path == '/business/growth-agents' ||
      path == '/business/social-operations' ||
      path == '/business/ai-team') {
    return '/business/growth';
  }
  if (path.startsWith('/billing/') ||
      path.startsWith('/business/billing/') ||
      path == '/business/team' ||
      path == '/business/membership' ||
      path == '/complete-business-profile') {
    return '/business/account';
  }
  if (path.startsWith('/business/')) return '/business';
  if (path.startsWith('/job-room') || path.startsWith('/campaign/')) {
    return home == '/scaler' ? '/scaler/work' : '/business/campaigns';
  }
  if (path.startsWith('/scaler/')) return '/scaler';
  return home;
}

/// One maintained app bar for authenticated product screens. Page content and
/// domain actions remain owned by their existing screen; anonymous subflows pop.
class AuthenticatedAppBar extends StatelessWidget
    implements PreferredSizeWidget {
  const AuthenticatedAppBar({
    super.key,
    this.title,
    this.leading,
    this.actions,
    this.bottom,
    this.centerTitle,
    this.backgroundColor,
    this.foregroundColor,
    this.elevation,
    this.scrolledUnderElevation,
    this.titleSpacing,
    this.leadingWidth,
    this.toolbarHeight,
    this.automaticallyImplyLeading = true,
  });
  final Widget? title, leading;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;
  final bool? centerTitle;
  final bool automaticallyImplyLeading;
  final Color? backgroundColor, foregroundColor;
  final double? elevation,
      scrolledUnderElevation,
      titleSpacing,
      leadingWidth,
      toolbarHeight;
  @override
  Size get preferredSize => Size.fromHeight(
    (toolbarHeight ?? kToolbarHeight) + (bottom?.preferredSize.height ?? 0),
  );
  @override
  Widget build(BuildContext context) {
    final identity = AppShellIdentity.maybeOf(context);
    if (identity == null) {
      return AppBar(
        title: title,
        leading: leading,
        actions: actions,
        bottom: bottom,
        centerTitle: centerTitle,
        backgroundColor: backgroundColor,
        foregroundColor: foregroundColor,
        elevation: elevation,
        scrolledUnderElevation: scrolledUnderElevation,
        titleSpacing: titleSpacing,
        leadingWidth: leadingWidth,
        toolbarHeight: toolbarHeight,
        automaticallyImplyLeading: automaticallyImplyLeading,
      );
    }
    final route =
        Uri.tryParse(ModalRoute.of(context)?.settings.name ?? '')?.path ?? '';
    final candidate = identity.workspace ?? BusinessWorkspaceSession.value;
    final workspace = candidate?['actorUid'] == identity.uid ? candidate : null;
    final profile = identity.profile;
    final business =
        workspace != null ||
        route.startsWith('/business') ||
        (profile['activeView'] ?? profile['accountType'] ?? profile['role']) ==
            'business';
    final admin = profile['role'] == 'admin';
    final access = workspace == null ? null : WorkspacePresentation(workspace);
    final limitedSchedule =
        access != null &&
        !access.owner &&
        access.operations &&
        !access.any(const [
          'intelligence',
          'analytics',
          'campaigns',
          'teamManagement',
          'billing',
        ]);
    final home = limitedSchedule
        ? '/business/schedule'
        : business
        ? '/business'
        : admin
        ? '/admin'
        : '/scaler';
    final name =
        access?.name ??
        (business
            ? (profile['businessName']?.toString() ?? 'Business workspace')
            : (profile['displayName']?.toString() ?? 'My account'));
    final scheduleRoot =
        route == '/business/schedule' &&
        access != null &&
        !access.owner &&
        access.operations &&
        !access.any(const [
          'intelligence',
          'analytics',
          'campaigns',
          'teamManagement',
          'billing',
        ]);
    final root =
        (route == home ||
            scheduleRoot ||
            (limitedSchedule && route == '/business')) &&
        !(ModalRoute.of(context)?.canPop ?? false);
    final wide = MediaQuery.sizeOf(context).width >= 800;
    void open(String destination) {
      if (destination == home) {
        AppNavigation.home(context, home);
        return;
      }
      if (destination == route) return;
      AppNavigation.push(context, destination);
    }

    void back() {
      final nav = Navigator.of(context);
      if (nav.canPop()) {
        nav.maybePop();
        return;
      }
      AppNavigation.replace(context, appShellParent(route, home));
    }

    void account() => Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => business
            ? const BusinessAccountScreen()
            : const ScalerProfileScreen(),
      ),
    );
    final navigation = <String, String>{
      'Home': home,
      if (business && access?.operations == true)
        'Schedule': '/business/schedule',
      if (business && access?.can('campaigns') == true)
        'Campaigns': '/business/campaigns',
      if (business && access?.can('analytics') == true)
        'Results': '/business/results',
      if (NativeReleasePolicy.premiumToolsAvailable &&
          business &&
          access?.can('intelligence') == true)
        'Growth': '/business/growth',
      if (!NativeReleasePolicy.premiumToolsAvailable &&
          business &&
          access?.can('intelligence') == true) ...{
        'Property': '/business/property',
        'Weather': '/business/weather',
      },
      if (business && access?.can('teamManagement') == true)
        'Team': '/business/team',
      if (business && access?.can('billing') == true)
        'Billing / Plan': '/business/membership',
      if (!business && !admin) 'My Work': '/scaler/work',
    };
    final raw = title is Text ? (title as Text).data : null;
    final parts = raw?.split(RegExp(r'\s*[·—]\s*(?=Private Beta|Beta)'));
    final pageTitle = title is ScaledCircleBrand
        ? Text(business ? 'Business Home' : 'Scaler Home')
        : raw != null
        ? Text(parts!.first, maxLines: 1, overflow: TextOverflow.ellipsis)
        : title;
    return AppBar(
      backgroundColor: backgroundColor,
      foregroundColor: foregroundColor,
      elevation: elevation,
      scrolledUnderElevation: scrolledUnderElevation,
      bottom: bottom,
      toolbarHeight: toolbarHeight,
      automaticallyImplyLeading: false,
      leadingWidth: root ? null : 48,
      leading: root
          ? null
          : leading != null &&
                leading is! ContextBackButton &&
                (leading is! BusinessBackButton ||
                    (leading as BusinessBackButton).beforeNavigate != null ||
                    (leading as BusinessBackButton).onPressed != null)
          ? leading
          : BackButton(onPressed: back),
      titleSpacing: root ? 12 : 0,
      centerTitle: false,
      title: Row(
        children: [
          Semantics(
            label: 'ScaledCircle Home',
            button: true,
            container: true,
            onTap: () => AppNavigation.home(context, home),
            excludeSemantics: true,
            child: Tooltip(
              message: 'ScaledCircle Home',
              excludeFromSemantics: true,
              child: InkWell(
                onTap: () => AppNavigation.home(context, home),
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  height: 48,
                  width: wide
                      ? 116
                      : root
                      ? 76
                      : 48,
                  child: Center(
                    child: wide || root
                        ? const ScaledCircleBrand(compact: true)
                        : Image.asset(
                            'assets/brand/scaledcircle-symbol.png',
                            width: 24,
                            height: 24,
                          ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (pageTitle != null)
                  DefaultTextStyle.merge(
                    style: const TextStyle(fontSize: 18),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    child: pageTitle,
                  ),
                if (parts != null && parts.length > 1)
                  Text(
                    parts.last,
                    style: const TextStyle(fontSize: 11),
                    maxLines: 1,
                  ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        if (wide)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 180),
                child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ),
          ),
        IconButton(
          tooltip: 'Notifications',
          icon: const Icon(Icons.notifications_outlined),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const NotificationsScreen()),
          ),
        ),
        if (actions?.isNotEmpty == true && (!root || admin))
          IconButton(
            tooltip: 'Page actions',
            icon: const Icon(Icons.more_horiz),
            onPressed: () => showModalBottomSheet(
              context: context,
              builder: (_) => SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Wrap(spacing: 8, runSpacing: 8, children: actions!),
                ),
              ),
            ),
          ),
        PopupMenuButton<String>(
          tooltip: 'Workspace and account',
          icon: const Icon(Icons.menu),
          itemBuilder: (_) => [
            PopupMenuItem<String>(
              enabled: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(
                    width: 116,
                    child: ScaledCircleBrand(compact: true),
                  ),
                  const SizedBox(height: 8),
                  Text(name),
                ],
              ),
            ),
            for (final e in navigation.entries)
              PopupMenuItem(value: e.value, child: Text(e.key)),
            const PopupMenuDivider(),
            const PopupMenuItem(
              value: 'account',
              child: Text('Account / Profile'),
            ),
            const PopupMenuItem(value: 'signout', child: Text('Sign Out')),
          ],
          onSelected: (value) {
            if (value == 'signout') {
              AuthenticatedSignOutButton.signOut(context);
            } else if (value == 'account') {
              account();
            } else {
              open(value);
            }
          },
        ),
      ],
    );
  }
}
