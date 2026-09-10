import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../../services/subscription_plan_service.dart';
import 'authentic_product_map.dart';
import 'public_funnel_components.dart'
    show ScaledCircleBrand, openPublicRoleChooser;
import 'public_legal_footer.dart';
import '../../widgets/customer_capability_status.dart';

const _bg = Color(0xFF020914);
const _navy = Color(0xFF071525);
const _border = Color(0xFF143552);
const _green = Color(0xFF14E39A);
const _blue = Color(0xFF287EFF);
const _muted = Color(0xFFB8C9D8);

class PublicLandingScreen extends StatelessWidget {
  const PublicLandingScreen({super.key});

  void _start(BuildContext context, String role) => AppNavigation.push(
    context,
    role == 'scaler' ? AppRoutes.scalers : AppRoutes.businesses,
  );

  @override
  Widget build(BuildContext context) {
    final mobile = MediaQuery.sizeOf(context).width < 760;
    final howItWorksKey = GlobalKey();
    final pricingKey = GlobalKey();
    void reveal(GlobalKey key) {
      final target = key.currentContext;
      if (target != null) {
        Scrollable.ensureVisible(
          target,
          duration: const Duration(milliseconds: 450),
          curve: Curves.easeOut,
        );
      }
    }

    return Scaffold(
      backgroundColor: _bg,
      body: SelectionArea(
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              automaticallyImplyLeading: false,
              backgroundColor: const Color(0xF2020914),
              toolbarHeight: mobile
                  ? (MediaQuery.textScalerOf(context).scale(14) > 18
                        ? 184
                        : 108)
                  : 72,
              title: _Navigation(
                onLogin: () => AppNavigation.push(context, AppRoutes.login),
                onStart: () => openPublicRoleChooser(context),
                onBusiness: () =>
                    AppNavigation.push(context, AppRoutes.businesses),
                onScaler: () => AppNavigation.push(context, AppRoutes.scalers),
                onHowItWorks: () => reveal(howItWorksKey),
                onPricing: () => reveal(pricingKey),
              ),
            ),
            SliverToBoxAdapter(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1180),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(22, 44, 22, 80),
                    child: Column(
                      children: [
                        _Hero(
                          onBusiness: () =>
                              AppNavigation.push(context, AppRoutes.businesses),
                          onScaler: () =>
                              AppNavigation.push(context, AppRoutes.scalers),
                        ),
                        const _Gap(),
                        _HowItWorks(key: howItWorksKey),
                        const SizedBox(height: 24),
                        FilledButton(
                          key: const Key('business-after-proof-cta'),
                          onPressed: () => _start(context, 'business'),
                          child: const Text('Build My First Campaign'),
                        ),
                        const _Gap(),
                        const _BusinessExperience(),
                        const _Gap(),
                        const _FieldCampaigns(),
                        const _Gap(),
                        _ScalerExperience(
                          onStart: () => _start(context, 'scaler'),
                        ),
                        const _Gap(),
                        const _ManagedGrowth(),
                        const _Gap(),
                        const CustomerCapabilityStatus(
                          foregroundColor: Colors.white,
                        ),
                        const _Gap(),
                        _Pricing(
                          key: pricingKey,
                          onGetStarted: () => _start(context, 'business'),
                          onCompare: () =>
                              AppNavigation.push(context, AppRoutes.login),
                        ),
                        const _Gap(),
                        _FinalCta(
                          onBusiness: () => _start(context, 'business'),
                          onScaler: () => _start(context, 'scaler'),
                          onLogin: () =>
                              AppNavigation.push(context, AppRoutes.login),
                        ),
                        const SizedBox(height: 48),
                        const PublicLegalFooter(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Navigation extends StatelessWidget {
  const _Navigation({
    required this.onLogin,
    required this.onStart,
    required this.onBusiness,
    required this.onScaler,
    required this.onHowItWorks,
    required this.onPricing,
  });
  final VoidCallback onLogin;
  final VoidCallback onStart;
  final VoidCallback onBusiness;
  final VoidCallback onScaler;
  final VoidCallback onHowItWorks;
  final VoidCallback onPricing;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final showLinks = constraints.maxWidth >= 760;
      return SizedBox(
        width: double.infinity,
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          runSpacing: 8,
          children: [
            const SizedBox(width: 190, child: ScaledCircleBrand(compact: true)),
            if (showLinks)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _NavText('For Businesses', onPressed: onBusiness),
                  _NavText('For Scalers', onPressed: onScaler),
                  _NavText('How It Works', onPressed: onHowItWorks),
                  _NavText('Pricing', onPressed: onPricing),
                ],
              ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                TextButton(onPressed: onLogin, child: const Text('Log In')),
                FilledButton(
                  onPressed: onStart,
                  style: FilledButton.styleFrom(
                    backgroundColor: _green,
                    foregroundColor: _bg,
                    minimumSize: const Size(112, 48),
                  ),
                  child: const Text('Get Started'),
                ),
              ],
            ),
          ],
        ),
      );
    },
  );
}

