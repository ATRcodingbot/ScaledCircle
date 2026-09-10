import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/business_workspace_service.dart';

typedef IntroOfferCall =
    Future<Map<String, dynamic>> Function(
      String name,
      Map<String, dynamic> data,
    );

/// Server-selected eligibility. A hidden pilot never appears for other owners.
class StarterIntroOfferCard extends StatefulWidget {
  const StarterIntroOfferCard({
    super.key,
    required this.businessId,
    this.call,
    this.openCheckout,
  });

  final String businessId;
  final IntroOfferCall? call;
  final Future<bool> Function(Uri)? openCheckout;

  @override
  State<StarterIntroOfferCard> createState() => _StarterIntroOfferCardState();
}

class _StarterIntroOfferCardState extends State<StarterIntroOfferCard> {
  static const _offerId = 'starter_intro_1_dollar_v1';
  bool _eligible = false;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _checkout;

  Future<Map<String, dynamic>> _call(String name, Map<String, dynamic> data) =>
      (widget.call ?? BusinessWorkspaceService().call)(name, data);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant StarterIntroOfferCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.businessId != widget.businessId) {
      _eligible = false;
      _checkout = null;
      _error = null;
      _busy = false;
      _load();
    }
  }

  Future<void> _load() async {
    final businessId = widget.businessId;
    try {
      final value = await _call('previewBusinessMembershipChange', {
        'businessId': businessId,
        'newMembership': true,
        'offerId': _offerId,
      });
      if (mounted && widget.businessId == businessId) {
        setState(() => _eligible = value['eligible'] == true);
      }
    } catch (_) {
      // Unverified availability must not advertise a discounted purchase.
    }
  }

  Future<void> _prepare() async {
    if (_busy || _checkout != null) return;
    final businessId = widget.businessId;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final value = await _call('createSubscriptionCheckoutSession', {
        'businessId': businessId,
        'offerId': _offerId,
        'plan': 'starter',
      });
      final uri = Uri.tryParse(value['url']?.toString() ?? '');
      if (value['offerId'] != _offerId ||
          value['amountDueCents'] != 100 ||
          value['monthlyCents'] != 9900 ||
          value['discountCents'] != 9800 ||
          value['renewalPreviewAtMs'] is! num ||
          uri?.scheme != 'https' ||
          uri?.host != 'checkout.stripe.com') {
        throw StateError('Unverified introductory Checkout');
      }
      if (mounted && widget.businessId == businessId) {
        setState(() => _checkout = value);
      }
    } catch (_) {
      if (mounted && widget.businessId == businessId) {
        setState(
          () => _error =
              'Checkout needs verification. No payment was made here. '
              'Contact support before starting another introductory purchase.',
        );
      }
    } finally {
      if (mounted && widget.businessId == businessId) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_eligible) return const SizedBox.shrink();
    final checkout = _checkout;
    final renewal = checkout == null
        ? null
        : MaterialLocalizations.of(context).formatFullDate(
            DateTime.fromMillisecondsSinceEpoch(
              (checkout['renewalPreviewAtMs'] as num).toInt(),
            ),
          );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Try your first month for \$1',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            const Text(
              'Starter is \$99/month. Your first billing period is \$1. '
              'Then \$99/month. Cancel before renewal in Account → Billing / Plan.',
            ),
            if (checkout != null) ...[
              const SizedBox(height: 12),
              const Text(
                'Starter: \$99.00\nIntro discount: −\$98.00\nToday: \$1.00\nNext renewal: \$99.00',
              ),
              Text('Expected renewal: $renewal'),
              const Text(
                'Stripe calculated this date for the current preview. '
                'Your final billing period starts when you complete Checkout.',
              ),
            ],
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy || _error != null
                  ? null
                  : checkout == null
                  ? _prepare
                  : () async {
                      final uri = Uri.parse(checkout['url'].toString());
                      final open = widget.openCheckout;
                      if (open != null) {
                        await open(uri);
                      } else {
                        await launchUrl(
                          uri,
                          mode: LaunchMode.externalApplication,
                        );
                      }
                    },
              child: Text(
                _busy
                    ? 'Verifying pricing…'
                    : checkout == null
                    ? 'Review \$1 Starter offer'
                    : 'Open secure Checkout — \$1 today',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
