import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../config/app_environment.dart';
import '../../../services/affiliate_service.dart';
import '../../public/referral_program_screen.dart';
import '../../../services/referral_financial_service.dart';
import '../../../services/referral_share_service.dart';
import '../../../widgets/referral_earnings_panel.dart';

class ScalerAffiliateScreen extends StatefulWidget {
  const ScalerAffiliateScreen({
    super.key,
    this.service,
    this.financialService,
    this.enableAttribution =
        AppEnvironmentConfig.isStaging || AppEnvironmentConfig.isLocal,
  });
  final AffiliateGateway? service;
  final ReferralFinancialGateway? financialService;
  final bool enableAttribution;
  @override
  State<ScalerAffiliateScreen> createState() => _ScalerAffiliateScreenState();
}

class _ScalerAffiliateScreenState extends State<ScalerAffiliateScreen> {
  late final AffiliateGateway _service;
  AffiliateDashboard? _dashboard;
  bool _busy = false, _accepted = false, _scaler = true;
  String? _error;
  Future<void> _share(
    String url,
    BuildContext anchor, {
    bool saveQr = false,
  }) async {
    final box = anchor.findRenderObject() as RenderBox;
    final origin = box.localToGlobal(Offset.zero) & box.size;
    try {
      if (saveQr) {
        await saveReferralQr(url, origin);
      } else {
        await shareReferral(url, origin);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Sharing is unavailable here. Use Copy Referral Link or try another browser.',
            ),
          ),
        );
      }
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.enableAttribution) {
      _service = widget.service ?? AffiliateService();
      _load();
    }
  }

  Future<void> _load({bool join = false}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (await _service.eligibility() != AffiliateEligibility.eligible) {
        throw StateError(
          'Verify your email and account approval before sharing referrals.',
        );
      }
      final d = join ? await _service.join() : await _service.dashboard();
      if (mounted) setState(() => _dashboard = d);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Referrals could not be loaded. Verify your email and account approval, then retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enableAttribution) {
      return Scaffold(
        appBar: AppBar(title: const Text('Referral Program')),
        body: const Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Referral Program — Coming Soon'),
              Text(
                'Existing referral records are preserved. Enrollment and referral rewards are not available yet.',
              ),
            ],
          ),
        ),
      );
    }
    final d = _dashboard;
    final code = d?.requiresPolicyAcceptance == true ? null : d?.referralCode;
    final url = code == null
        ? null
        : AffiliateService.referralUrl(code, scaler: _scaler);
    return Scaffold(
      appBar: AppBar(title: const Text('Referrals')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Invite a Business or Scaler',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const Text(
              'Track signups through your referral link. Signup alone does not earn money.',
            ),
            const SizedBox(height: 16),
            const Text(
              'Business referrals: 10% of qualifying retained recurring subscription revenue.',
            ),
            const Text(
              'Scaler referrals: 1% of final approved compensation from qualifying completed work.',
            ),
            const Text(ReferralProgramScreen.scalerProtection),
            const Text(ReferralProgramScreen.platformFunding),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null) ...[
              Text(_error!),
              TextButton(
                onPressed: _busy ? null : () => _load(),
                child: const Text('Retry'),
              ),
            ],
            if (d != null && (!d.joined || d.requiresPolicyAcceptance)) ...[
              TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const ReferralProgramScreen(),
                  ),
                ),
                child: const Text('Read Referral Terms and FAQ'),
              ),
              CheckboxListTile(
                value: _accepted,
                onChanged: _busy
                    ? null
                    : (v) => setState(() => _accepted = v ?? false),
                title: const Text(
                  'I accept Referral Launch V2 terms (September 10, 2026), including qualifying economics, settlement holds and referral adjustments.',
                ),
              ),
              FilledButton(
                onPressed: _accepted && !_busy ? () => _load(join: true) : null,
                child: const Text('Create My Referral Link'),
              ),
            ],
            if (url != null) ...[
              SwitchListTile(
                title: const Text('Invite a Scaler'),
                subtitle: const Text('Turn off to invite a Business.'),
                value: _scaler,
                onChanged: (v) => setState(() => _scaler = v),
              ),
              SelectableText(url),
              TextButton(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: url));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Referral link copied')),
                    );
                  }
                },
                child: const Text('Copy Referral Link'),
              ),
              Semantics(
                label: 'Referral QR code',
                child: QrImageView(
                  data: url,
                  size: 200,
                  backgroundColor: Colors.white,
                ),
              ),
              Builder(
                builder: (anchor) => Wrap(
                  spacing: 12,
                  children: [
                    TextButton.icon(
                      onPressed: () => _share(url, anchor),
                      icon: const Icon(Icons.share),
                      label: const Text('Share'),
                    ),
                    TextButton.icon(
                      onPressed: () => _share(url, anchor, saveQr: true),
                      icon: const Icon(Icons.download),
                      label: const Text('Save / Download QR'),
                    ),
                  ],
                ),
              ),
              if (widget.service == null || widget.financialService != null)
                ReferralEarningsPanel(service: widget.financialService),
              const Text(
                'Referral history',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              if (d!.referrals.isEmpty)
                const Text('No attributed signups yet.'),
              for (final role in ['business', 'scaler']) ...[
                Text(
                  role == 'business'
                      ? 'Businesses Referred'
                      : 'Scalers Referred',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                if (role == 'scaler')
                  const Text(
                    "Paid by ScaledCircle — never deducted from the Scaler's earnings.",
                  ),
                for (final r in d.referrals.where(
                  (r) => r['referredRole'] == role,
                ))
                  ListTile(
                    title: Text(r['displayId']?.toString() ?? 'Referral'),
                    subtitle: Text(_history(r)),
                  ),
              ],
            ],
            const SizedBox(height: 20),
            const Text(
              'Signed up: attribution recorded, no cash reward.\nPending: earned reward in its settlement hold.\nAvailable: eligible referral funds.\nPaid: payout confirmed. Earned does not mean paid.',
            ),
          ],
        ),
      ),
    );
  }

  String _history(Map<String, dynamic> r) {
    final joined = (r['attributedAtMillis'] as num?)?.toInt();
    final date = joined == null
        ? ''
        : DateTime.fromMillisecondsSinceEpoch(
            joined,
          ).toLocal().toString().split(' ').first;
    final status =
        const {
          'EARNING': 'Earning',
          'AVAILABLE': 'Available',
          'PAID': 'Paid',
        }[r['status']] ??
        'Signed up';
    final amount = ((r['earnedCents'] as num?) ?? 0) / 100;
    final available = ((r['availableCents'] as num?) ?? 0) / 100;
    final paid = ((r['paidCents'] as num?) ?? 0) / 100;
    return '${r['referredRole'] == 'scaler' ? 'Scaler' : 'Business'} · $status'
        '${date.isEmpty ? '' : '\nJoined $date'}\nQualifying jobs: ${r['qualifyingJobCount'] ?? 0}'
        '\nEarned: \$${amount.toStringAsFixed(2)} · Available: \$${available.toStringAsFixed(2)} · Paid: \$${paid.toStringAsFixed(2)}';
  }
}
