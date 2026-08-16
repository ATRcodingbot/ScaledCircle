import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../navigation/app_routes.dart';
import 'waitlist_screen.dart';

const _bg = Color(0xFF020914);
const _navy = Color(0xFF071525);
const _border = Color(0xFF143552);
const _green = Color(0xFF14E39A);
const _blue = Color(0xFF287EFF);
const _muted = Color(0xFFB8C9D8);

class PublicLandingScreen extends StatelessWidget {
  const PublicLandingScreen({super.key});

  void _start(BuildContext context, String role) => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => WaitlistScreen(initialRole: role)),
  );

  @override
  Widget build(BuildContext context) {
    final mobile = MediaQuery.sizeOf(context).width < 760;
    return Scaffold(
      backgroundColor: _bg,
      body: SelectionArea(
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              automaticallyImplyLeading: false,
              backgroundColor: const Color(0xF2020914),
              toolbarHeight: mobile ? 108 : 72,
              title: _Navigation(
                onLogin: () => Navigator.pushNamed(context, AppRoutes.login),
                onStart: () => _start(context, 'business'),
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
                          onBusiness: () => _start(context, 'business'),
                          onScaler: () => _start(context, 'scaler'),
                        ),
                        const _Gap(),
                        const _HowItWorks(),
                        const _Gap(),
                        const _BusinessExperience(),
                        const _Gap(),
                        const _ManagedGrowth(),
                        const _Gap(),
                        const _FieldCampaigns(),
                        const _Gap(),
                        _ScalerExperience(
                          onStart: () => _start(context, 'scaler'),
                        ),
                        const _Gap(),
                        const _Pricing(),
                        const _Gap(),
                        _FinalCta(
                          onBusiness: () => _start(context, 'business'),
                          onScaler: () => _start(context, 'scaler'),
                          onLogin: () =>
                              Navigator.pushNamed(context, AppRoutes.login),
                        ),
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
  const _Navigation({required this.onLogin, required this.onStart});
  final VoidCallback onLogin;
  final VoidCallback onStart;
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
            const Text(
              'SCALEDCIRCLE',
              semanticsLabel: 'ScaledCircle home',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.4,
              ),
            ),
            if (showLinks)
              const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _NavText('For Businesses'),
                  _NavText('For Scalers'),
                  _NavText('How It Works'),
                  _NavText('Pricing'),
                ],
              ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(onPressed: onLogin, child: const Text('Log In')),
                const SizedBox(width: 8),
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
  const _NavText(this.value);
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 10),
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
            'GROW YOUR BUSINESS LOCALLY.',
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
            'ScaledCircle helps you decide where to market, what to say, and connects you with real people who can help execute campaigns in the field.',
            style: TextStyle(color: _muted, fontSize: 19, height: 1.55),
          ),
          const SizedBox(height: 12),
          const Text(
            'AI-powered local intelligence. Digital marketing. Verified field campaigns. One platform.',
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
              FilledButton.icon(
                key: const Key('scaler-primary-cta'),
                onPressed: onScaler,
                style: FilledButton.styleFrom(
                  backgroundColor: _blue,
                  minimumSize: const Size(190, 52),
                ),
                icon: const Icon(Icons.directions_walk),
                label: const Text('Earn as a Scaler'),
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
    child: ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        height: 410,
        child: Stack(
          children: [
            Positioned.fill(
              child: IgnorePointer(
                child: FlutterMap(
                  options: const MapOptions(
                    initialCenter: LatLng(39.08, -76.63),
                    initialZoom: 10.5,
                    interactionOptions: InteractionOptions(
                      flags: InteractiveFlag.none,
                    ),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.scaledcircle.app',
                    ),
                  ],
                ),
              ),
            ),
            const Positioned.fill(child: ColoredBox(color: Color(0x66020914))),
            const Positioned(
              left: 20,
              right: 20,
              bottom: 24,
              child: _Panel(
                child: Padding(
                  padding: EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'LOCAL OPPORTUNITY',
                        style: TextStyle(
                          color: _green,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Choose an area. Understand it. Put a campaign into action.',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Property signals • Weather context • Verified field work',
                        style: TextStyle(color: _muted),
                      ),
                    ],
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

class _HowItWorks extends StatelessWidget {
  const _HowItWorks();
  @override
  Widget build(BuildContext context) => const Column(
    children: [
      _Heading(
        eyebrow: 'HOW SCALEDCIRCLE WORKS',
        title: 'A simpler way to grow locally.',
        subtitle:
            'Start with your goal. ScaledCircle handles the complexity underneath.',
      ),
      SizedBox(height: 22),
      _Cards(
        children: [
          _Outcome(
            number: '1',
            icon: Icons.travel_explore,
            title: 'KNOW WHERE TO GROW',
            body:
                'Understand your service area and find places or moments worth marketing.',
          ),
          _Outcome(
            number: '2',
            icon: Icons.auto_awesome,
            title: 'CREATE YOUR MARKETING',
            body:
                'ScaledCircle helps prepare the marketing. You review and approve it.',
          ),
          _Outcome(
            number: '3',
            icon: Icons.rocket_launch_outlined,
            title: 'PUT IT INTO ACTION',
            body:
                'Publish digital marketing or hire verified local Scalers for real-world campaigns.',
          ),
        ],
      ),
    ],
  );
}

class _BusinessExperience extends StatelessWidget {
  const _BusinessExperience();
  @override
  Widget build(BuildContext context) => const Column(
    children: [
      _Heading(
        eyebrow: 'FOR BUSINESSES',
        title: 'See the opportunity before you spend.',
        subtitle:
            'Property and Weather Intelligence turn trustworthy local facts into clear next steps.',
      ),
      SizedBox(height: 22),
      _Cards(
        children: [
          _Example(
            label: 'PROPERTY OPPORTUNITY • EXAMPLE',
            icon: Icons.home_work_outlined,
            lines: [
              '422 homes analyzed',
              '86% built before 1980',
              'High older-home concentration',
              '98% coverage',
            ],
            action: 'Explore Property Intelligence',
            footnote: 'Included with Scale',
          ),
          _Example(
            label: 'WEATHER OPPORTUNITY • ILLUSTRATION',
            icon: Icons.thunderstorm_outlined,
            lines: [
              'Severe storm',
              'Anne Arundel County',
              'Exterior-service marketing may become more timely after the event.',
            ],
            action: 'See Weather Intelligence',
            footnote:
                'Official weather facts remain separate from AI interpretation.',
          ),
        ],
      ),
    ],
  );
}

class _ManagedGrowth extends StatelessWidget {
  const _ManagedGrowth();
  @override
  Widget build(BuildContext context) => _Panel(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: LayoutBuilder(
        builder: (context, c) {
          const copy = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'MANAGED GROWTH',
                style: TextStyle(color: _green, fontWeight: FontWeight.w900),
              ),
              SizedBox(height: 8),
              Text(
                'YOUR MARKETING, READY FOR YOUR APPROVAL.',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                ),
              ),
              SizedBox(height: 12),
              Text(
                'Tell ScaledCircle what your business does and where you work. ScaledCircle helps prepare your marketing. You review it before anything is published or launched.',
                style: TextStyle(color: _muted, height: 1.55),
              ),
            ],
          );
          return c.maxWidth > 760
              ? const Row(
                  children: [
                    Expanded(child: copy),
                    SizedBox(width: 28),
                    Expanded(child: _MiniCalendar()),
                  ],
                )
              : const Column(
                  children: [copy, SizedBox(height: 24), _MiniCalendar()],
                );
        },
      ),
    ),
  );
}

