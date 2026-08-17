import 'package:flutter/material.dart';

import 'authentic_product_map.dart';
import 'public_funnel_components.dart';

class ScalerFunnelScreen extends StatelessWidget {
  const ScalerFunnelScreen({super.key});

  @override
  Widget build(BuildContext context) => FunnelPage(
    accent: scalerBlue,
    semanticsLabel: 'ScaledCircle for Scalers',
    children: [
      FunnelHero(
        eyebrow: 'FOR SCALERS',
        title: 'LOCAL WORK. CLEAR FROM THE START.',
        body:
            'See the area, the task, the materials, and the pay before you apply.',
        primaryLabel: 'Create Scaler Account',
        secondaryLabel: 'Join Scaler Waitlist',
        accent: scalerBlue,
        onPrimary: () => openPublicAccountRegistration(context, 'scaler'),
        onSecondary: () => openPublicWaitlist(context, 'scaler'),
        visual: const _ScalerHeroVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-preferences'),
        step: 'STEP 1',
        title: 'WORK WHERE YOU WANT.',
        body:
            'Save where you want to work and the opportunities you want to hear about.',
        accent: scalerBlue,
        visual: _WorkAreaVisual(),
      ),
      const _AlertsBand(),
      const FunnelSection(
        key: Key('scaler-step-jobs'),
        step: 'STEP 2',
        title: 'SEE THE JOB BEFORE YOU TAKE IT.',
        body:
            'Job details, materials, deadline, area, and pay are together before you apply.',
        accent: scalerBlue,
        reverse: true,
        visual: _JobCardVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-area'),
        step: 'STEP 3',
        title: 'KNOW WHERE THE JOB IS.',
        body:
            'See your mapped Zone and an honest route status—never invented walking metrics.',
        accent: scalerBlue,
        visual: _ZoneVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-job-room'),
        step: 'STEP 4',
        title: 'EVERYTHING YOU NEED FOR THE JOB.',
        body:
            'Messages, materials, handoff, readiness, and support stay in one private workspace.',
        accent: scalerBlue,
        reverse: true,
        visual: _JobRoomVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-proof'),
        step: 'STEP 5',
        title: 'DO THE WORK. BUILD A VERIFIED HISTORY.',
        body:
            'Active-work verification and completion proof build a trusted work history.',
        accent: scalerBlue,
        visual: _ProofVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-earnings'),
        step: 'STEP 6',
        title: 'SEE WHAT YOU’RE EARNING.',
        body:
            'Follow job pay from completion through verification and the approved payment workflow.',
        accent: scalerBlue,
        reverse: true,
        visual: _EarningsVisual(),
      ),
      const _CrewAndTrustBand(),
      FunnelFinalCta(
        title: 'READY TO FIND LOCAL WORK?',
        primary: 'Create Scaler Account',
        accent: scalerBlue,
        supportingCopy:
            "Set up your ScaledCircle account now and we'll let you know as access becomes available.",
        waitlistLabel: 'Join Scaler Waitlist',
        onPrimary: () => openPublicAccountRegistration(context, 'scaler'),
        onWaitlist: () => openPublicWaitlist(context, 'scaler'),
      ),
    ],
  );
}

class _ScalerHeroVisual extends StatelessWidget {
  const _ScalerHeroVisual();
  @override
  Widget build(BuildContext context) => ProductWindow(
    title: 'Flyer Distribution',
    accent: scalerBlue,
    label: 'SAMPLE JOB',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.local_shipping_outlined, color: scalerBlue),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Flyer Distribution',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 8),
        Text(
          'Anne Arundel County • Inside your Work Area',
          style: TextStyle(color: publicMuted, fontSize: 12),
        ),
        ProductLine('Job pay', '\$125', color: scalerBlue),
        ProductLine('Flyers', '500'),
        ProductLine('Materials', 'Pickup required'),
        ProductLine('Deadline', 'Friday, 5 PM'),
        ProductLine('Route', 'Not yet verified'),
        SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill(
              'View Job',
              color: scalerBlue,
              icon: Icons.arrow_forward,
            ),
          ],
        ),
      ],
    ),
  );
}

