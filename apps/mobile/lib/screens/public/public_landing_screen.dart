import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../navigation/app_routes.dart';
import '../../services/early_access_session.dart';
import '../../services/public_site_service.dart';
import 'early_access_dialog.dart';
import 'waitlist_screen.dart';

class PublicLandingScreen extends StatefulWidget {
  const PublicLandingScreen({super.key});

  @override
  State<PublicLandingScreen> createState() => _PublicLandingScreenState();
}

class _PublicLandingScreenState extends State<PublicLandingScreen> {
  late Future<List<_MarylandCountyFeed>> _opportunities;
  bool _earlyAccessPromptShown = false;

  static const _marylandCounties = [
    (name: 'Howard County', latitude: 39.25, longitude: -76.93),
    (name: 'Baltimore County', latitude: 39.46, longitude: -76.64),
    (name: 'Anne Arundel County', latitude: 39.00, longitude: -76.58),
    (name: 'Montgomery County', latitude: 39.15, longitude: -77.20),
  ];

  @override
  void initState() {
    super.initState();
    _loadOpportunities();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future<void>.delayed(const Duration(milliseconds: 900), () {
        if (mounted) _showEarlyAccessPrompt();
      });
    });
  }

  void _loadOpportunities() {
    _opportunities = Future.wait(
      _marylandCounties.map((county) async {
        try {
          final feed = await PublicSiteService.loadLocalOpportunities(
            latitude: county.latitude,
            longitude: county.longitude,
          );
          return _MarylandCountyFeed(name: county.name, feed: feed);
        } catch (error) {
          return _MarylandCountyFeed(name: county.name, error: error);
        }
      }),
    );
  }

  void _openWaitlist(String role) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => WaitlistScreen(initialRole: role)),
    );
  }

  void _openCreateAccount() {
    Navigator.pushNamed(context, AppRoutes.createAccount);
  }

  Future<void> _showEarlyAccessPrompt() async {
    if (_earlyAccessPromptShown || hasShownEarlyAccessPrompt() || !mounted) {
      return;
    }
    _earlyAccessPromptShown = true;
    markEarlyAccessPromptShown();
    await showEarlyAccessDialog(context);
  }

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFF020914);
    const green = Color(0xFF14E39A);
    final compactNavigation = MediaQuery.sizeOf(context).width < 720;

    return Scaffold(
      backgroundColor: background,
      body: SelectionArea(
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              automaticallyImplyLeading: false,
              backgroundColor: const Color(0xF2020914),
              foregroundColor: Colors.white,
              toolbarHeight: compactNavigation ? 118 : 72,
              titleSpacing: compactNavigation ? 14 : 24,
              title: _PublicNavigation(
                stacked: compactNavigation,
                onLogin: () => Navigator.pushNamed(context, AppRoutes.login),
                onCreateAccount: _openCreateAccount,
              ),
            ),
            SliverToBoxAdapter(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1240),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 44, 24, 80),
                    child: Column(
                      children: [
                        LayoutBuilder(
                          builder: (context, constraints) {
                            final wide = constraints.maxWidth >= 820;
                            final copy = _HeroCopy(
                              onBusiness: () => _openWaitlist('business'),
                              onScaler: () => _openWaitlist('scaler'),
                            );
                            final preview = const _CampaignPreview();
                            return wide
                                ? Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.center,
                                    children: [
                                      Expanded(child: copy),
                                      const SizedBox(width: 38),
                                      Expanded(child: preview),
                                    ],
                                  )
                                : Column(
                                    children: [
                                      copy,
                                      const SizedBox(height: 34),
                                      preview,
                                    ],
                                  );
                          },
                        ),
                        const SizedBox(height: 70),
                        _SectionHeading(
                          eyebrow: 'LIVE LOCAL INTELLIGENCE',
                          title:
                              'AI Weather Intelligence that helps you act sooner.',
                          subtitle:
                              'Official alert facts come from the National Weather Service. Scale adds qualified AI interpretation while keeping experimental lead-lift estimates, limitations, and authoritative weather facts separate.',
                          action: IconButton(
                            tooltip: 'Refresh alerts',
                            onPressed: () {
                              setState(_loadOpportunities);
                            },
                            icon: const Icon(Icons.refresh, color: green),
                          ),
                        ),
                        const SizedBox(height: 20),
                        FutureBuilder<List<_MarylandCountyFeed>>(
                          future: _opportunities,
                          builder: (context, snapshot) {
                            if (snapshot.connectionState !=
                                ConnectionState.done) {
                              return const _Panel(
                                child: Center(
                                  child: Padding(
                                    padding: EdgeInsets.all(32),
                                    child: CircularProgressIndicator(
                                      color: green,
                                    ),
                                  ),
                                ),
                              );
                            }
                            final counties = snapshot.data ?? const [];
                            return Wrap(
                              spacing: 16,
                              runSpacing: 16,
                              children: counties
                                  .map(
                                    (county) => SizedBox(
                                      width: 580,
                                      child: _CountyOpportunityCard(
                                        county: county,
                                      ),
                                    ),
                                  )
                                  .toList(),
                            );
                          },
                        ),
                        const SizedBox(height: 70),
                        _Panel(
                          child: Padding(
                            padding: const EdgeInsets.all(30),
                            child: LayoutBuilder(
                              builder: (context, constraints) => Wrap(
                                spacing: 28,
                                runSpacing: 24,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  const SizedBox(
                                    width: 690,
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'AI PROPERTY INTELLIGENCE',
                                          style: TextStyle(
                                            color: green,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 1.2,
                                          ),
                                        ),
                                        SizedBox(height: 10),
                                        Text(
                                          'Know your market before you spend.',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 30,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        SizedBox(height: 10),
                                        Text(
                                          'ScaledCircle combines official property and Census information with qualified AI analysis to help you understand target areas and turn insights into verified local marketing campaigns. Sources, freshness, confidence, coverage, and limitations stay visible.',
                                          style: TextStyle(
                                            color: Color(0xFFB8C9D8),
                                            height: 1.5,
                                          ),
                                        ),
                                        SizedBox(height: 10),
                                        Text(
                                          'Included with Scale — \$499/month. Live analysis requires an authenticated Business with an active Scale subscription.',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Column(
                                    children: [
                                      FilledButton(
                                        onPressed: _openCreateAccount,
                                        child: const Text(
                                          'Explore Property Intelligence',
                                        ),
                                      ),
                                      TextButton(
                                        onPressed: _openCreateAccount,
                                        child: const Text(
                                          'Unlock with Scale — \$499/month',
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 70),
                        const _Panel(
                          child: Padding(
                            padding: EdgeInsets.all(30),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'MANAGED GROWTH — LIMITED BETA',
                                  style: TextStyle(
                                    color: green,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1.2,
                                  ),
                                ),
                                SizedBox(height: 10),
                                Text(
                                  'Your marketing shouldn’t stop when you’re busy.',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 30,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                SizedBox(height: 10),
                                Text(
                                  'ScaledCircle combines AI intelligence, digital marketing strategy, direct mail, and real-world campaign execution in one growth system. Know where to market. Know when to act. Know what to say. Then execute.',
                                  style: TextStyle(
                                    color: Color(0xFFB8C9D8),
                                    height: 1.5,
                                  ),
                                ),
                                SizedBox(height: 12),
                                Text(
                                  'Managed Growth — \$999/month. Everything in Scale plus AI-powered marketing planning and managed campaign coordination.',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                SizedBox(height: 8),
                                Text(
                                  'Advertising spend, printing, postage, and third-party media or vendor costs are separate. Limited beta does not include unlimited agency labor or revisions.',
                                  style: TextStyle(color: Color(0xFFB8C9D8)),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 70),
                        const _SectionHeading(
                          eyebrow: 'ONE CAMPAIGN SYSTEM',
                          title: 'Plan, prove, attribute, and learn.',
                          subtitle:
                              'Draw a zone, secure Scaler pay with test credits, verify field work by GPS, and connect the response back to each campaign.',
                        ),
                        const SizedBox(height: 22),
                        const Wrap(
                          spacing: 16,
                          runSpacing: 16,
                          children: [
                            _FeatureCard(
                              icon: Icons.map_outlined,
                              title: 'Mapped campaigns',
                              body:
                                  'Build zones, estimate homes, and lock boundaries once work is assigned.',
                            ),
                            _FeatureCard(
                              icon: Icons.gps_fixed,
                              title: 'Verified delivery',
                              body:
                                  'Record live GPS routes and review coverage before releasing payment.',
                            ),
                            _FeatureCard(
                              icon: Icons.qr_code_2,
                              title: 'Trackable response',
                              body:
                                  'Generate campaign links, QR codes, landing pages, and print-ready assets.',
                            ),
                            _FeatureCard(
                              icon: Icons.account_balance_wallet_outlined,
                              title: 'Transparent funding',
                              body:
                                  'Businesses see credits, reserved funds, and paid out. Scalers see earnings.',
                            ),
                          ],
                        ),
                        const SizedBox(height: 70),
                        _Panel(
                          child: Padding(
                            padding: const EdgeInsets.all(30),
                            child: Wrap(
                              alignment: WrapAlignment.spaceBetween,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 24,
                              runSpacing: 24,
                              children: [
                                const SizedBox(
                                  width: 650,
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Coming soon — help shape the launch.',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 30,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      SizedBox(height: 10),
                                      Text(
                                        'Early Scalers can build the strongest verified history. Early businesses receive a free subscription at launch; the 10% platform fee and Scaler pay still apply.',
                                        style: TextStyle(
                                          color: Color(0xFFB8C9D8),
                                          height: 1.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                FilledButton.icon(
                                  onPressed: () => _openWaitlist('business'),
                                  style: FilledButton.styleFrom(
                                    backgroundColor: green,
                                    foregroundColor: background,
                                    padding: const EdgeInsets.all(20),
                                  ),
                                  icon: const Icon(Icons.rocket_launch),
                                  label: const Text('Early Sign Up'),
                                ),
                              ],
                            ),
                          ),
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

class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Tooltip(
          message: 'Scaled Circle',
          child: Icon(Icons.radar, color: Color(0xFF14E39A)),
        ),
        const SizedBox(width: 8),
        const Text.rich(
          TextSpan(
            children: [
              TextSpan(text: 'Scaled'),
              TextSpan(
                text: 'Circle',
                style: TextStyle(color: Color(0xFF29A5FF)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PublicNavigation extends StatelessWidget {
  final bool stacked;
  final VoidCallback onLogin;
  final VoidCallback onCreateAccount;

  const _PublicNavigation({
    required this.stacked,
    required this.onLogin,
    required this.onCreateAccount,
  });

  @override
  Widget build(BuildContext context) {
    final actions = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextButton(onPressed: onLogin, child: const Text('Log in')),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: onCreateAccount,
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF287EFF),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          ),
          child: const Text('Create Account'),
        ),
      ],
    );

    if (stacked) {
      return SizedBox(
        width: double.infinity,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [const _Brand(), const SizedBox(height: 8), actions],
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [const _Brand(), actions],
      ),
    );
  }
}

class _HeroCopy extends StatelessWidget {
  final VoidCallback onBusiness;
  final VoidCallback onScaler;

  const _HeroCopy({required this.onBusiness, required this.onScaler});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'DATA-INFORMED LOCAL CAMPAIGNS • VERIFIED IN THE FIELD',
          style: TextStyle(
            color: Color(0xFF14E39A),
            fontSize: 12,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 18),
        const Text.rich(
          TextSpan(
            style: TextStyle(
              color: Colors.white,
              fontSize: 54,
              height: 1.02,
              fontWeight: FontWeight.w900,
              letterSpacing: -2.4,
            ),
            children: [
              TextSpan(text: 'ScaledCircle helps plan the campaign.\nYou '),
              TextSpan(
                text: 'choose',
                style: TextStyle(color: Color(0xFF14E39A)),
              ),
              TextSpan(text: ' the map.\nReal people '),
              TextSpan(
                text: 'deliver',
                style: TextStyle(color: Color(0xFF287EFF)),
              ),
              TextSpan(text: ' results.'),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Create targeted local campaigns, track work by GPS, and connect QR, web, landing-page, phone, and email responses to the campaign that generated them.',
          style: TextStyle(
            color: Color(0xFFB8C9D8),
            fontSize: 18,
            height: 1.55,
          ),
        ),
        const SizedBox(height: 28),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            FilledButton.icon(
              onPressed: onBusiness,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF287EFF),
                padding: const EdgeInsets.all(18),
              ),
              icon: const Icon(Icons.campaign),
              label: const Text('Business Early Access'),
            ),
            OutlinedButton.icon(
              onPressed: onScaler,
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF14E39A),
                side: const BorderSide(color: Color(0xFF14E39A)),
                padding: const EdgeInsets.all(18),
              ),
              icon: const Icon(Icons.directions_walk),
              label: const Text('Scaler Early Access'),
            ),
          ],
        ),
      ],
    );
  }
}

class _CampaignPreview extends StatelessWidget {
  const _CampaignPreview();

  static const _center = LatLng(39.2952, -76.6238);

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 500;
        return _Panel(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: SizedBox(
              height: compact ? 520 : 475,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: IgnorePointer(
                      child: FlutterMap(
                        options: const MapOptions(
                          initialCenter: _center,
                          initialZoom: 13.3,
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
                  const Positioned.fill(
                    child: ColoredBox(color: Color(0x5C020914)),
                  ),
                  Positioned.fill(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        compact ? 34 : 74,
                        compact ? 86 : 74,
                        compact ? 34 : 74,
                        compact ? 190 : 84,
                      ),
                      child: CustomPaint(painter: _RoutePainter()),
                    ),
                  ),
                  const Positioned(left: 22, top: 18, child: _MapHeading()),
                  Positioned(
                    left: compact ? 16 : null,
                    right: 16,
                    bottom: 28,
                    child: _MapScoreCard(compact: compact),
                  ),
                  const Positioned(
                    left: 10,
                    bottom: 6,
                    child: DecoratedBox(
                      decoration: BoxDecoration(color: Color(0xC7FFFFFF)),
                      child: Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 5,
                          vertical: 2,
                        ),
                        child: Text(
                          '© OpenStreetMap contributors',
                          style: TextStyle(
                            color: Color(0xFF1A2B38),
                            fontSize: 9,
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
      },
    );
  }
}

class _MapHeading extends StatelessWidget {
  const _MapHeading();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xE908192C),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF1A4569)),
      ),
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.map_outlined, color: Color(0xFF14E39A), size: 20),
            SizedBox(width: 8),
            Text(
              'Campaign Opportunity Map',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapScoreCard extends StatelessWidget {
  final bool compact;

  const _MapScoreCard({required this.compact});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: compact ? null : 348,
      decoration: BoxDecoration(
        color: const Color(0xF208192C),
        border: Border.all(color: const Color(0xFF2B6B99)),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0xAA000000),
            blurRadius: 22,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: const Padding(
        padding: EdgeInsets.all(14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.analytics_outlined,
                  color: Color(0xFF14E39A),
                  size: 20,
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Preliminary Zone Intelligence',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: 10),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                _PreviewMetric(icon: Icons.home_outlined, value: '549 homes'),
                _PreviewMetric(icon: Icons.directions_walk, value: '10.7 mi'),
                _PreviewMetric(icon: Icons.schedule, value: '3 hr 50 min'),
                _PreviewMetric(icon: Icons.groups_outlined, value: '1 Scaler'),
                _PreviewMetric(icon: Icons.square_foot, value: '109.9 acres'),
                _PreviewMetric(
                  icon: Icons.payments_outlined,
                  value: '\$70 est. pay',
                ),
              ],
            ),
            SizedBox(height: 9),
            Text(
              'GPS verification + campaign response attribution',
              style: TextStyle(color: Color(0xFF9EB2C4), fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewMetric extends StatelessWidget {
  final IconData icon;
  final String value;

  const _PreviewMetric({required this.icon, required this.value});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF102B42),
        border: Border.all(color: const Color(0xFF245371)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: const Color(0xFF52A5FF)),
            const SizedBox(width: 5),
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpportunityCard extends StatelessWidget {
  final LocalOpportunityAlert alert;

  const _OpportunityCard({required this.alert});

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.thunderstorm, color: Color(0xFFFFB34D)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    alert.event,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Text(
                  alert.severity,
                  style: const TextStyle(color: Color(0xFFFFB34D)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              alert.areaDescription,
              style: const TextStyle(color: Color(0xFFB8C9D8)),
            ),
            const SizedBox(height: 18),
            Text(
              '+${alert.leadLiftLowPercent}% to +${alert.leadLiftHighPercent}%',
              style: const TextStyle(
                color: Color(0xFF14E39A),
                fontSize: 28,
                fontWeight: FontWeight.w900,
              ),
            ),
            const Text(
              'Experimental estimated lead-lift range',
              style: TextStyle(color: Color(0xFF8FA5B7), fontSize: 12),
            ),
            const SizedBox(height: 12),
            Text(
              alert.rationale,
              style: const TextStyle(color: Color(0xFFB8C9D8)),
            ),
            if (alert.services.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                alert.services.join(' • '),
                style: const TextStyle(color: Color(0xFF52A5FF)),
              ),
            ],
            const SizedBox(height: 16),
            const Text(
              'Source: National Weather Service alert feed. Opportunity estimate: Scaled Circle experimental model.',
              style: TextStyle(color: Color(0xFF72899B), fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _CountyOpportunityCard extends StatelessWidget {
  final _MarylandCountyFeed county;

  const _CountyOpportunityCard({required this.county});

  @override
  Widget build(BuildContext context) {
    final feed = county.feed;
    final alert = feed?.alerts.firstOrNull;

    if (county.error != null) {
      return _Panel(
        child: ListTile(
          contentPadding: const EdgeInsets.all(22),
          leading: const Icon(Icons.cloud_off, color: Color(0xFFFFB34D)),
          title: Text(
            county.name,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          subtitle: const Text(
            'Live NWS alert data is temporarily unavailable.',
            style: TextStyle(color: Color(0xFF9CB0C2)),
          ),
        ),
      );
    }

    if (alert == null) {
      return _Panel(
        child: ListTile(
          contentPadding: const EdgeInsets.all(22),
          leading: const Icon(
            Icons.verified_user_outlined,
            color: Color(0xFF14E39A),
          ),
          title: Text(
            county.name,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          subtitle: const Text(
            'No active NWS alerts right now. No opportunity lift is estimated without an official alert.',
            style: TextStyle(color: Color(0xFF9CB0C2)),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            county.name,
            style: const TextStyle(
              color: Color(0xFF52A5FF),
              fontSize: 14,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        _OpportunityCard(alert: alert),
      ],
    );
  }
}

class _SectionHeading extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String subtitle;
  final Widget? action;

  const _SectionHeading({
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow,
                style: const TextStyle(
                  color: Color(0xFF14E39A),
                  fontWeight: FontWeight.w800,
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
              Text(
                subtitle,
                style: const TextStyle(color: Color(0xFFB8C9D8), height: 1.5),
              ),
            ],
          ),
        ),
        ?action,
      ],
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 285,
      child: _Panel(
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: const Color(0xFF14E39A), size: 32),
              const SizedBox(height: 18),
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 9),
              Text(
                body,
                style: const TextStyle(color: Color(0xFF9EB2C4), height: 1.45),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  final Widget child;

  const _Panel({required this.child});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF071525),
        border: Border.all(color: const Color(0xFF143552)),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 32)],
      ),
      child: child,
    );
  }
}

class _RoutePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final points = [
      Offset(size.width * .08, size.height * .45),
      Offset(size.width * .25, size.height * .18),
      Offset(size.width * .56, size.height * .08),
      Offset(size.width * .86, size.height * .29),
      Offset(size.width * .72, size.height * .74),
      Offset(size.width * .34, size.height * .9),
    ];
    final path = ui.Path()..moveTo(points.first.dx, points.first.dy);
    for (final point in points.skip(1)) {
      path.lineTo(point.dx, point.dy);
    }
    path.close();
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0x33287EFF)
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xFF287EFF)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
    for (final point in points) {
      canvas.drawCircle(point, 5, Paint()..color = Colors.white);
      canvas.drawCircle(point, 3, Paint()..color = const Color(0xFF287EFF));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _MarylandCountyFeed {
  final String name;
  final LocalOpportunityFeed? feed;
  final Object? error;

  const _MarylandCountyFeed({required this.name, this.feed, this.error});
}
