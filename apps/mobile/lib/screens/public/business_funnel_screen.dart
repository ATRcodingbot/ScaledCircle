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
        key: Key('business-step-weather'),
        step: 'OFFICIAL WEATHER FACTS',
        title: 'SEE WHAT CHANGED IN YOUR AREA.',
        body:
            'Official facts stay separate from the qualified marketing interpretation.',
        accent: businessGreen,
        visual: _WeatherVisual(),
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
    title: 'Business Dashboard',
    accent: businessGreen,
    label: 'PRODUCT WALKTHROUGH',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DemoBadge(label: 'EXAMPLE', color: businessGreen),
        SizedBox(height: 12),
        ProductLine('Main Service Area', 'Anne Arundel County'),
        ProductLine('Goal', 'Get more deck jobs', color: businessGreen),
        ProductLine('Current opportunity', 'Property Intelligence ready'),
        SizedBox(height: 12),
        _PrimaryActionPreview(
          icon: Icons.analytics_outlined,
          label: 'Analyze Main Service Area',
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
      StatusPill('Find Opportunity', color: businessGreen, icon: Icons.search),
      StatusPill(
        'Create Marketing',
        color: businessGreen,
        icon: Icons.auto_awesome_outlined,
      ),
      StatusPill(
        'Launch Campaign',
        color: businessGreen,
        icon: Icons.rocket_launch_outlined,
      ),
      StatusPill(
        'Review Results',
        color: businessGreen,
        icon: Icons.verified_outlined,
      ),
    ],
  );
}

class _PrimaryActionPreview extends StatelessWidget {
  const _PrimaryActionPreview({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
    decoration: BoxDecoration(
      color: businessGreen,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, color: publicBackground, size: 19),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: publicBackground,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    ),
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
        ProductLine('What do you want more of?', 'Deck Jobs'),
        ProductLine('Where?', 'Main Service Area'),
        ProductLine('Area', 'Anne Arundel County', color: businessGreen),
        ProductLine('Source', 'Reviewed property data'),
        ProductLine('Confidence', 'High coverage'),
        SizedBox(height: 12),
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
              'Property Age Signal',
              'High older-stock concentration',
            ),
            (
              Icons.lightbulb_outline,
              'What it could mean',
              'May support broad deck / fence outreach',
            ),
            (
              Icons.arrow_forward,
              'Important limit',
              'Does not identify homes that need work',
            ),
          ],
        ),
        SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill('Create Flyer Campaign', color: businessGreen),
            StatusPill('Create Social Posts', color: businessGreen),
            StatusPill('Ask AI More', color: publicMuted),
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
    title: 'Social Preview',
    accent: businessGreen,
    label: 'EXAMPLE PREVIEW',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill('Facebook Preview', color: businessGreen),
            StatusPill('Instagram Preview', color: publicMuted),
          ],
        ),
        SizedBox(height: 12),
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
          'Facebook / Instagram connection requires approval.',
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
    label: 'EXAMPLE',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _MapLayers(),
        SizedBox(height: 14),
        ProductLine('Service Area', 'Anne Arundel County'),
        ProductLine('Goal', 'Get more deck estimates'),
        ProductLine('Flyers', '500'),
        ProductLine('Campaign target', 'Local residential target'),
        ProductLine('Zone 1', 'Mapped', color: scalerBlue),
        ProductLine('Route', 'Not yet verified'),
        ProductLine('Scaler Pay', '\$50.00'),
        SizedBox(height: 10),
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
    child: Semantics(
      label:
          'Product map preview showing a broad Service Area, a smaller Campaign Target, and Zone 1 inside the target',
      image: true,
      child: SizedBox(
        height: 240,
        width: double.infinity,
        child: CustomPaint(painter: _CampaignMapPainter()),
      ),
    ),
  );
}

class _WeatherVisual extends StatelessWidget {
  const _WeatherVisual();

  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Weather Intelligence',
    accent: businessGreen,
    label: 'SAMPLE SCENARIO',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.cloud_outlined, color: businessGreen, size: 30),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Official weather facts',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 12),
        ProductLine('Service Area', 'Main Service Area'),
        ProductLine('Area relevance', 'Inside your operating territory'),
        ProductLine('Official fact status', 'Sample scenario only'),
        SizedBox(height: 10),
        Text(
          'ScaledCircle can qualify what an official event could mean for broad local marketing. It does not claim individual property damage or need.',
          style: TextStyle(color: publicMuted, fontSize: 12, height: 1.4),
        ),
      ],
    ),
  );
}

