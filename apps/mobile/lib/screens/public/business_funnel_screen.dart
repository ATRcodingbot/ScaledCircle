import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';
import '../../services/subscription_plan_service.dart';
import 'public_funnel_components.dart';

class BusinessFunnelScreen extends StatelessWidget {
  const BusinessFunnelScreen({super.key});

  static const _plans = ['starter', 'growth', 'scale', 'managed_growth'];

  @override
  Widget build(BuildContext context) => FunnelPage(
    accent: businessGreen,
    semanticsLabel: 'ScaledCircle for Local Businesses',
    children: [
      FunnelHero(
        eyebrow: 'FOR LOCAL BUSINESSES',
        title: 'SEE WHERE GROWTH CAN HAPPEN.',
        body: 'Find the opportunity. Build the campaign. See the work happen.',
        primaryLabel: 'Create Business Account',
        secondaryLabel: 'Join Business Waitlist',
        accent: businessGreen,
        onPrimary: () => openPublicAccountRegistration(context, 'business'),
        onSecondary: () => openPublicWaitlist(context, 'business'),
        visual: const _BusinessHeroVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-setup'),
        step: 'STEP 1',
        title: 'YOUR BUSINESS, READY TO REUSE.',
        body:
            'Services, goals, and operating areas stay together for the next decision.',
        accent: businessGreen,
        visual: _BusinessProfileVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-intelligence'),
        step: 'STEP 2',
        title: 'FIND THE LOCAL SIGNAL.',
        body:
            'Compare broad property and official weather facts before choosing where to market.',
        accent: businessGreen,
        reverse: true,
        visual: _IntelligenceVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-marketing'),
        step: 'STEP 3',
        title: 'TURN THE SIGNAL INTO MARKETING.',
        body:
            'Create, preview, edit, and approve—always with your business context in view.',
        accent: businessGreen,
        visual: _SocialVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-campaigns'),
        step: 'STEP 4',
        title: 'CHOOSE A PRACTICAL TARGET.',
        body:
            'Start with where you operate. Narrow it to this campaign. Give each Scaler a clear Zone.',
        accent: businessGreen,
        reverse: true,
        visual: _CampaignMapVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-verification'),
        step: 'STEP 5',
        title: 'WATCH THE WORK MOVE.',
        body:
            'Materials, assignment, active-work verification, and completion stay visible.',
        accent: businessGreen,
        visual: _VerificationVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-results'),
        step: 'STEP 6',
        title: 'SEE THE RESPONSE.',
        body:
            'Connect supported scans, calls, links, and requests back to the campaign.',
        accent: businessGreen,
        reverse: true,
        visual: _ResultsVisual(),
      ),
      const _ManagedGrowthBand(),
      _BusinessPricing(
        onStart: () => openPublicAccountRegistration(context, 'business'),
      ),
      FunnelFinalCta(
        title: 'READY TO GROW LOCALLY?',
        primary: 'Create My Business Account',
        accent: businessGreen,
        supportingCopy:
            'Create your ScaledCircle account now. Marketplace access is being rolled out in stages.',
        waitlistLabel: 'Join Business Waitlist',
        onPrimary: () => openPublicAccountRegistration(context, 'business'),
        onWaitlist: () => openPublicWaitlist(context, 'business'),
      ),
    ],
  );
}

class _BusinessHeroVisual extends StatelessWidget {
  const _BusinessHeroVisual();
  @override
  Widget build(BuildContext context) => ProductWindow(
    title: 'Local Growth Workspace',
    accent: businessGreen,
    label: 'PRODUCT WALKTHROUGH',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: MetricTile(
                label: 'Service areas',
                value: '2',
                icon: Icons.map_outlined,
                accent: businessGreen,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                label: 'Next action',
                value: 'Target',
                icon: Icons.ads_click,
                accent: businessGreen,
              ),
            ),
          ],
        ),
        SizedBox(height: 14),
        _GrowthJourneyStrip(),
      ],
    ),
  );
}

class _GrowthJourneyStrip extends StatelessWidget {
  const _GrowthJourneyStrip();
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 7,
    runSpacing: 7,
    children: const [
      StatusPill('Find', color: businessGreen, icon: Icons.search),
      StatusPill(
        'Target',
        color: businessGreen,
        icon: Icons.location_on_outlined,
      ),
      StatusPill(
        'Launch',
        color: businessGreen,
        icon: Icons.rocket_launch_outlined,
      ),
      StatusPill('Verify', color: businessGreen, icon: Icons.verified_outlined),
    ],
  );
}

class _BusinessProfileVisual extends StatelessWidget {
  const _BusinessProfileVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Business Growth Profile',
    accent: businessGreen,
    label: 'SAMPLE SETUP',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill('Decks', color: businessGreen),
            StatusPill('Fences', color: businessGreen),
            StatusPill('Remodeling', color: businessGreen),
          ],
        ),
        SizedBox(height: 16),
        ProductLine('Main Service Area', 'Anne Arundel County'),
        ProductLine('Second Area', 'Howard County'),
        ProductLine(
          'Growth goal',
          'More estimate requests',
          color: businessGreen,
        ),
      ],
    ),
  );
}

