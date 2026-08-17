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
        title: 'GROW YOUR BUSINESS LOCALLY.',
        body:
            'Know where to market. Know what to say. Put your marketing into action. ScaledCircle combines local intelligence, marketing tools, and verified field campaigns in one system.',
        primaryLabel: 'Start Growing',
        secondaryLabel: 'See How It Works',
        accent: businessGreen,
        onPrimary: () => openPublicAccountRegistration(context, 'business'),
        onSecondary: () => _showSection(context, 'START WITH YOUR BUSINESS.'),
        visual: const _BusinessProfileVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-setup'),
        step: 'STEP 1',
        title: 'START WITH YOUR BUSINESS.',
        body:
            'Tell ScaledCircle what you do, what work you want more of, and where you work. Your Growth Profile, goals, and Service Areas are remembered so you do not have to start over each time.',
        accent: businessGreen,
        visual: _BusinessProfileVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-intelligence'),
        step: 'STEP 2',
        title: 'KNOW WHERE TO MARKET.',
        body:
            'Property Intelligence, official Weather Intelligence, saved Service Areas, and qualified AI interpretation help you understand an area before spending marketing money. Facts stay separate from interpretation; broad housing patterns never prove that a particular home needs your service.',
        accent: businessGreen,
        reverse: true,
        visual: _IntelligenceVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-marketing'),
        step: 'STEP 3',
        title: 'CREATE THE MARKETING.',
        body:
            'Prepare Social Content, SEO actions, advertising plans, email content, postcard planning, 30-day growth plans, and Business Growth Analysis. ScaledCircle reuses your approved business context. You preview, edit, and approve—nothing is falsely represented as published.',
        accent: businessGreen,
        visual: _SocialVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-campaigns'),
        step: 'STEP 4',
        title: 'TURN MARKETING INTO REAL ACTION.',
        body:
            'Launch supported field campaigns with Scalers. Reuse a broad Service Area, choose a practical campaign Target Area, then define the Zone a Scaler covers. Flyer Distribution, supported material distribution, pickup and handoff, and explicitly consented outreach remain distinct workflows.',
        accent: businessGreen,
        reverse: true,
        visual: _CampaignMapVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-verification'),
        step: 'STEP 5',
        title: 'KNOW THE WORK ACTUALLY HAPPENED.',
        body:
            'Use the Job Room, readiness and material handoff, active-work GPS verification, coverage and checkpoint proof where required, completion workflows, and Scaler verification—without learning the implementation underneath.',
        accent: businessGreen,
        visual: _VerificationVisual(),
      ),
      const FunnelSection(
        key: Key('business-step-results'),
        step: 'STEP 6',
        title: 'CONNECT THE RESPONSE BACK TO THE CAMPAIGN.',
        body:
            'Track what generated the response with supported QR codes, campaign links, landing pages, phone and email attribution, response reporting, and campaign results.',
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

  void _showSection(BuildContext context, String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _BusinessProfileVisual extends StatelessWidget {
  const _BusinessProfileVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    accent: businessGreen,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('BUSINESS GROWTH PROFILE', style: _panelTitle),
        ProductLine('Services', 'Decks • Fences • Remodeling'),
        ProductLine('Service Areas', 'Anne Arundel • Howard County'),
        ProductLine('Goal', 'Get more estimate requests', color: businessGreen),
      ],
    ),
  );
}

class _IntelligenceVisual extends StatelessWidget {
  const _IntelligenceVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('PROPERTY INTELLIGENCE • EXAMPLE', style: _panelTitle),
        ProductLine('Goal', 'Get more deck jobs'),
        ProductLine('Area', 'Main Service Area'),
        Divider(color: publicBorder),
        ProductLine('Properties analyzed', '422'),
        ProductLine('Built before 1980', '86%'),
        ProductLine('Coverage', '98%', color: businessGreen),
        SizedBox(height: 8),
        Text(
          'What We Know → What It Could Mean → What You Can Do Next',
          style: TextStyle(color: publicMuted),
        ),
      ],
    ),
  );
}

class _SocialVisual extends StatelessWidget {
  const _SocialVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('SOCIAL PREVIEW • EXAMPLE', style: _panelTitle),
        Text(
          'Create  →  Preview  →  Edit  →  Approve',
          style: TextStyle(color: businessGreen, fontWeight: FontWeight.w800),
        ),
        ProductLine('Facebook / Instagram', 'Connection requires approval'),
        ProductLine('Google Business / LinkedIn', 'Coming Soon'),
        Text(
          'No post is published without real provider capability and your approval.',
          style: TextStyle(color: publicMuted),
        ),
      ],
    ),
  );
}

class _CampaignMapVisual extends StatelessWidget {
  const _CampaignMapVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('CAMPAIGN MAP', style: _panelTitle),
        ProductLine('SERVICE AREA', 'Where your business operates'),
        ProductLine(
          'TARGET AREA',
          'Where this campaign runs',
          color: businessGreen,
        ),
        ProductLine('ZONE', 'What one Scaler covers'),
        SizedBox(height: 10),
        _MapLayers(),
      ],
    ),
  );
}

class _MapLayers extends StatelessWidget {
  const _MapLayers();
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 150,
    child: Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Color(0xFF0B2034),
              borderRadius: BorderRadius.all(Radius.circular(14)),
            ),
          ),
        ),
        Positioned(
          left: 26,
          top: 18,
          right: 20,
          bottom: 18,
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border.fromBorderSide(BorderSide(color: publicMuted)),
              borderRadius: BorderRadius.all(Radius.circular(40)),
            ),
          ),
        ),
        Positioned(
          left: 75,
          top: 48,
          width: 190,
          height: 72,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Color(0x3314E39A),
              border: Border.fromBorderSide(BorderSide(color: businessGreen)),
              borderRadius: BorderRadius.all(Radius.circular(28)),
            ),
          ),
        ),
        Positioned(
          left: 118,
          top: 64,
          width: 74,
          height: 42,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Color(0x55287EFF),
              border: Border.fromBorderSide(BorderSide(color: scalerBlue)),
              borderRadius: BorderRadius.all(Radius.circular(14)),
            ),
          ),
        ),
      ],
    ),
  );
}

class _VerificationVisual extends StatelessWidget {
  const _VerificationVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('JOB ROOM', style: _panelTitle),
        ProductLine('Materials', 'Handoff confirmed'),
        ProductLine('Active work', 'GPS verification on'),
        ProductLine('Coverage proof', 'Ready for review'),
        ProductLine('Completion', 'Verified', color: businessGreen),
      ],
    ),
  );
}

class _ResultsVisual extends StatelessWidget {
  const _ResultsVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('CAMPAIGN RESULTS • EXAMPLE', style: _panelTitle),
        ProductLine('QR responses', '18'),
        ProductLine('Landing-page requests', '7'),
        ProductLine('Attributed calls', 'Supported campaigns'),
        Text(
          'Track what generated the response.',
          style: TextStyle(color: businessGreen, fontWeight: FontWeight.w800),
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