class _WorkAreaVisual extends StatelessWidget {
  const _WorkAreaVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'My Work Areas + Preferences',
    accent: scalerBlue,
    label: 'SAMPLE SETUP',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: MetricTile(
                label: 'Work areas',
                value: '2',
                icon: Icons.map_outlined,
                accent: scalerBlue,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                label: 'Travel range',
                value: '20 mi',
                icon: Icons.near_me_outlined,
                accent: scalerBlue,
              ),
            ),
          ],
        ),
        SizedBox(height: 14),
        ProductLine('Baltimore County', 'Enabled', color: scalerBlue),
        ProductLine('Anne Arundel County', 'Enabled', color: scalerBlue),
        SizedBox(height: 14),
        Text(
          'WHAT KIND OF WORK DO YOU WANT?',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w900,
            fontSize: 12,
          ),
        ),
        SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill('✓ Flyer Distribution', color: scalerBlue),
            StatusPill('✓ Door Hanger Distribution', color: scalerBlue),
            StatusPill('✓ Material Pickup', color: scalerBlue),
            StatusPill('✓ Short Local Jobs', color: scalerBlue),
            StatusPill('Scaler Crew • Limited rollout', color: publicMuted),
          ],
        ),
        SizedBox(height: 12),
        ProductLine('Door-to-Door Outreach', 'Off • explicit opt-in'),
      ],
    ),
  );
}

class _AlertsBand extends StatelessWidget {
  const _AlertsBand();
  @override
  Widget build(BuildContext context) => const FunnelSection(
    key: Key('scaler-alerts'),
    step: 'MATCHING JOB ALERTS',
    title: 'HEAR ABOUT WORK THAT FITS.',
    body:
        'Choose how matching opportunities reach you. Search All Jobs remains available.',
    accent: scalerBlue,
    reverse: true,
    visual: ProductWindow(
      title: 'Job Alerts',
      accent: scalerBlue,
      label: 'PREFERENCES',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProductLine('In ScaledCircle', 'On', color: scalerBlue),
          ProductLine('Email alerts', 'Optional'),
          ProductLine('Push', 'Coming Soon'),
        ],
      ),
    ),
  );
}

class _JobCardVisual extends StatelessWidget {
  const _JobCardVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Flyer Distribution',
    accent: scalerBlue,
    label: 'SAMPLE',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: MetricTile(
                label: 'Job pay',
                value: '\$125',
                icon: Icons.payments_outlined,
                accent: scalerBlue,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                label: 'Deadline',
                value: 'Fri 5 PM',
                icon: Icons.schedule,
                accent: scalerBlue,
              ),
            ),
          ],
        ),
        SizedBox(height: 14),
        ProductLine('Materials', 'Pickup required'),
        ProductLine('Match', 'Inside your Work Area', color: scalerBlue),
        ProductLine('Route', 'Not yet verified'),
        SizedBox(height: 8),
        StatusPill('View job', color: scalerBlue, icon: Icons.arrow_forward),
      ],
    ),
  );
}

class _ZoneVisual extends StatelessWidget {
  const _ZoneVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Your Assigned Work Area',
    accent: scalerBlue,
    label: 'SAMPLE ACTIVE WORK',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ScalerZoneMap(),
        SizedBox(height: 8),
        Text(
          'EXAMPLE ACTIVE-WORK GPS EVIDENCE',
          style: TextStyle(
            color: businessGreen,
            fontSize: 11,
            fontWeight: FontWeight.w900,
          ),
        ),
        SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill(
              'ASSIGNED ZONE • Zone 1',
              color: scalerBlue,
              icon: Icons.crop_free,
            ),
          ],
        ),
        ProductLine('GPS verification', 'Active', color: businessGreen),
        ProductLine('Position evidence', 'Recording during active work'),
        ProductLine('Route', 'Not yet verified'),
        ProductLine('Coverage', 'Recording'),
        SizedBox(height: 8),
        Text(
          'Your assigned Zone stays visible while ScaledCircle records GPS evidence during active work.',
          style: TextStyle(color: publicMuted, fontSize: 12, height: 1.35),
        ),
      ],
    ),
  );
}

class _ScalerZoneMap extends StatelessWidget {
  const _ScalerZoneMap();
  @override
  Widget build(BuildContext context) => const AuthenticProductMap(
    mode: PublicProductMapMode.activeWork,
    height: 210,
  );
}