class _NavText extends StatelessWidget {
  const _NavText(this.value, {this.onPressed});
  final String value;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: onPressed ?? () {},
    child: Text(value, style: const TextStyle(color: _muted, fontSize: 14)),
  );
}

class _Hero extends StatelessWidget {
  const _Hero({required this.onBusiness, required this.onScaler});
  final VoidCallback onBusiness;
  final VoidCallback onScaler;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final copy = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Put local marketing into motion.',
            key: Key('homepage-hero-title'),
            style: TextStyle(
              color: Colors.white,
              fontSize: 52,
              height: 1.04,
              fontWeight: FontWeight.w900,
              letterSpacing: -2,
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Choose the area. Set the work and pay. A Scaler carries out the campaign, and you review the tracked route before approving completed work.',
            style: TextStyle(color: _muted, fontSize: 19, height: 1.55),
          ),
          const SizedBox(height: 12),
          const Text(
            'Clear costs. Defined work. Evidence you can review. No guaranteed leads or sales.',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 28),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              FilledButton.icon(
                key: const Key('business-primary-cta'),
                onPressed: onBusiness,
                style: FilledButton.styleFrom(
                  backgroundColor: _green,
                  foregroundColor: _bg,
                  minimumSize: const Size(190, 52),
                ),
                icon: const Icon(Icons.trending_up),
                label: const Text('Grow My Business'),
              ),
              OutlinedButton.icon(
                key: const Key('scaler-primary-cta'),
                onPressed: onScaler,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: _blue),
                  minimumSize: const Size(190, 52),
                ),
                icon: const Icon(Icons.directions_walk),
                label: const Text('Become a Scaler'),
              ),
            ],
          ),
        ],
      );
      return c.maxWidth >= 850
          ? Row(
              children: [
                Expanded(child: copy),
                const SizedBox(width: 38),
                const Expanded(child: _MapPreview()),
              ],
            )
          : Column(
              children: [copy, const SizedBox(height: 34), const _MapPreview()],
            );
    },
  );
}

class _MapPreview extends StatelessWidget {
  const _MapPreview();
  @override
  Widget build(BuildContext context) => _Panel(
    child: const AuthenticProductMap(
      mode: PublicProductMapMode.campaign,
      height: 410,
      showOpportunityCard: true,
    ),
  );
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks({super.key});
  @override
  Widget build(BuildContext context) => const Column(
    children: [
      _Heading(
        eyebrow: 'HOW SCALEDCIRCLE WORKS',
        title: 'From a local campaign to work you can review.',
        subtitle: 'One clear workflow for the Business and the Scaler.',
      ),
      SizedBox(height: 22),
      _Cards(
        children: [
          _Outcome(
            number: '1',
            icon: Icons.travel_explore,
            title: 'Choose the area and work',
            body:
                'Define the territory, materials, schedule, base pay, and any offered bonus before funding.',
          ),
          _Outcome(
            number: '2',
            icon: Icons.auto_awesome,
            title: 'Publish and assign',
            body:
                'Scalers apply to funded campaigns. Review applicants and assign the agreed work.',
          ),
          _Outcome(
            number: '3',
            icon: Icons.rocket_launch_outlined,
            title: 'Track and review',
            body:
                'Active canvassing routes are recorded automatically. Review the evidence and payable amount before approving completion.',
          ),
        ],
      ),
    ],
  );
}

class _BusinessExperience extends StatelessWidget {
  const _BusinessExperience();
  @override
  Widget build(BuildContext context) => const _Panel(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: _Heading(
        eyebrow: 'A PRACTICAL EXAMPLE',
        title: 'A flyer campaign for a local contractor.',
        subtitle:
            'Choose a neighborhood and describe the authorized work. Set materials, timing, and compensation. After funding and assignment, the Scaler walks the route with automatic GPS tracking. You review the route and completion evidence in the Job Room. Responses or sales are not guaranteed.',
      ),
    ),
  );
}

