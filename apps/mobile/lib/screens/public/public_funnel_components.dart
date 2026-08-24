import 'package:flutter/material.dart';

import '../../models/user/user_profile.dart';
import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../auth/register_screen.dart';
import 'waitlist_screen.dart';

const publicBackground = Color(0xFF020914);
const publicPanel = Color(0xFF071525);
const publicBorder = Color(0xFF143552);
const businessGreen = Color(0xFF14E39A);
const scalerBlue = Color(0xFF287EFF);
const publicMuted = Color(0xFFB8C9D8);

void openPublicAccountRegistration(BuildContext context, String role) {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => RegisterScreen(
        initialRole: role == 'scaler' ? UserRole.scaler : UserRole.business,
      ),
    ),
  );
}

void openPublicWaitlist(BuildContext context, String role) {
  Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => WaitlistScreen(initialRole: role)),
  );
}

void openPublicRoleChooser(BuildContext context) {
  showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: publicPanel,
      title: const Text('How do you want to use ScaledCircle?'),
      content: const Text(
        'Choose the path that fits you.',
        style: TextStyle(color: publicMuted),
      ),
      actions: [
        OutlinedButton.icon(
          onPressed: () {
            Navigator.pop(dialogContext);
            AppNavigation.push(context, AppRoutes.scalers);
          },
          icon: const Icon(Icons.directions_walk),
          label: const Text('Find Work as a Scaler'),
        ),
        FilledButton.icon(
          onPressed: () {
            Navigator.pop(dialogContext);
            AppNavigation.push(context, AppRoutes.businesses);
          },
          style: FilledButton.styleFrom(
            backgroundColor: businessGreen,
            foregroundColor: publicBackground,
          ),
          icon: const Icon(Icons.trending_up),
          label: const Text('Grow My Business'),
        ),
      ],
    ),
  );
}

class ScaledCircleBrand extends StatelessWidget {
  const ScaledCircleBrand({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final showWordmark = !compact || constraints.maxWidth >= 130;
      return Semantics(
        label: 'ScaledCircle home',
        button: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => AppNavigation.replace(context, '/'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
            child: Image.asset(
              showWordmark
                  ? 'assets/brand/scaledcircle-lockup-dark-surface.png'
                  : 'assets/brand/scaledcircle-symbol.png',
              height: compact ? 34 : 42,
              fit: BoxFit.contain,
              semanticLabel: 'ScaledCircle logo',
              filterQuality: FilterQuality.high,
            ),
          ),
        ),
      );
    },
  );
}

class PublicTopNavigation extends StatelessWidget {
  const PublicTopNavigation({super.key, required this.accent});
  final Color accent;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, _) {
      final wide = MediaQuery.sizeOf(context).width >= 820;
      if (!wide) {
        return Container(
          color: const Color(0xF2020914),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              const Expanded(child: ScaledCircleBrand(compact: true)),
              IconButton(
                tooltip: 'Log In',
                onPressed: () => AppNavigation.push(context, AppRoutes.login),
                icon: const Icon(Icons.login, color: publicMuted),
              ),
              FilledButton(
                onPressed: () => openPublicRoleChooser(context),
                style: FilledButton.styleFrom(
                  backgroundColor: accent,
                  foregroundColor: accent == businessGreen
                      ? publicBackground
                      : Colors.white,
                  minimumSize: const Size(96, 48),
                ),
                child: const Text('Get Started'),
              ),
            ],
          ),
        );
      }
      return Container(
        color: const Color(0xF2020914),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          children: [
            const ScaledCircleBrand(),
            const Spacer(),
            PublicNavLink(label: 'For Businesses', route: AppRoutes.businesses),
            PublicNavLink(label: 'For Scalers', route: AppRoutes.scalers),
            const PublicNavLink(label: 'How It Works', route: '/#how'),
            const PublicNavLink(label: 'Pricing', route: '/#pricing'),
            TextButton(
              onPressed: () => AppNavigation.push(context, AppRoutes.login),
              child: const Text('Log In'),
            ),
            const SizedBox(width: 6),
            FilledButton(
              onPressed: () => openPublicRoleChooser(context),
              style: FilledButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: accent == businessGreen
                    ? publicBackground
                    : Colors.white,
                minimumSize: const Size(112, 48),
              ),
              child: const Text('Get Started'),
            ),
          ],
        ),
      );
    },
  );
}

