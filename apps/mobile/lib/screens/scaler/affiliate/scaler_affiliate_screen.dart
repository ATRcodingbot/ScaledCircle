import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../services/affiliate_service.dart';
import '../../../theme/app_theme.dart';

class ScalerAffiliateScreen extends StatefulWidget {
  const ScalerAffiliateScreen({super.key});

  @override
  State<ScalerAffiliateScreen> createState() => _ScalerAffiliateScreenState();
}

class _ScalerAffiliateScreenState extends State<ScalerAffiliateScreen> {
  final _service = AffiliateService();
  late Future<AffiliateDashboard> _dashboard = _service.dashboard();
  bool _agree = false;
  bool _joining = false;

  Future<void> _join() async {
    if (!_agree || _joining) return;
    setState(() => _joining = true);
    try {
      final value = await _service.join();
      if (mounted) setState(() => _dashboard = Future.value(value));
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  Future<void> _copy(String value, String message) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Business referrals')),
      body: FutureBuilder<AffiliateDashboard>(
        future: _dashboard,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return const Center(child: Text('Referral details are temporarily unavailable.'));
          }
          final dashboard = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(24),
            children: dashboard.joined ? _joined(dashboard) : _notJoined(),
          );
        },
      ),
    );
  }

  List<Widget> _notJoined() => [
    const Text('EARN WITH REFERRALS', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.blue)),
    const SizedBox(height: 10),
    const Text('Introduce local businesses to ScaledCircle.', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
    const SizedBox(height: 10),
    const Text('Start at 10% recurring commission on qualifying Business subscriptions. Higher rates may become available based on program eligibility.'),
    const SizedBox(height: 24),
    const _TermsCard(),
    CheckboxListTile(
      value: _agree,
      onChanged: (value) => setState(() => _agree = value == true),
      title: const Text('I agree to the Scaler Referral Program terms.'),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
    ),
    const SizedBox(height: 8),
    FilledButton(
      onPressed: _agree && !_joining ? _join : null,
      child: Text(_joining ? 'Joining…' : 'Join Referral Program'),
    ),
  ];

  List<Widget> _joined(AffiliateDashboard dashboard) {
    final code = dashboard.referralCode!;
    final link = 'https://scaledcircle.com/?ref=$code';
    final rate = ((dashboard.commissionRateBps ?? 1000) / 100).toStringAsFixed(0);
    final message = 'I use ScaledCircle for local gig opportunities. If you run a local business, check out what they are building for local growth and verified field execution:\n\n$link';
    return [
      const Text('EARN WITH REFERRALS', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.blue)),
      const SizedBox(height: 8),
      Text('Your rate: $rate%', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
      const Text('Applies only to qualifying paid Business subscription revenue.'),
      const SizedBox(height: 22),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('YOUR REFERRAL LINK', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            SelectableText(link),
            const SizedBox(height: 14),
            Wrap(spacing: 10, runSpacing: 10, children: [
              FilledButton.icon(onPressed: () => _copy(link, 'Referral link copied.'), icon: const Icon(Icons.link), label: const Text('Copy Link')),
              OutlinedButton.icon(onPressed: () => _copy(message, 'Share message copied.'), icon: const Icon(Icons.copy), label: const Text('Copy Message')),
            ]),
          ]),
        ),
      ),
      const SizedBox(height: 18),
      Card(
        child: ListTile(
          leading: const Icon(Icons.business_outlined),
          title: Text('${dashboard.referralCount} referred'),
          subtitle: const Text('Attributed Businesses appear here without exposing their private operations.'),
        ),
      ),
      const SizedBox(height: 12),
      const Card(
        child: ListTile(
          leading: Icon(Icons.receipt_long_outlined),
          title: Text('Commission accounting is being prepared'),
          subtitle: Text('Referrals can be attributed now. Earned, reversed, payable, and paid balances will appear only after authoritative subscription invoice and refund accounting is released.'),
        ),
      ),
    ];
  }
}

class _TermsCard extends StatelessWidget {
  const _TermsCard();

  @override
  Widget build(BuildContext context) => const Card(
    child: Padding(
      padding: EdgeInsets.all(18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('PROGRAM TERMS — SUMMARY', style: TextStyle(fontWeight: FontWeight.w800)),
        SizedBox(height: 10),
        Text('• A referral qualifies only under the current attribution and paid-subscription policy.\n• Commission becomes payable only after reviewed payment, refund, tax, and payout requirements are satisfied.\n• Self-referrals, attribution manipulation, and fraud are prohibited.\n• Refunds and chargebacks may reverse commission.\n• ScaledCircle may review or suspend abusive accounts.'),
      ]),
    ),
  );
}