class _ManagedGrowth extends StatelessWidget {
  const _ManagedGrowth();
  @override
  Widget build(BuildContext context) => const _Heading(
    eyebrow: 'GROWTH TOOLS — BETA',
    title: 'More help as your business grows.',
    subtitle:
        'Explore social planning, prospect research, business recommendations, and ad preparation. These capabilities are still being tested and measured. Publishing and paid actions require the appropriate approval.',
  );
}

class _FieldCampaigns extends StatelessWidget {
  const _FieldCampaigns();
  @override
  Widget build(BuildContext context) => const Column(
    children: [
      _Heading(
        eyebrow: 'EVIDENCE YOU CAN REVIEW',
        title: 'Understand what happened before you approve.',
        subtitle:
            'The Job Room brings the assignment, tracked route, timing, and compensation together.',
      ),
      SizedBox(height: 22),
      _Cards(
        children: [
          _Outcome(
            number: '1',
            icon: Icons.map_outlined,
            title: 'Assigned area and actual route',
            body:
                'Compare the assigned territory with the recorded path. Route Coverage Estimate does not prove individual households were serviced.',
          ),
          _Outcome(
            number: '2',
            icon: Icons.assignment_outlined,
            title: 'Agreed pay, explained',
            body:
                'Review accepted base pay, any offered bonus, eligibility, and the payable amount together.',
          ),
          _Outcome(
            number: '3',
            icon: Icons.verified_outlined,
            title: 'Photo-free canvassing',
            body:
                'GPS is automatic during active work. Residential before-and-after photos are not required; access issues can be reported for review.',
          ),
        ],
      ),
    ],
  );
}

class _ScalerExperience extends StatelessWidget {
  const _ScalerExperience({required this.onStart});
  final VoidCallback onStart;
  @override
  Widget build(BuildContext context) => Container(
    key: const Key('scaler-blue-section'),
    padding: const EdgeInsets.all(28),
    decoration: BoxDecoration(
      color: const Color(0xFF071A34),
      border: Border.all(color: _blue),
      borderRadius: BorderRadius.circular(22),
    ),
    child: LayoutBuilder(
      builder: (context, c) {
        final copy = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'FOR SCALERS',
              style: TextStyle(color: _blue, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            const Text(
              'Know the work and pay before you apply.',
              style: TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Choose from available local campaigns that fit your preferences. Work availability varies by area; creating a profile does not guarantee a job.',
              style: TextStyle(color: _muted, height: 1.5),
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: onStart,
              style: FilledButton.styleFrom(
                backgroundColor: _blue,
                minimumSize: const Size(150, 50),
              ),
              child: const Text('Become a Scaler'),
            ),
          ],
        );
        const job = _Panel(
          child: Padding(
            padding: EdgeInsets.all(20),
            child: _Heading(
              eyebrow: 'BEFORE YOU APPLY',
              title: 'A clear agreement, then a clear next step.',
              subtitle:
                  'Review the area, base pay, bonus conditions, materials, and timing. During canvassing, tracking is automatic. See what remains before completion, and follow Business review through to your earnings.',
            ),
          ),
        );
        return c.maxWidth > 720
            ? Row(
                children: [
                  Expanded(child: copy),
                  const SizedBox(width: 28),
                  const Expanded(child: job),
                ],
              )
            : Column(children: [copy, const SizedBox(height: 22), job]);
      },
    ),
  );
}

class _Pricing extends StatelessWidget {
  const _Pricing({
    super.key,
    required this.onGetStarted,
    required this.onCompare,
  });

  final VoidCallback onGetStarted;
  final VoidCallback onCompare;

  static const _order = ['starter', 'growth', 'scale', 'managed_growth'];

  static const _descriptions = <String, String>{
    'starter': 'For local businesses starting with field campaigns.',
    'growth':
        'For growing teams that want stronger planning, content, and response tracking.',
    'scale':
        'For businesses operating advanced local intelligence and recurring growth.',
    'managed_growth':
        'For businesses that want ScaledCircle helping prepare and coordinate ongoing marketing.',
  };

