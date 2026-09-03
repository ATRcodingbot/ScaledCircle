import 'package:flutter/material.dart';

import 'package:flutter_app/screens/public/authentic_product_map.dart';
import 'package:flutter_app/screens/public/public_funnel_components.dart';

void main() {
  runApp(const SmartMappingSocialCapture());
}

class SmartMappingSocialCapture extends StatelessWidget {
  const SmartMappingSocialCapture({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData.dark(useMaterial3: true),
    home: const _CaptureCanvas(),
  );
}

class _CaptureCanvas extends StatelessWidget {
  const _CaptureCanvas();

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: publicBackground,
    body: Center(
      child: SizedBox(
        width: 1200,
        height: 675,
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF020914), Color(0xFF071A2B)],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(54, 42, 54, 38),
            child: Row(
              children: [
                const Expanded(flex: 4, child: _MessagePanel()),
                const SizedBox(width: 38),
                Expanded(
                  flex: 6,
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0B1C2D),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: publicBorder, width: 2),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x66000000),
                          blurRadius: 26,
                          offset: Offset(0, 12),
                        ),
                      ],
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: EdgeInsets.fromLTRB(10, 6, 10, 12),
                          child: Row(
                            children: [
                              Icon(Icons.map_outlined, color: businessGreen),
                              SizedBox(width: 9),
                              Text(
                                'SMART MAPPING • CAMPAIGN PREVIEW',
                                style: TextStyle(
                                  color: businessGreen,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ],
                          ),
                        ),
                        AuthenticProductMap(
                          mode: PublicProductMapMode.campaign,
                          height: 500,
                          showOpportunityCard: true,
                        ),
                        Padding(
                          padding: EdgeInsets.fromLTRB(10, 11, 10, 0),
                          child: Text(
                            'Validated Baltimore planning demo • Public map data • No customer information',
                            style: TextStyle(
                              color: publicMuted,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
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
  );
}

class _MessagePanel extends StatelessWidget {
  const _MessagePanel();

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const ScaledCircleBrand(),
      const Spacer(),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: businessGreen.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: businessGreen.withValues(alpha: 0.5)),
        ),
        child: const Text(
          'SMART MAPPING',
          style: TextStyle(
            color: businessGreen,
            fontSize: 12,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
          ),
        ),
      ),
      const SizedBox(height: 22),
      const Text(
        'Choose where local\nmarketing happens.',
        style: TextStyle(
          color: Colors.white,
          fontSize: 44,
          height: 1.05,
          fontWeight: FontWeight.w900,
          letterSpacing: -1.4,
        ),
      ),
      const SizedBox(height: 22),
      const Text(
        'Focus a campaign on practical streets and zones—then keep every response tied to the campaign.',
        style: TextStyle(
          color: publicMuted,
          fontSize: 20,
          height: 1.42,
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 28),
      const _ProofPoint(icon: Icons.select_all, text: 'Exact target area'),
      const SizedBox(height: 13),
      const _ProofPoint(
        icon: Icons.link,
        text: 'Campaign-linked response',
      ),
      const SizedBox(height: 13),
      const _ProofPoint(
        icon: Icons.insights_outlined,
        text: 'Evidence, not guesswork',
      ),
      const Spacer(),
      const Text(
        'Built for local growth in Maryland',
        style: TextStyle(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w800,
        ),
      ),
    ],
  );
}

class _ProofPoint extends StatelessWidget {
  const _ProofPoint({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 34,
        height: 34,
        decoration: const BoxDecoration(
          color: Color(0xFF0E263A),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: businessGreen, size: 19),
      ),
      const SizedBox(width: 12),
      Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
      ),
    ],
  );
}
