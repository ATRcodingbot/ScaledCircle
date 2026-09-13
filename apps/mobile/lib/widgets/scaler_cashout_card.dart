import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/scaler_cashout_service.dart';

class ScalerCashoutCard extends StatefulWidget {
  const ScalerCashoutCard({
    super.key,
    this.service,
    this.openOnboarding,
    this.onBalanceChanged,
  });
  final ScalerCashoutService? service;
  final VoidCallback? onBalanceChanged;
  final Future<bool> Function(Uri)? openOnboarding;

  @override
  State<ScalerCashoutCard> createState() => _ScalerCashoutCardState();
}

class _ScalerCashoutCardState extends State<ScalerCashoutCard>
    with WidgetsBindingObserver {
  late final ScalerCashoutService _service =
      widget.service ?? FirebaseScalerCashoutService();
  final _amount = TextEditingController();
  Map<String, dynamic>? _data;
  bool _busy = false;
  String? _error;
  String? _requestId;
  int? _requestedAmount;
  Timer? _timer;
  bool _foreground = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_foreground) _load();
    });
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _amount.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground) _load();
  }

  Future<void> _work(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) {
        setState(() {
          final closed =
              error is FirebaseFunctionsException &&
              error.details is Map &&
              error.details['reason'] == 'test_window_closed';
          final reason =
              error is FirebaseFunctionsException && error.details is Map
              ? error.details['reason']
              : null;
          const setupMessages = {
            'cashout_setup_confirming':
                "We're confirming your payout setup. Check its status before continuing.",
            'cashout_setup_platform_blocked':
                'Payout setup is currently unavailable. ScaledCircle is resolving an issue with its payout provider. Your earnings are unchanged.',
            'cashout_setup_provider_rejected':
                "We couldn't start payout setup. Please try again later or contact support.",
          };
          _error = closed
              ? 'TEST certification window is closed. Cash-out execution is paused.'
              : setupMessages[reason] ??
                    'Could not complete this request. Refresh to check its status.';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() => _work(() async {
    final data = await _service.status();
    final op = data['operation'];
    if (data['executionEnabled'] == true &&
        op is Map &&
        op['status'] == 'pending') {
      await _service.reconcile(op['operationId'] as String);
    }
    final refreshed =
        data['executionEnabled'] == true &&
            op is Map &&
            op['status'] == 'pending'
        ? await _service.status()
        : data;
    final changed =
        _data != null &&
        (_data?['availableCents'] != refreshed['availableCents'] ||
            _data?['pendingCents'] != refreshed['pendingCents']);
    if (mounted) setState(() => _data = refreshed);
    if (changed) widget.onBalanceChanged?.call();
  });

  Future<void> _setup() => _work(() async {
    late final Map<String, dynamic> data;
    try {
      data = await _service.setup();
    } catch (_) {
      // Read the authoritative setup state even when creation/linking failed.
      // This never retries account creation or performs a payout.
      try {
        final refreshed = await _service.status();
        if (mounted) setState(() => _data = refreshed);
      } catch (_) {
        // Keep the original failure visible when readback is unavailable.
      }
      rethrow;
    }
    final url = Uri.parse(data['url'] as String);
    if (url.scheme != 'https' || url.host != 'connect.stripe.com') {
      throw StateError('Invalid onboarding URL');
    }
    final opened =
        await (widget.openOnboarding?.call(url) ??
            launchUrl(url, mode: LaunchMode.externalApplication));
    if (!opened) throw StateError('Could not open onboarding');
  });

  Future<void> _cashout() async {
    final cents = ScalerCashoutService.parseCents(_amount.text);
    final available = (_data?['availableCents'] as num?)?.toInt() ?? 0;
    if (cents == null || cents > available) {
      setState(
        () => _error =
            'Enter an amount within your available balance (up to \$100).',
      );
      return;
    }
    if (_requestId != null && _requestedAmount != cents) {
      setState(
        () => _error =
            'Refresh to check the previous request before changing the amount.',
      );
      return;
    }
    if (_data?['mode'] == 'live') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Cash out \$${(cents / 100).toStringAsFixed(2)}?'),
          content: const Text(
            'This amount will be reserved from your available balance while Stripe processes the payout. Your earned compensation remains recorded.',
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
    }
    await _work(() async {
      _requestId ??= ScalerCashoutService.requestId();
      _requestedAmount = cents;
      await _service.request(_requestId!, cents);
      widget.onBalanceChanged?.call();
      _requestId = null;
      _requestedAmount = null;
      final data = await _service.status();
      if (mounted) setState(() => _data = data);
    });
  }

  @override
  Widget build(BuildContext context) {
    final live = _data?['mode'] == 'live';
    final ready = _data?['status'] == 'ready';
    final executionEnabled = _data?['executionEnabled'] == true;
    final op = _data?['operation'];
    final status = op is Map ? op['status'] : null;
    final label = switch (status) {
      'pending' =>
        live
            ? op['message'] as String? ?? 'Cash-out processing'
            : 'Cash-out processing',
      'completed' => 'Completed',
      'failed' => 'Cash-out failed. Funds returned to your balance.',
      'needs_attention' =>
        op is Map && op['payoutFailed'] == true
            ? 'Cash-out failed. Funds remain reserved.'
            : 'Cash-out awaiting confirmation',
      _ => null,
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              live ? 'Cash Out' : 'Payouts',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            if (_data?['mode'] == 'test')
              const Text('Test funds only. No real bank deposit.'),
            if (live)
              const Text('Secure payout setup and processing through Stripe.'),
            if (_data != null)
              Text(
                ready
                    ? 'Payouts ready'
                    : _data?['setupMessage'] is String
                    ? _data!['setupMessage'] as String
                    : _data?['status'] == 'not_setup'
                    ? 'Set up payouts to get started.'
                    : ScalerCashoutService.attentionMessage(
                        _data?['mode'] as String? ?? 'test',
                      ),
              ),
            if (_data != null && !executionEnabled)
              Text(
                live
                    ? ((_data?['message'] as String?) ??
                          'Cash-out is temporarily paused. Your earnings are preserved.')
                    : 'TEST cash-out is paused for certification.',
              ),
            if (live && ready && executionEnabled)
              Text(
                'Available to cash out: \$${(((_data?['availableCents'] as num?) ?? 0) / 100).toStringAsFixed(2)}',
              ),
            if (label != null) Text(label),
            if (_error != null) Text(_error!),
            if (_busy) const LinearProgressIndicator(),
            TextButton(
              onPressed: _busy || _data?['setupRetryAllowed'] == false
                  ? null
                  : _setup,
              child: Text(
                ready
                    ? 'Manage payouts'
                    : _data?['status'] == 'setup_unavailable'
                    ? 'Payout setup unavailable'
                    : _data?['status'] == 'onboarding_incomplete'
                    ? 'Finish payout setup'
                    : _data?['status'] == 'setup_confirming'
                    ? 'Continue payout setup'
                    : _data?['status'] == 'setup_failed'
                    ? 'Try payout setup again'
                    : 'Set up payouts',
              ),
            ),
            if (ready &&
                executionEnabled &&
                status != 'pending' &&
                status != 'needs_attention') ...[
              TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  prefixText: '\$',
                ),
              ),
              FilledButton(
                onPressed: _busy ? null : _cashout,
                child: const Text('Cash out'),
              ),
            ],
            if (executionEnabled &&
                (status == 'pending' || status == 'needs_attention'))
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _work(() async {
                        await _service.reconcile(
                          (op as Map)['operationId'] as String,
                          retry: false,
                        );
                        final data = await _service.status();
                        if (mounted) setState(() => _data = data);
                      }),
                child: const Text('Check status'),
              ),
            TextButton(
              onPressed: _busy ? null : _load,
              child: const Text('Refresh'),
            ),
          ],
        ),
      ),
    );
  }
}