  static const _featureLabels = <String, String>{
    'campaign_mapping': 'Campaign mapping',
    'gps_verification': 'Tracked route evidence',
    'basic_ai_planning': 'Simple AI campaign planning',
    'advanced_analytics': 'Advanced campaign analytics',
    'ai_content_creation': 'AI-assisted content creation',
    'lead_tracking': 'Lead and response tracking — Coming Soon',
    'property_intelligence': 'Property Intelligence — Beta',
    'weather_intelligence': 'Weather Intelligence — Beta',
    'priority_scaler_matching': 'Priority Scaler matching',
    'managed_growth_planning': '30-day Managed Growth planning',
    'social_content_package': 'Social content ready for approval',
    'seo_action_plan': 'SEO action planning',
  };

  List<String> _highlights(String planId, Map<String, dynamic> plan) {
    final preferred = switch (planId) {
      'starter' => const [
        'campaign_mapping',
        'gps_verification',
        'basic_ai_planning',
      ],
      'growth' => const [
        'advanced_analytics',
        'ai_content_creation',
        'lead_tracking',
      ],
      'scale' => const [
        'property_intelligence',
        'weather_intelligence',
        'priority_scaler_matching',
      ],
      _ => const [
        'managed_growth_planning',
        'social_content_package',
        'seo_action_plan',
      ],
    };
    final available = (plan['features'] as List? ?? const []).toSet();
    return preferred
        .where(available.contains)
        .map((feature) => _featureLabels[feature] ?? feature)
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final cards = _order
        .map((planId) {
          final plan = SubscriptionPlanService.plans[planId]!;
          final name = plan['name']!.toString();
          final price = (plan['price'] as num).toDouble();
          return _Price(
            key: Key('public-plan-$planId'),
            name: name.toUpperCase(),
            price: '\$${price.toStringAsFixed(0)}/month',
            badge: planId == 'managed_growth' ? 'PRIVATE BETA / INVITE ONLY' : null,
            body: _descriptions[planId]!,
            features: _highlights(planId, plan),
            onGetStarted: planId == 'managed_growth' ? null : onGetStarted,
          );
        })
        .toList(growable: false);
    return Column(
      children: [
        const _Heading(
          eyebrow: 'SIMPLE PRICING',
          title: 'Choose how much help you want.',
          subtitle:
              'Software access is clear. Variable campaign costs are approved separately.',
        ),
        const SizedBox(height: 22),
        _PricingGrid(children: cards),
        const SizedBox(height: 28),
        const _Heading(
          eyebrow: 'ADD-ONS',
          title: 'Add more intelligence',
          subtitle: 'Add to one workspace plan. Add-ons do not add seats.',
        ),
        const SizedBox(height: 18),
        _PricingGrid(
          children: [
            _Price(
              name: 'BUSINESS ASSISTANT',
              price: '+\$399/month',
              badge: 'BETA / COMING SOON',
              body:
                  'Review business information, recommendations and next actions. Your approval stays in control.',
              features: const [
                'Current business and campaign state',
                'Recommendations and observations',
                'No autonomous accomplishments claimed',
              ],
              onGetStarted: null,
            ),
            _Price(
              name: 'LEAD GENERATION RESEARCH',
              price: '+\$699/month',
              badge: 'BETA / COMING SOON',
              body:
                  'Prospect research, evidence, qualification and drafts. Research never authorizes contact.',
              features: const [
                'Evidence and provenance',
                'Research and draft preparation',
                'No automatic cold outreach',
              ],
              onGetStarted: null,
            ),
          ],
        ),
        const SizedBox(height: 28),
        _Price(
          name: 'GROWTH DEPARTMENT',
          price: '\$2,000/month',
          badge: 'PRIVATE BETA / COMING SOON',
          body:
              'The full current ScaledCircle growth stack: Managed Growth + Business Assistant Beta + Lead Generation Research Beta.',
          features: const [
            '10 total workspace users, including the owner',
            '\$2,097 separately · save \$1,164/year',
            'One bundle replaces the three individual recurring charges',
            'Included agent capabilities remain Beta',
          ],
          onGetStarted: null,
        ),
        const SizedBox(height: 18),
        OutlinedButton(
          onPressed: onCompare,
          child: const Text('Compare Plans'),
        ),
        const SizedBox(height: 16),
        const Text(
          'Campaign compensation and platform fees are shown before funding. Paid advertising needs separate approval. Printing is Coming Soon. Postcards are Private Beta for selected Businesses while real-world fulfillment testing is completed.',
          style: TextStyle(color: _muted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _PricingGrid extends StatelessWidget {
  const _PricingGrid({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final availableColumns = constraints.maxWidth >= 1080
          ? 4
          : constraints.maxWidth >= 680
          ? 2
          : 1;
      final columns = availableColumns > children.length
          ? children.length
          : availableColumns;
      final width = (constraints.maxWidth - (16 * (columns - 1))) / columns;
      return Wrap(
        spacing: 16,
        runSpacing: 16,
        children: children
            .map((child) => SizedBox(width: width, child: child))
            .toList(growable: false),
      );
    },
  );
}

class _FinalCta extends StatelessWidget {
  const _FinalCta({
    required this.onBusiness,
    required this.onScaler,
    required this.onLogin,
  });
  final VoidCallback onBusiness;
  final VoidCallback onScaler;
  final VoidCallback onLogin;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      const Text(
        'READY TO GROW LOCALLY?',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: Colors.white,
          fontSize: 36,
          fontWeight: FontWeight.w900,
        ),
      ),
      const SizedBox(height: 20),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        alignment: WrapAlignment.center,
        children: [
          FilledButton(
            onPressed: onBusiness,
            style: FilledButton.styleFrom(
              backgroundColor: _green,
              foregroundColor: _bg,
              minimumSize: const Size(180, 52),
            ),
            child: const Text('Grow My Business'),
          ),
          FilledButton(
            onPressed: onScaler,
            style: FilledButton.styleFrom(
              backgroundColor: _blue,
              minimumSize: const Size(180, 52),
            ),
            child: const Text('Become a Scaler'),
          ),
          TextButton(onPressed: onLogin, child: const Text('Log In')),
        ],
      ),
    ],
  );
}

class _Heading extends StatelessWidget {
  const _Heading({
    required this.eyebrow,
    required this.title,
    required this.subtitle,
  });
  final String eyebrow;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        eyebrow,
        style: const TextStyle(
          color: _green,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.1,
        ),
      ),
      const SizedBox(height: 8),
      Text(
        title,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 34,
          fontWeight: FontWeight.w900,
        ),
      ),
      const SizedBox(height: 8),
      Text(subtitle, style: const TextStyle(color: _muted, height: 1.5)),
    ],
  );
}