class _CampaignMapPainter extends CustomPainter {
  const _CampaignMapPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF102536),
    );
    final water = Path()
      ..moveTo(size.width * .76, 0)
      ..cubicTo(
        size.width * .69,
        size.height * .25,
        size.width * .84,
        size.height * .55,
        size.width * .73,
        size.height,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(water, Paint()..color = const Color(0xFF123A55));
    canvas.drawCircle(
      Offset(size.width * .18, size.height * .24),
      size.width * .16,
      Paint()..color = const Color(0xFF173C35),
    );
    canvas.drawCircle(
      Offset(size.width * .5, size.height * .78),
      size.width * .12,
      Paint()..color = const Color(0xFF173C35),
    );
    final road = Paint()
      ..color = const Color(0xFF557084)
      ..strokeWidth = 2.2
      ..style = PaintingStyle.stroke;
    final arterial = Path()
      ..moveTo(0, size.height * .72)
      ..cubicTo(
        size.width * .25,
        size.height * .55,
        size.width * .48,
        size.height * .42,
        size.width * .8,
        size.height * .2,
      );
    canvas.drawPath(arterial, road..strokeWidth = 4);
    for (final branch in <Path>[
      Path()
        ..moveTo(size.width * .12, size.height)
        ..quadraticBezierTo(
          size.width * .24,
          size.height * .58,
          size.width * .42,
          0,
        ),
      Path()
        ..moveTo(size.width * .3, size.height * .64)
        ..quadraticBezierTo(
          size.width * .58,
          size.height * .8,
          size.width * .7,
          size.height,
        ),
      Path()
        ..moveTo(size.width * .08, size.height * .28)
        ..quadraticBezierTo(
          size.width * .38,
          size.height * .18,
          size.width * .72,
          size.height * .4,
        ),
    ]) {
      canvas.drawPath(branch, road..strokeWidth = 2);
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
    _drawMapLabel(
      canvas,
      'SERVICE AREA',
      Offset(size.width * .1, size.height * .1),
      publicMuted,
    );
    _drawMapLabel(
      canvas,
      'TARGET AREA',
      Offset(size.width * .54, size.height * .72),
      businessGreen,
    );
    _drawMapLabel(
      canvas,
      'ZONE 1',
      Offset(size.width * .34, size.height * .43),
      scalerBlue,
    );
  }

  void _drawMapLabel(Canvas canvas, String text, Offset offset, Color color) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final background = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        offset.dx - 5,
        offset.dy - 4,
        painter.width + 10,
        painter.height + 8,
      ),
      const Radius.circular(6),
    );
    canvas.drawRRect(
      background,
      Paint()..color = publicBackground.withValues(alpha: .84),
    );
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _VerificationVisual extends StatelessWidget {
  const _VerificationVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Zone 1 • Field Execution',
    accent: businessGreen,
    label: 'WORKFLOW PREVIEW',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        WorkflowRail(
          accent: businessGreen,
          steps: [
            (Icons.inventory_2_outlined, 'Materials', 'Received ✓'),
            (Icons.person_pin_circle_outlined, 'Scaler', 'Assigned'),
            (Icons.gps_fixed, 'Active Work', 'GPS verification'),
            (Icons.verified_outlined, 'Coverage', 'Submitted'),
            (Icons.fact_check_outlined, 'Completion', 'Under Review'),
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
    title: 'Flyer Distribution Results',
    accent: businessGreen,
    label: 'SAMPLE RESULTS',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            MetricTile(
              label: 'Distribution',
              value: '500 / 500',
              icon: Icons.verified_outlined,
              accent: businessGreen,
            ),
            MetricTile(
              label: 'Coverage',
              value: 'Verified',
              icon: Icons.gps_fixed,
              accent: businessGreen,
            ),
          ],
        ),
        SizedBox(height: 12),
        ProductLine('QR responses', 'Sample: 18'),
        ProductLine('Calls', 'Sample: 6'),
        ProductLine('Estimate requests', 'Sample: 7'),
        Text(
          'Example reporting view — not live customer performance.',
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