class _MiniCalendar extends StatelessWidget {
  const _MiniCalendar();
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Example weekly marketing approval calendar',
    child: Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF0B2034),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'THIS WEEK • EXAMPLE',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
          ),
          _CalendarRow(
            day: 'TUE',
            title: 'Facebook + Instagram • Deck Post',
            status: 'NEEDS REVIEW',
            color: Color(0xFFFFB34D),
          ),
          _CalendarRow(
            day: 'THU',
            title: 'Google Business • Fence Post',
            status: 'READY TO SCHEDULE',
            color: _blue,
          ),
          _CalendarRow(
            day: 'FRI',
            title: 'Local Campaign • 500 Homes',
            status: 'READY',
            color: _green,
          ),
          SizedBox(height: 8),
          Text(
            'Review This Week’s Marketing →',
            style: TextStyle(color: _green, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    ),
  );
}

class _CalendarRow extends StatelessWidget {
  const _CalendarRow({
    required this.day,
    required this.title,
    required this.status,
    required this.color,
  });
  final String day;
  final String title;
  final String status;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 14),
    child: Row(
      children: [
        SizedBox(
          width: 42,
          child: Text(
            day,
            style: const TextStyle(color: _muted, fontWeight: FontWeight.w700),
          ),
        ),
        Expanded(
          child: Text(title, style: const TextStyle(color: Colors.white)),
        ),
        const SizedBox(width: 8),
        Text(
          status,
          style: TextStyle(
            color: color,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

class _FieldCampaigns extends StatelessWidget {
  const _FieldCampaigns();
  @override
  Widget build(BuildContext context) => const Column(
    children: [
      _Heading(
        eyebrow: 'VERIFIED FIELD CAMPAIGNS',
        title: 'Put local marketing on the map.',
        subtitle:
            'Choose an area, fund the campaign securely, verify field work by GPS, and connect responses back to the campaign.',
      ),
      SizedBox(height: 22),
      _Cards(
        children: [
          _Outcome(
            number: '1',
            icon: Icons.map_outlined,
            title: 'CHOOSE THE AREA',
            body: 'Draw the territory and keep the campaign focused.',
          ),
          _Outcome(
            number: '2',
            icon: Icons.assignment_outlined,
            title: 'SET THE JOB',
            body: 'Define the work, materials, timing, and clear pay.',
          ),
          _Outcome(
            number: '3',
            icon: Icons.verified_outlined,
            title: 'VERIFY RESULTS',
            body:
                'GPS and proof confirm delivery. Response tracking shows what happened next.',
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
              'WORK WHERE YOU WANT.',
              style: TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Choose local opportunities that fit your schedule, travel preferences, and the kind of work you want to do.',
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'EXAMPLE LOCAL JOB',
                  style: TextStyle(color: _blue, fontWeight: FontWeight.w800),
                ),
                SizedBox(height: 10),
                Text(
                  'Flyer Distribution',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    Text('\$125', style: TextStyle(color: Colors.white)),
                    Text('8 miles away', style: TextStyle(color: _muted)),
                    Text(
                      '2.5 hours estimated',
                      style: TextStyle(color: _muted),
                    ),
                  ],
                ),
                SizedBox(height: 14),
                Text(
                  '✓ Matches your work area',
                  style: TextStyle(color: _green),
                ),
                SizedBox(height: 14),
                Text(
                  'View Job →',
                  style: TextStyle(color: _blue, fontWeight: FontWeight.w800),
                ),
              ],
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
  const _Pricing();
  @override
  Widget build(BuildContext context) => const Column(
    children: [
      _Heading(
        eyebrow: 'SIMPLE PRICING',
        title: 'Choose how much help you want.',
        subtitle:
            'Software access is clear. Variable campaign costs are approved separately.',
      ),
      SizedBox(height: 22),
      _Cards(
        children: [
          _Price(
            name: 'SCALE',
            price: '\$499/month',
            body: 'For businesses running local growth themselves.',
            features: [
              'Property and Weather Intelligence',
              'Campaign planning and tracking',
              'Business growth tools',
            ],
          ),
          _Price(
            name: 'MANAGED GROWTH',
            price: '\$999/month',
            badge: 'LIMITED BETA',
            body:
                'For businesses that want ScaledCircle helping prepare and coordinate ongoing marketing.',
            features: [
              'Everything in Scale',
              'Marketing drafts ready for approval',
              '30-day planning and coordination',
            ],
          ),
        ],
      ),
      SizedBox(height: 16),
      Text(
        'Scaler pay, advertising spend, printing, postage, and third-party vendors are separately approved and funded.',
        style: TextStyle(color: _muted),
        textAlign: TextAlign.center,
      ),
    ],
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

class _Example extends StatelessWidget {
  const _Example({
    required this.label,
    required this.icon,
    required this.lines,
    required this.action,
    required this.footnote,
  });
  final String label;
  final IconData icon;
  final List<String> lines;
  final String action;
  final String footnote;
  @override
  Widget build(BuildContext context) => _Panel(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: _green),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: _green,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (final line in lines)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                line,
                style: const TextStyle(color: Colors.white, fontSize: 17),
              ),
            ),
          const SizedBox(height: 8),
          Text(
            action,
            style: const TextStyle(color: _green, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          Text(footnote, style: const TextStyle(color: _muted, fontSize: 12)),
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
    this.badge,
  });
  final String name;
  final String price;
  final String body;
  final List<String> features;
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