class _JobRoomVisual extends StatelessWidget {
  const _JobRoomVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Job Room',
    accent: scalerBlue,
    label: 'WORKSPACE PREVIEW',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        WorkflowRail(
          accent: scalerBlue,
          steps: [
            (
              Icons.chat_bubble_outline,
              'Business message',
              '“Materials will be ready at 8 AM.”',
            ),
            (Icons.inventory_2_outlined, 'Materials', 'Pickup at Business'),
            (Icons.check_circle_outline, 'Readiness', 'Ready ✓'),
            (Icons.handshake_outlined, 'Handoff', 'Received ✓'),
            (Icons.support_agent, 'Support', 'Available'),
          ],
        ),
      ],
    ),
  );
}

class _ProofVisual extends StatelessWidget {
  const _ProofVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Active Work • Zone 1',
    accent: scalerBlue,
    label: 'ACTIVE WORK ONLY',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ProductLine('GPS verification', 'Active', color: businessGreen),
        ProductLine('Checkpoint', '2 of 4'),
        ProductLine('Materials', 'Confirmed ✓'),
        ProductLine('Coverage', 'Recording'),
        SizedBox(height: 10),
        StatusPill('Complete Job', color: scalerBlue, icon: Icons.check),
        SizedBox(height: 12),
        Text(
          'Location is not tracked while browsing jobs.',
          style: TextStyle(color: publicMuted, fontSize: 12),
        ),
      ],
    ),
  );
}

class _EarningsVisual extends StatelessWidget {
  const _EarningsVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Earnings',
    accent: scalerBlue,
    label: 'SAMPLE STATUS',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: MetricTile(
                label: 'Job pay',
                value: '\$125',
                icon: Icons.account_balance_wallet_outlined,
                accent: scalerBlue,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: MetricTile(
                label: 'Status',
                value: 'Pending',
                icon: Icons.fact_check_outlined,
                accent: scalerBlue,
              ),
            ),
          ],
        ),
        SizedBox(height: 14),
        ProductLine('Completion', 'Submitted'),
        ProductLine('Verification', 'Pending'),
        ProductLine('Payment', 'Pending'),
        ProductLine('Verified Jobs', 'Sample: 12'),
        SizedBox(height: 8),
        Text(
          'Example status only. Payment timing follows the approved workflow.',
          style: TextStyle(color: publicMuted, fontSize: 12),
        ),
      ],
    ),
  );
}

class _CrewAndTrustBand extends StatelessWidget {
  const _CrewAndTrustBand();
  @override
  Widget build(BuildContext context) => const FunnelSection(
    key: Key('scaler-crew'),
    step: 'LARGER CAMPAIGNS',
    title: 'CLEAR ZONES. NO DUPLICATE COVERAGE.',
    body: 'One campaign. Separate Zones. No duplicate coverage.',
    accent: scalerBlue,
    visual: ProductPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              Text('LARGE CAMPAIGN', style: _title),
              DemoBadge(label: 'LIMITED ROLLOUT', color: scalerBlue),
            ],
          ),
          SizedBox(height: 16),
          _CrewZoneStrip(),
          SizedBox(height: 14),
          ProductLine('Zone 1', 'Scaler A'),
          ProductLine('Zone 2', 'Scaler B'),
          ProductLine('Zone 3', 'Scaler C'),
          ProductLine('Coverage', 'Non-overlapping'),
        ],
      ),
    ),
  );
}

class _CrewZoneStrip extends StatelessWidget {
  const _CrewZoneStrip();

  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (final zone in const [
        ('1', Color(0xFF287EFF)),
        ('2', Color(0xFF14E39A)),
        ('3', Color(0xFF9C7BFF)),
      ]) ...[
        Expanded(
          child: Container(
            height: 76,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: zone.$2.withValues(alpha: .16),
              border: Border.all(color: zone.$2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'ZONE ${zone.$1}',
              style: TextStyle(color: zone.$2, fontWeight: FontWeight.w900),
            ),
          ),
        ),
        if (zone.$1 != '3') const SizedBox(width: 8),
      ],
    ],
  );
}

const _title = TextStyle(
  color: Colors.white,
  fontWeight: FontWeight.w900,
  letterSpacing: .6,
);