class PublicNavLink extends StatelessWidget {
  const PublicNavLink({super.key, required this.label, required this.route});
  final String label;
  final String route;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: () {
      if (route.startsWith('/#')) {
        AppNavigation.replace(context, '/');
      } else {
        AppNavigation.push(context, route);
      }
    },
    child: Text(label, style: const TextStyle(color: publicMuted)),
  );
}

class FunnelPage extends StatelessWidget {
  const FunnelPage({
    super.key,
    required this.accent,
    required this.semanticsLabel,
    required this.children,
  });
  final Color accent;
  final String semanticsLabel;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Title(
    title: semanticsLabel,
    color: accent,
    child: Scaffold(
      backgroundColor: publicBackground,
      body: SelectionArea(
        child: CustomScrollView(
          semanticChildCount: children.length,
          slivers: [
            SliverAppBar(
              pinned: true,
              automaticallyImplyLeading: false,
              toolbarHeight: 72,
              backgroundColor: publicBackground,
              titleSpacing: 0,
              title: PublicTopNavigation(accent: accent),
            ),
            SliverToBoxAdapter(
              child: Semantics(
                label: semanticsLabel,
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1180),
                    child: SizedBox(
                      width: double.infinity,
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(
                          MediaQuery.sizeOf(context).width < 480 ? 14 : 22,
                          42,
                          MediaQuery.sizeOf(context).width < 480 ? 14 : 22,
                          80,
                        ),
                        child: Column(children: children),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class FunnelHero extends StatelessWidget {
  const FunnelHero({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.secondaryLabel,
    required this.accent,
    required this.onPrimary,
    required this.onSecondary,
    required this.visual,
  });
  final String eyebrow;
  final String title;
  final String body;
  final String primaryLabel;
  final String secondaryLabel;
  final Color accent;
  final VoidCallback onPrimary;
  final VoidCallback onSecondary;
  final Widget visual;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final copy = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            eyebrow,
            style: TextStyle(color: accent, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 48,
              height: 1.05,
              fontWeight: FontWeight.w900,
              letterSpacing: -1.6,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            body,
            style: const TextStyle(
              color: publicMuted,
              fontSize: 18,
              height: 1.55,
            ),
          ),
          const SizedBox(height: 26),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              FilledButton(
                onPressed: onPrimary,
                style: FilledButton.styleFrom(
                  backgroundColor: accent,
                  foregroundColor: accent == businessGreen
                      ? publicBackground
                      : Colors.white,
                  minimumSize: const Size(170, 52),
                ),
                child: Text(primaryLabel),
              ),
              OutlinedButton(
                onPressed: onSecondary,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  minimumSize: const Size(170, 52),
                ),
                child: Text(secondaryLabel),
              ),
            ],
          ),
        ],
      );
      return constraints.maxWidth >= 850
          ? Row(
              children: [
                Expanded(child: copy),
                const SizedBox(width: 38),
                Expanded(child: visual),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [copy, const SizedBox(height: 30), visual],
            );
    },
  );
}

class FunnelSection extends StatelessWidget {
  const FunnelSection({
    super.key,
    required this.step,
    required this.title,
    required this.body,
    required this.accent,
    required this.visual,
    this.reverse = false,
  });
  final String step;
  final String title;
  final String body;
  final Color accent;
  final Widget visual;
  final bool reverse;

  @override
  Widget build(BuildContext context) {
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          step,
          style: TextStyle(color: accent, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 32,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          body,
          style: const TextStyle(color: publicMuted, height: 1.6, fontSize: 16),
        ),
      ],
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 44),
      child: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth < 760) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [copy, const SizedBox(height: 22), visual],
            );
          }
          final pieces = <Widget>[
            Expanded(child: copy),
            const SizedBox(width: 42),
            Expanded(child: visual),
          ];
          return Row(children: reverse ? pieces.reversed.toList() : pieces);
        },
      ),
    );
  }
}

class ProductPanel extends StatelessWidget {
  const ProductPanel({super.key, required this.child, this.accent});
  final Widget child;
  final Color? accent;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(MediaQuery.sizeOf(context).width < 480 ? 16 : 22),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color.lerp(publicPanel, accent ?? publicBorder, .08)!,
          publicPanel,
        ],
      ),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: accent ?? publicBorder),
      boxShadow: const [
        BoxShadow(
          color: Color(0x66000000),
          blurRadius: 30,
          offset: Offset(0, 16),
        ),
      ],
    ),
    child: child,
  );
}