class _IntelligenceVisual extends StatelessWidget {
  const _IntelligenceVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Area + Goal Intelligence',
    accent: businessGreen,
    label: 'EXAMPLE • BROAD AREA DATA',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: MetricTile(
                label: 'Properties reviewed',
                value: '422',
                icon: Icons.home_work_outlined,
                accent: businessGreen,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                label: 'Data coverage',
                value: '98%',
                icon: Icons.donut_large,
                accent: businessGreen,
              ),
            ),
          ],
        ),
        SizedBox(height: 14),
        WorkflowRail(
          accent: businessGreen,
          steps: [
            (
              Icons.fact_check_outlined,
              'What we know',
              'Broad housing-stock patterns',
            ),
            (
              Icons.lightbulb_outline,
              'What it could mean',
              'Qualified local opportunity',
            ),
            (
              Icons.arrow_forward,
              'What to do next',
              'Choose a campaign target',
            ),
          ],
        ),
      ],
    ),
  );
}

class _SocialVisual extends StatelessWidget {
  const _SocialVisual();
  @override
  Widget build(BuildContext context) => ProductWindow(
    title: 'Campaign Creative',
    accent: businessGreen,
    label: 'EXAMPLE PREVIEW',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          constraints: const BoxConstraints(minHeight: 104),
          padding: EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Color(0xFF0B2034),
            borderRadius: BorderRadius.all(Radius.circular(14)),
          ),
          child: Row(
            children: [
              Container(
                width: 74,
                decoration: BoxDecoration(
                  color: Color(0x3322E6A1),
                  borderRadius: BorderRadius.all(Radius.circular(10)),
                ),
                child: Icon(
                  Icons.deck_outlined,
                  color: businessGreen,
                  size: 34,
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Ready for the backyard?',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 5),
                    Text(
                      'Local deck & fence estimate campaign',
                      style: TextStyle(color: publicMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill('Create', color: businessGreen),
            StatusPill('Preview', color: businessGreen),
            StatusPill('Edit', color: businessGreen),
            StatusPill('Approve', color: businessGreen),
          ],
        ),
        SizedBox(height: 12),
        Text(
          'Provider connection required before publishing.',
          style: TextStyle(color: publicMuted, fontSize: 12),
        ),
      ],
    ),
  );
}

class _CampaignMapVisual extends StatelessWidget {
  const _CampaignMapVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Flyer Distribution Target',
    accent: businessGreen,
    label: 'MAP CONCEPT',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MapLayers(),
        SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill('Service Area', color: publicMuted),
            StatusPill('Campaign Target', color: businessGreen),
            StatusPill('Scaler Zone', color: scalerBlue),
          ],
        ),
      ],
    ),
  );
}

class _MapLayers extends StatelessWidget {
  const _MapLayers();
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(16),
    child: SizedBox(
      height: 220,
      width: double.infinity,
      child: CustomPaint(painter: _CampaignMapPainter()),
    ),
  );
}

class _CampaignMapPainter extends CustomPainter {
  const _CampaignMapPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF0B2034),
    );
    final road = Paint()
      ..color = const Color(0xFF17344B)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    for (final y in [42.0, 102.0, 170.0]) {
      final p = Path()
        ..moveTo(0, y)
        ..cubicTo(
          size.width * .3,
          y - 24,
          size.width * .65,
          y + 28,
          size.width,
          y - 8,
        );
      canvas.drawPath(p, road);
    }
    final service = Path()
      ..moveTo(size.width * .08, size.height * .2)
      ..lineTo(size.width * .38, size.height * .08)
      ..lineTo(size.width * .86, size.height * .22)
      ..lineTo(size.width * .92, size.height * .72)
      ..lineTo(size.width * .58, size.height * .92)
      ..lineTo(size.width * .16, size.height * .78)
      ..close();
    canvas.drawPath(
      service,
      Paint()..color = publicMuted.withValues(alpha: .04),
    );
    canvas.drawPath(
      service,
      Paint()
        ..color = publicMuted.withValues(alpha: .7)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    final target = Path()
      ..moveTo(size.width * .28, size.height * .34)
      ..lineTo(size.width * .7, size.height * .25)
      ..lineTo(size.width * .8, size.height * .63)
      ..lineTo(size.width * .5, size.height * .79)
      ..lineTo(size.width * .22, size.height * .62)
      ..close();
    canvas.drawPath(
      target,
      Paint()..color = businessGreen.withValues(alpha: .18),
    );
    canvas.drawPath(
      target,
      Paint()
        ..color = businessGreen
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5,
    );
    final zone = Path()
      ..moveTo(size.width * .32, size.height * .4)
      ..lineTo(size.width * .53, size.height * .35)
      ..lineTo(size.width * .6, size.height * .66)
      ..lineTo(size.width * .38, size.height * .7)
      ..close();
    canvas.drawPath(zone, Paint()..color = scalerBlue.withValues(alpha: .28));
    canvas.drawPath(
      zone,
      Paint()
        ..color = scalerBlue
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    canvas.drawCircle(
      Offset(size.width * .46, size.height * .53),
      6,
      Paint()..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _VerificationVisual extends StatelessWidget {
  const _VerificationVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Campaign Execution',
    accent: businessGreen,
    label: 'WORKFLOW PREVIEW',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        WorkflowRail(
          accent: businessGreen,
          steps: [
            (
              Icons.inventory_2_outlined,
              'Materials ready',
              'Handoff confirmed',
            ),
            (
              Icons.person_pin_circle_outlined,
              'Zone assigned',
              'Scaler has the Job Room',
            ),
            (Icons.gps_fixed, 'Active work', 'GPS / coverage verification'),
            (
              Icons.verified_outlined,
              'Completion review',
              'Proof ready to review',
            ),
          ],
        ),
      ],
    ),
  );
}

