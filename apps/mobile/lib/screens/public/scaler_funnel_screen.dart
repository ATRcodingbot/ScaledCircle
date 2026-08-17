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
    title: 'How Verified Coverage Looks',
    accent: scalerBlue,
    label: 'SAMPLE ACTIVE WORK',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ScalerZoneMap(),
        SizedBox(height: 8),
        Text(
          'SAMPLE ACTIVE-WORK GPS TRACE',
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
            StatusPill('Zone 1', color: scalerBlue, icon: Icons.crop_free),
            StatusPill('GPS recording', color: businessGreen),
          ],
        ),
        ProductLine('Trace', 'Recorded active-work evidence'),
        ProductLine('Planned route', 'Not provided'),
        ProductLine('Coverage', 'Recording'),
        SizedBox(height: 8),
        Text(
          'When active work starts, ScaledCircle records GPS evidence used to review coverage inside the assigned Zone.',
          style: TextStyle(color: publicMuted, fontSize: 12, height: 1.35),
        ),
      ],
    ),
  );
}

class _ScalerZoneMap extends StatelessWidget {
  const _ScalerZoneMap();
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(14),
    child: Semantics(
      image: true,
      label:
          'Example recorded active-work GPS trace inside an assigned campaign Zone; it is not a planned walking route',
      child: SizedBox(
        height: 180,
        width: double.infinity,
        child: CustomPaint(painter: _ScalerZonePainter()),
      ),
    ),
  );
}

class _ScalerZonePainter extends CustomPainter {
  const _ScalerZonePainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF102536),
    );
    canvas.drawCircle(
      Offset(size.width * .15, size.height * .18),
      size.width * .13,
      Paint()..color = const Color(0xFF173C35),
    );
    final streets = Paint()
      ..color = const Color(0xFF557084)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final mainStreet = Path()
      ..moveTo(0, size.height * .78)
      ..cubicTo(
        size.width * .28,
        size.height * .52,
        size.width * .6,
        size.height * .36,
        size.width,
        size.height * .12,
      );
    canvas.drawPath(mainStreet, streets..strokeWidth = 3.5);
    for (final branch in <Path>[
      Path()
        ..moveTo(size.width * .2, size.height)
        ..quadraticBezierTo(
          size.width * .3,
          size.height * .55,
          size.width * .42,
          0,
        ),
      Path()
        ..moveTo(size.width * .36, size.height * .58)
        ..quadraticBezierTo(
          size.width * .62,
          size.height * .74,
          size.width * .82,
          size.height,
        ),
    ]) {
      canvas.drawPath(branch, streets..strokeWidth = 1.8);
    }
    final target = Path()
      ..moveTo(size.width * .08, size.height * .12)
      ..lineTo(size.width * .88, size.height * .08)
      ..lineTo(size.width * .95, size.height * .84)
      ..lineTo(size.width * .14, size.height * .92)
      ..close();
    canvas.drawPath(
      target,
      Paint()
        ..color = publicMuted.withValues(alpha: .55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
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
    final trace = Path()
      ..moveTo(size.width * .26, size.height * .66)
      ..cubicTo(
        size.width * .31,
        size.height * .38,
        size.width * .48,
        size.height * .28,
        size.width * .61,
        size.height * .4,
      )
      ..quadraticBezierTo(
        size.width * .72,
        size.height * .54,
        size.width * .58,
        size.height * .72,
      )
      ..quadraticBezierTo(
        size.width * .45,
        size.height * .82,
        size.width * .36,
        size.height * .6,
      );
    canvas.drawPath(
      trace,
      Paint()
        ..color = businessGreen
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke,
    );
    canvas.drawCircle(
      Offset(size.width * .26, size.height * .66),
      5,
      Paint()..color = Colors.white,
    );
    canvas.drawCircle(
      Offset(size.width * .36, size.height * .6),
      6,
      Paint()..color = businessGreen,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