class _Cards extends StatelessWidget {
  const _Cards({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final width = c.maxWidth >= 800
          ? (c.maxWidth - (16 * (children.length - 1))) / children.length
          : c.maxWidth;
      return Wrap(
        spacing: 16,
        runSpacing: 16,
        children: children
            .map((child) => SizedBox(width: width, child: child))
            .toList(),
      );
    },
  );
}

class _Outcome extends StatelessWidget {
  const _Outcome({
    required this.number,
    required this.icon,
    required this.title,
    required this.body,
  });
  final String number;
  final IconData icon;
  final String title;
  final String body;
  @override
  Widget build(BuildContext context) => _Panel(
    child: Padding(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                number,
                style: const TextStyle(
                  color: _green,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const Spacer(),
              Icon(icon, color: _green, size: 30),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 9),
          Text(body, style: const TextStyle(color: _muted, height: 1.45)),
        ],
      ),
    ),
  );
}

class _Price extends StatelessWidget {
  const _Price({
    required this.name,
    required this.price,
    required this.body,
    required this.features,
    required this.onGetStarted,
    this.badge,
    super.key,
  });
  final String name;
  final String price;
  final String body;
  final List<String> features;
  final VoidCallback? onGetStarted;
  final String? badge;
  @override
  Widget build(BuildContext context) => _Panel(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            children: [
              Text(
                name,
                style: const TextStyle(
                  color: _green,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (badge != null)
                Text(
                  badge!,
                  style: const TextStyle(
                    color: Color(0xFFFFB34D),
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            price,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Text(body, style: const TextStyle(color: _muted)),
          const SizedBox(height: 14),
          for (final feature in features)
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Text(
                '✓ $feature',
                style: const TextStyle(color: Colors.white),
              ),
            ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onGetStarted,
              style: FilledButton.styleFrom(
                backgroundColor: _green,
                foregroundColor: _bg,
              ),
              child: Text(onGetStarted == null ? 'Private Beta / Coming Soon' : 'Get Started'),
            ),
          ),
        ],
      ),
    ),
  );
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: _navy,
      border: Border.all(color: _border),
      borderRadius: BorderRadius.circular(20),
      boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 26)],
    ),
    child: child,
  );
}

class _Gap extends StatelessWidget {
  const _Gap();
  @override
  Widget build(BuildContext context) => const SizedBox(height: 78);
}