class _ResultsVisual extends StatelessWidget {
  const _ResultsVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Campaign Response',
    accent: businessGreen,
    label: 'SAMPLE REPORT',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            MetricTile(
              label: 'QR scans',
              value: '18',
              icon: Icons.qr_code_2,
              accent: businessGreen,
            ),
            MetricTile(
              label: 'Requests',
              value: '7',
              icon: Icons.mark_email_read_outlined,
              accent: businessGreen,
            ),
            MetricTile(
              label: 'Proof status',
              value: 'Ready',
              icon: Icons.verified_outlined,
              accent: businessGreen,
            ),
          ],
        ),
        SizedBox(height: 12),
        Text(
          'Sample reporting view — not live campaign activity.',
          style: TextStyle(color: publicMuted, fontSize: 12),
        ),
      ],
    ),
  );
}

class _ManagedGrowthBand extends StatelessWidget {
  const _ManagedGrowthBand();
  @override
  Widget build(BuildContext context) => const FunnelSection(
    key: Key('business-managed-growth'),
    step: 'MANAGED GROWTH',
    title: 'WANT SCALEDCIRCLE TO HELP PREPARE THE MARKETING?',
    body:
        'ScaledCircle helps prepare ongoing marketing from your Business Profile, Service Areas, goals, and local intelligence. You keep review and approval control.',
    accent: businessGreen,
    visual: ProductPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('THIS WEEK', style: _panelTitle),
          ProductLine('Social post', 'Needs Review'),
          ProductLine('SEO action', 'Ready'),
          ProductLine('Local campaign', 'Planning'),
          ProductLine('Property opportunity', 'New', color: businessGreen),
        ],
      ),
    ),
  );
}

class _BusinessPricing extends StatelessWidget {
  const _BusinessPricing({required this.onStart});
  final VoidCallback onStart;
  @override
  Widget build(BuildContext context) {
    final cards = BusinessFunnelScreen._plans.map((id) {
      final plan = SubscriptionPlanService.plans[id]!;
      return SizedBox(
        width: 250,
        child: ProductPanel(
          accent: id == 'managed_growth' ? businessGreen : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(plan['name'].toString().toUpperCase(), style: _panelTitle),
              const SizedBox(height: 8),
              Text(
                '\$${(plan['price'] as num).toStringAsFixed(0)}/month',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                ),
              ),
              if (id == 'managed_growth')
                const Text(
                  'LIMITED BETA',
                  style: TextStyle(
                    color: businessGreen,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              const SizedBox(height: 12),
              Text(
                _planCopy[id]!,
                style: const TextStyle(color: publicMuted, height: 1.4),
              ),
              const SizedBox(height: 14),
              OutlinedButton(
                onPressed: onStart,
                child: const Text('Get Started'),
              ),
            ],
          ),
        ),
      );
    }).toList();
    return Padding(
      key: const Key('business-pricing'),
      padding: const EdgeInsets.symmetric(vertical: 44),
      child: Column(
        children: [
          const Text(
            'PLANS FOR EACH STAGE OF GROWTH',
            style: TextStyle(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            alignment: WrapAlignment.center,
            children: cards,
          ),
          const SizedBox(height: 16),
          const Text(
            'Scaler pay, advertising, printing, postage, and third-party vendor costs are approved separately.',
            textAlign: TextAlign.center,
            style: TextStyle(color: publicMuted),
          ),
          TextButton(
            onPressed: () => Navigator.pushNamed(context, AppRoutes.businesses),
            child: const Text('View Pricing'),
          ),
        ],
      ),
    );
  }

  static const _planCopy = {
    'starter': 'Start running clear, verified local campaigns.',
    'growth': 'Add stronger planning, content, and response tracking.',
    'scale': 'Use advanced local intelligence and operating capability.',
    'managed_growth': 'Have ScaledCircle help prepare ongoing marketing.',
  };
}

const _panelTitle = TextStyle(
  color: Colors.white,
  fontWeight: FontWeight.w900,
  letterSpacing: .6,
);
