import 'dart:math';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/referral_financial_service.dart';

class ReferralEarningsPanel extends StatefulWidget {
  const ReferralEarningsPanel({super.key, this.service});
  final ReferralFinancialGateway? service;
  @override
  State<ReferralEarningsPanel> createState() => _ReferralEarningsPanelState();
}

class _ReferralEarningsPanelState extends State<ReferralEarningsPanel> {
  late final ReferralFinancialGateway _service;
  Map<String, dynamic>? _data;
  String? _error, _requestId;
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    _service = widget.service ?? ReferralFinancialService();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _busy = true;
        _error = null;
      });
    }
    try {
      final value = await _service.dashboard();
      if (mounted) setState(() => _data = value);
    } catch (_) {
      if (mounted) {
        setState(() {
          _data = null;
          _error =
              'Referral balances could not be verified. Retry to check the latest state.';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _money(dynamic value) =>
      '\$${(((value as num?) ?? 0) / 100).toStringAsFixed(2)}';
  Future<void> _action(Future<void> Function() work) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await work();
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'This action needs attention. Refresh to reconcile its status before trying again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cashOut(int amount) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cash Out Referral Earnings'),
        content: Text(
          'Request ${_money(amount)} from your available referral balance? This is separate from work earnings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm cash out'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    _requestId ??= List.generate(
      24,
      (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    await _action(() async {
      await _service.cashOut(_requestId!, amount);
      // Acknowledged operations are reconciled from history. Keep the same key
      // only when the response is uncertain so retries cannot send twice.
      _requestId = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final available = (data?['availableCents'] as num?)?.toInt() ?? 0;
    final payoutReady = data?['executionEnabled'] == true;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Referral Earnings',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Text(
              "Paid by ScaledCircle — never deducted from the Scaler's earnings.",
            ),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null) Text(_error!),
            if (data != null) ...[
              Wrap(
                spacing: 32,
                runSpacing: 12,
                children: [
                  for (final pair in [
                    ('Pending', 'pendingCents'),
                    (
                      payoutReady ? 'Available' : 'Held',
                      payoutReady ? 'availableCents' : 'heldCents',
                    ),
                    ('Paid', 'paidCents'),
                  ])
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(pair.$1),
                        Text(
                          _money(
                            pair.$2 == 'heldCents'
                                ? data['heldCents'] ?? data['availableCents']
                                : data[pair.$2],
                          ),
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                      ],
                    ),
                ],
              ),
              if ((data['reservedCents'] as num? ?? 0) > 0)
                Text('Payout processing: ${_money(data['reservedCents'])}'),
              if (available < 0)
                const Text(
                  'A referral adjustment will be offset by future referral earnings before another cash-out.',
                ),
              if (payoutReady && available >= 0 && available < 1000)
                const Text(
                  'Cash out once your available referral balance reaches \$10.',
                ),
              if (payoutReady &&
                  data['recipientReady'] != true &&
                  (data['history'] as List? ?? []).isNotEmpty)
                OutlinedButton(
                  onPressed: _busy
                      ? null
                      : () => _action(() async {
                          final url = Uri.parse(await _service.setup());
                          if (url.scheme != 'https' ||
                              url.host != 'connect.stripe.com') {
                            throw StateError('Invalid onboarding destination');
                          }
                          if (!await launchUrl(
                            url,
                            mode: LaunchMode.externalApplication,
                          )) {
                            throw StateError('Unable to open payout setup');
                          }
                        }),
                  child: const Text('Set Up Referral Payouts'),
                ),
              if (payoutReady)
                FilledButton(
                  onPressed:
                      !_busy &&
                          available >= 1000 &&
                          data['recipientReady'] == true &&
                          data['executionEnabled'] == true &&
                          (data['reservedCents'] as num? ?? 0) == 0
                      ? () => _cashOut(available)
                      : null,
                  child: const Text('Cash Out Referral Earnings'),
                ),
              if (data['executionEnabled'] != true)
                const Text(
                  'Referral Program — Private Beta. Rewards remain pending or held while payout certification is completed. A completed hold does not mean money has been paid.',
                ),
              for (final op in (data['operations'] as List? ?? []).where(
                (o) => o['status'] != 'completed',
              ))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Referral payout · ${_money(op['amountCents'])}'),
                  subtitle: Text(
                    op['status'] == 'needs_attention'
                        ? 'Action required. Your referral funds remain accounted for.'
                        : op['status'] == 'failed'
                        ? 'Failed — funds released where confirmed safe.'
                        : 'Processing — not yet paid.',
                  ),
                  trailing: TextButton(
                    onPressed: _busy
                        ? null
                        : () => _action(
                            () => _service.reconcile(
                              op['operationId'] as String,
                              retry: payoutReady && op['payoutFailed'] == true,
                            ),
                          ),
                    child: Text(
                      payoutReady && op['payoutFailed'] == true
                          ? 'Retry payout'
                          : 'Check status',
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              const Text('History'),
              for (final raw in data['history'] as List? ?? [])
                _history(Map<String, dynamic>.from(raw as Map)),
            ],
            TextButton(
              onPressed: _busy ? null : _load,
              child: Text(_error == null ? 'Refresh status' : 'Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _history(Map<String, dynamic> e) {
    final label = e['type'] == 'BUSINESS_SUBSCRIPTION_REFERRAL'
        ? 'Business subscription referral'
        : 'Scaler work referral';
    final millis = e['expectedAvailabilityMillis'];
    final date = millis is num
        ? DateTime.fromMillisecondsSinceEpoch(millis.toInt())
        : null;
    final payoutReady = _data?['executionEnabled'] == true;
    final status = e['status'] == 'AVAILABLE' && !payoutReady
        ? 'Held'
        : const {
                'PENDING': 'Pending',
                'HELD': 'Held',
                'AVAILABLE': 'Available',
                'PAID': 'Paid',
                'ADJUSTED': 'Adjusted',
                'REVERSED': 'Reversed',
                'PAYOUT_PENDING': 'Payout processing',
              }[e['status']] ??
              'Needs review';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text('$label · ${_money(e['currentCents'])}'),
      subtitle: Text(
        '$status${e['status'] == 'PENDING' && date != null ? '\nEarliest hold review: ${date.month}/${date.day}/${date.year}, subject to eligibility and payout readiness' : ''}'
        '${(e['adjustmentCents'] as num? ?? 0) != 0 ? '\nAdjustment: ${_money(e['adjustmentCents'])}' : ''}',
      ),
    );
  }
}
