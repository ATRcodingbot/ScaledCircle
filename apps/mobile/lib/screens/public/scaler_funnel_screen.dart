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
        title: 'FIND LOCAL WORK THAT FITS YOU.',
        body:
            'Choose where you want to work, what kinds of jobs interest you, and how far you are willing to travel. See opportunities that make sense for you.',
        primaryLabel: 'Become a Scaler',
        secondaryLabel: 'See How Jobs Work',
        accent: scalerBlue,
        onPrimary: () => openPublicAccountRegistration(context, 'scaler'),
        onSecondary: () => ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('WORK WHERE YOU WANT.'))),
        visual: const _WorkAreaVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-preferences'),
        step: 'STEP 1',
        title: 'WORK WHERE YOU WANT.',
        body:
            'Save multiple Work Areas, job interests, travel and crew preferences, and explicitly opt in to door-to-door outreach. Preferences guide recommendations and alerts; Search All Jobs stays unrestricted.',
        accent: scalerBlue,
        visual: _WorkAreaVisual(),
      ),
      const _AlertsBand(),
      const FunnelSection(
        key: Key('scaler-step-jobs'),
        step: 'STEP 2',
        title: 'SEE THE JOB BEFORE YOU TAKE IT.',
        body:
            'Review sample job type, pay, approximate workload, materials, travel relevance, and campaign details before applying. A listing is an opportunity—not a guarantee of assignment.',
        accent: scalerBlue,
        reverse: true,
        visual: _JobCardVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-area'),
        step: 'STEP 3',
        title: 'KNOW WHERE THE JOB IS.',
        body:
            'See the mapped target, your Zone, workload information where available, materials, deadline, pay, and honest route status. ScaledCircle does not invent walking miles or time when pedestrian routing is not verified.',
        accent: scalerBlue,
        visual: _ZoneVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-job-room'),
        step: 'STEP 4',
        title: 'EVERYTHING YOU NEED FOR THE JOB.',
        body:
            'The private Job Room keeps Business communication, materials plans, pickup or delivery instructions, readiness, handoff confirmation, and support in one understandable place.',
        accent: scalerBlue,
        reverse: true,
        visual: _JobRoomVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-proof'),
        step: 'STEP 5',
        title: 'DO THE WORK. BUILD A VERIFIED HISTORY.',
        body:
            'Active-job GPS verification, route coverage, checkpoints, and completion proof build a verified work history. Location tracking is for active verified field work—not for browsing jobs or setting Work Areas.',
        accent: scalerBlue,
        visual: _ProofVisual(),
      ),
      const FunnelSection(
        key: Key('scaler-step-earnings'),
        step: 'STEP 6',
        title: 'SEE WHAT YOU’RE EARNING.',
        body:
            'See job pay, applicable completion bonuses, verification and payment status, and crew share where supported. Payment timing follows the authoritative workflow and is never promised prematurely.',
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

class _WorkAreaVisual extends StatelessWidget {
  const _WorkAreaVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    accent: scalerBlue,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('MY WORK AREAS', style: _title),
        ProductLine('Baltimore County', 'Enabled'),
        ProductLine('Anne Arundel County', 'Enabled'),
        ProductLine('Travel preference', 'Within 20 miles'),
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
        'ScaledCircle can notify you when matching jobs open in your preferred areas. Email is optional. Push is not represented as available until real delivery infrastructure is ready.',
    accent: scalerBlue,
    reverse: true,
    visual: ProductPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('HOW SHOULD WE TELL YOU?', style: _title),
          ProductLine('In ScaledCircle', 'On', color: scalerBlue),
          ProductLine('Email', 'Optional'),
          ProductLine('Push notifications', 'Coming Soon'),
        ],
      ),
    ),
  );
}

class _JobCardVisual extends StatelessWidget {
  const _JobCardVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SAMPLE JOB • NOT A LIVE LISTING',
          style: TextStyle(color: scalerBlue, fontWeight: FontWeight.w900),
        ),
        SizedBox(height: 8),
        Text(
          'Flyer Distribution',
          style: TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.w900,
          ),
        ),
        ProductLine('Job pay', '\$125'),
        ProductLine('Travel', '8 miles away'),
        ProductLine('Materials', 'Pickup required'),
        ProductLine('Match', 'Inside your Work Area', color: scalerBlue),
      ],
    ),
  );
}

class _ZoneVisual extends StatelessWidget {
  const _ZoneVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('JOB AREA • SAMPLE', style: _title),
        ProductLine('Target', 'Local residential area'),
        ProductLine('Your Zone', 'Zone 1'),
        ProductLine('Estimated homes', 'Shown when supported'),
        ProductLine('Walking route', 'Not yet verified'),
        ProductLine('Deadline', 'Friday, 5:00 PM'),
      ],
    ),
  );
}

class _JobRoomVisual extends StatelessWidget {
  const _JobRoomVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('JOB ROOM', style: _title),
        ProductLine('Business message', 'Ready'),
        ProductLine('Materials plan', 'Pickup instructions available'),
        ProductLine('Handoff', 'Confirm when received'),
        ProductLine('Support', 'Available in the job'),
      ],
    ),
  );
}

class _ProofVisual extends StatelessWidget {
  const _ProofVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('VERIFIED WORK', style: _title),
        ProductLine('Active-job GPS', 'Only during verified work'),
        ProductLine('Coverage', 'Recorded for review'),
        ProductLine('Checkpoints', 'When required'),
        ProductLine('Completion', 'Builds verified history', color: scalerBlue),
      ],
    ),
  );
}

class _EarningsVisual extends StatelessWidget {
  const _EarningsVisual();
  @override
  Widget build(BuildContext context) => const ProductPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('SAMPLE EARNINGS', style: _title),
        ProductLine('Job pay', '\$125.00'),
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
