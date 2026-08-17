import 'package:flutter/material.dart';

import '../../models/user/user_profile.dart';
import '../../navigation/app_routes.dart';
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
              const Expanded(
                child: Text(
                  'SCALEDCIRCLE',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Log In',
                onPressed: () => Navigator.pushNamed(context, AppRoutes.login),
                icon: const Icon(Icons.login, color: publicMuted),
              ),
              FilledButton(
                onPressed: () => openPublicAccountRegistration(
                  context,
                  accent == scalerBlue ? 'scaler' : 'business',
                ),
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
            Semantics(
              button: true,
              label: 'ScaledCircle home',
              child: InkWell(
                onTap: () => Navigator.pushNamedAndRemoveUntil(
                  context,
                  '/',
                  (route) => false,
                ),
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    'SCALEDCIRCLE',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.4,
                    ),
                  ),
                ),
              ),
            ),
            const Spacer(),
            PublicNavLink(label: 'For Businesses', route: AppRoutes.businesses),
            PublicNavLink(label: 'For Scalers', route: AppRoutes.scalers),
            const PublicNavLink(label: 'How It Works', route: '/#how'),
            const PublicNavLink(label: 'Pricing', route: '/#pricing'),
            TextButton(
              onPressed: () => Navigator.pushNamed(context, AppRoutes.login),
              child: const Text('Log In'),
            ),
            const SizedBox(width: 6),
            FilledButton(
              onPressed: () => openPublicAccountRegistration(
                context,
                accent == scalerBlue ? 'scaler' : 'business',
              ),
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
        Navigator.pushNamedAndRemoveUntil(context, '/', (route) => false);
      } else {
        Navigator.pushNamed(context, route);
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
                        padding: const EdgeInsets.fromLTRB(22, 42, 22, 80),
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
    padding: const EdgeInsets.all(22),
    decoration: BoxDecoration(
      color: publicPanel,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: accent ?? publicBorder),
    ),
    child: child,
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
              onPressed: () => Navigator.pushNamed(context, AppRoutes.login),
              child: const Text('Log In'),
            ),
          ],
        ),
      ],
    ),
  );
}
