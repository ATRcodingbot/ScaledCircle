import 'package:flutter/material.dart';

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
    title: 'Opportunity Match',
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
          'Inside your Anne Arundel Work Area',
          style: TextStyle(color: publicMuted, fontSize: 12),
        ),
        ProductLine('Sample job pay', '\$125', color: scalerBlue),
        SizedBox(height: 18),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill(
              'Materials provided',
              color: scalerBlue,
              icon: Icons.inventory_2_outlined,
            ),
            StatusPill(
              'Route not verified',
              color: publicMuted,
              icon: Icons.route_outlined,
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
    title: 'My Work Preferences',
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
        ProductLine('Door-to-door outreach', 'Off'),
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
    label: 'SAMPLE • NOT A LIVE LISTING',
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
    title: 'Your Assigned Zone',
    accent: scalerBlue,
    label: 'SAMPLE MAP',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ScalerZoneMap(),
        SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            StatusPill('Zone 1', color: scalerBlue, icon: Icons.crop_free),
            StatusPill('Not assigned', color: publicMuted),
          ],
        ),
        ProductLine('Estimated homes', 'Shown when supported'),
        ProductLine('Route', 'Not yet verified'),
        ProductLine('Deadline', 'Friday, 5:00 PM'),
      ],
    ),
  );
}

class _ScalerZoneMap extends StatelessWidget {
  const _ScalerZoneMap();
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(14),
    child: SizedBox(
      height: 150,
      width: double.infinity,
      child: CustomPaint(painter: _ScalerZonePainter()),
    ),
  );
}

class _ScalerZonePainter extends CustomPainter {
  const _ScalerZonePainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF0B2034),
    );
    final streets = Paint()
      ..color = const Color(0xFF24445B)
      ..strokeWidth = 2;
    for (var x = 24.0; x < size.width; x += 52) {
      canvas.drawLine(Offset(x, 0), Offset(x - 20, size.height), streets);
    }
    for (var y = 26.0; y < size.height; y += 40) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y + 12), streets);
    }
    final zone = Path()
      ..moveTo(size.width * .18, size.height * .2)
      ..lineTo(size.width * .73, size.height * .13)
      ..lineTo(size.width * .87, size.height * .66)
      ..lineTo(size.width * .58, size.height * .88)
      ..lineTo(size.width * .2, size.height * .72)
      ..close();
    canvas.drawPath(zone, Paint()..color = scalerBlue.withValues(alpha: .2));
    canvas.drawPath(
      zone,
      Paint()
        ..color = scalerBlue
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
    canvas.drawCircle(
      Offset(size.width * .52, size.height * .5),
      7,
      Paint()..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _JobRoomVisual extends StatelessWidget {
  const _JobRoomVisual();
  @override
  Widget build(BuildContext context) => const ProductWindow(
    title: 'Private Job Room',
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
              'Job details ready',
            ),
            (
              Icons.inventory_2_outlined,
              'Materials plan',
              'Pickup instructions available',
            ),
            (Icons.handshake_outlined, 'Handoff', 'Confirm when received'),
            (Icons.support_agent, 'Support', 'Available inside the job'),
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
    title: 'Verified Completion',
    accent: scalerBlue,
    label: 'ACTIVE WORK ONLY',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        WorkflowRail(
          accent: scalerBlue,
          steps: [
            (
              Icons.play_circle_outline,
              'Start active work',
              'Location verification begins',
            ),
            (
              Icons.route_outlined,
              'Complete your Zone',
              'Coverage captured for review',
            ),
            (
              Icons.add_a_photo_outlined,
              'Add proof',
              'Checkpoints when required',
            ),
            (
              Icons.verified_user_outlined,
              'Submit completion',
              'Build verified history',
            ),
          ],
        ),
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
                value: 'Review',
                icon: Icons.fact_check_outlined,
                accent: scalerBlue,
              ),
            ),
          ],
        ),
        SizedBox(height: 14),
        ProductLine('Completion bonus', 'When offered'),
        ProductLine('Verification', 'Pending review'),
        ProductLine('Payment', 'Follows approved workflow'),
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
    body:
        'Some larger or time-sensitive campaigns may use a Scaler Crew where rollout access permits. One campaign can be divided into non-overlapping Zones. Crew availability remains gated rather than advertised as unrestricted.',
    accent: scalerBlue,
    visual: ProductPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('TRUST & SAFETY', style: _title),
          ProductLine('Job details', 'Clear before you apply'),
          ProductLine('Work area', 'Mapped'),
          ProductLine('Job Room', 'Private'),
          ProductLine('Completion', 'Verified'),
          ProductLine('Scaler Crew', 'Limited rollout'),
        ],
      ),
    ),
  );
}

const _title = TextStyle(
  color: Colors.white,
  fontWeight: FontWeight.w900,
  letterSpacing: .6,
);