class ProductWindow extends StatelessWidget {
  const ProductWindow({
    super.key,
    required this.title,
    required this.child,
    required this.accent,
    this.label = 'PRODUCT PREVIEW',
  });
  final String title;
  final Widget child;
  final Color accent;
  final String label;

  @override
  Widget build(BuildContext context) => ProductPanel(
    accent: accent,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: .12),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(Icons.circle_outlined, color: accent, size: 18),
            ),
            const SizedBox(width: 10),
            const Text(
              'ScaledCircle',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
            const Spacer(),
            Expanded(
              child: Align(
                alignment: Alignment.centerRight,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: DemoBadge(label: label, color: accent),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const Divider(color: publicBorder, height: 1),
        const SizedBox(height: 16),
        Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 16),
        child,
      ],
    ),
  );
}

class DemoBadge extends StatelessWidget {
  const DemoBadge({super.key, required this.label, required this.color});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: color.withValues(alpha: .5)),
    ),
    child: Text(
      label,
      style: TextStyle(
        color: color,
        fontSize: 10,
        fontWeight: FontWeight.w900,
        letterSpacing: .7,
      ),
    ),
  );
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {super.key, required this.color, this.icon});
  final String label;
  final Color color;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Container(
    constraints: BoxConstraints(
      maxWidth: MediaQuery.sizeOf(context).width < 480
          ? MediaQuery.sizeOf(context).width - 64
          : 340,
    ),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
        ],
        Flexible(
          child: Text(
            label,
            style: TextStyle(color: color, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    ),
  );
}

class MetricTile extends StatelessWidget {
  const MetricTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.accent,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color accent;
  @override
  Widget build(BuildContext context) => Container(
    width: 132,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFF091C2E),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: publicBorder),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 19, color: accent),
        const SizedBox(height: 12),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 3),
        Text(label, style: const TextStyle(color: publicMuted, fontSize: 12)),
      ],
    ),
  );
}

class WorkflowRail extends StatelessWidget {
  const WorkflowRail({super.key, required this.steps, required this.accent});
  final List<(IconData, String, String)> steps;
  final Color accent;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (var index = 0; index < steps.length; index++) ...[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: .14),
                shape: BoxShape.circle,
                border: Border.all(color: accent.withValues(alpha: .55)),
              ),
              child: Icon(steps[index].$1, size: 18, color: accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 1),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      steps[index].$2,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      steps[index].$3,
                      style: const TextStyle(color: publicMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (index != steps.length - 1)
          Container(
            alignment: Alignment.centerLeft,
            margin: const EdgeInsets.only(left: 18),
            width: 1,
            height: 16,
            color: accent.withValues(alpha: .35),
          ),
      ],
    ],
  );
}

class ProductLine extends StatelessWidget {
  const ProductLine(this.label, this.value, {super.key, this.color});
  final String label;
  final String value;
  final Color? color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: publicMuted)),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(
              color: color ?? Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

class FunnelFinalCta extends StatelessWidget {
  const FunnelFinalCta({
    super.key,
    required this.title,
    required this.primary,
    required this.accent,
    required this.onPrimary,
    required this.supportingCopy,
    required this.onWaitlist,
    required this.waitlistLabel,
  });
  final String title;
  final String primary;
  final Color accent;
  final VoidCallback onPrimary;
  final String supportingCopy;
  final VoidCallback onWaitlist;
  final String waitlistLabel;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 48),
    child: Column(
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 38,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          supportingCopy,
          textAlign: TextAlign.center,
          style: const TextStyle(color: publicMuted, height: 1.5),
        ),
        const SizedBox(height: 20),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 12,
          runSpacing: 12,
          children: [
            FilledButton(
              key: const Key('funnel-create-account'),
              onPressed: onPrimary,
              style: FilledButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: accent == businessGreen
                    ? publicBackground
                    : Colors.white,
                minimumSize: const Size(210, 52),
              ),
              child: Text(primary),
            ),
            OutlinedButton(
              key: const Key('funnel-join-waitlist'),
              onPressed: onWaitlist,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                minimumSize: const Size(180, 52),
              ),
              child: Text(waitlistLabel),
            ),
            TextButton(
              key: const Key('funnel-login'),
              onPressed: () => AppNavigation.push(context, AppRoutes.login),
              child: const Text('Log In'),
            ),
          ],
        ),
      ],
    ),
  );
}
