import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/scaler_cashout_service.dart';

class ScalerCashoutCard extends StatefulWidget {
  const ScalerCashoutCard({super.key, this.service, this.openOnboarding});
  final ScalerCashoutService? service;
  final Future<bool> Function(Uri)? openOnboarding;

  @override
  State<ScalerCashoutCard> createState() => _ScalerCashoutCardState();
}

class _ScalerCashoutCardState extends State<ScalerCashoutCard> {
  late final ScalerCashoutService _service =
      widget.service ?? FirebaseScalerCashoutService();
  final _amount = TextEditingController();
  Map<String, dynamic>? _data;
  bool _busy = false;
  String? _error;
  String? _requestId;
  int? _requestedAmount;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _work(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Payouts need attention. Refresh and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() => _work(() async {
    final data = await _service.status();
    final op = data['operation'];
    if (op is Map && op['status'] == 'pending') {
      await _service.reconcile(op['operationId'] as String);
    }
    final refreshed = op is Map && op['status'] == 'pending'
        ? await _service.status()
        : data;
    if (mounted) setState(() => _data = refreshed);
  });

  Future<void> _setup() => _work(() async {
    final data = await _service.setup();
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
            'Enter an amount within your available test balance (up to \$100).',
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
    await _work(() async {
      _requestId ??= ScalerCashoutService.requestId();
      _requestedAmount = cents;
      await _service.request(_requestId!, cents);
      _requestId = null;
      _requestedAmount = null;
      final data = await _service.status();
      if (mounted) setState(() => _data = data);
    });
  }

  @override
  Widget build(BuildContext context) {
    final ready = _data?['status'] == 'ready';
    final op = _data?['operation'];
    final status = op is Map ? op['status'] : null;
    final available =
        ((_data?['availableCents'] as num?)?.toDouble() ?? 0) / 100;
    final label = switch (status) {
      'pending' => 'Pending',
      'completed' => 'Completed',
      'failed' => 'Failed',
      'needs_attention' => 'Needs attention',
      _ => null,
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Test payouts',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const Text('Test funds only. No real bank deposit.'),
            if (_data != null)
              Text(ready ? 'Payouts ready' : 'Needs attention'),
            Text('Available: \$${available.toStringAsFixed(2)}'),
            if (label != null) Text(label),
            if (_error != null) Text(_error!),
            if (_busy) const LinearProgressIndicator(),
            if (!ready)
              TextButton(
                onPressed: _busy ? null : _setup,
                child: const Text('Set up payouts'),
              ),
            if (ready &&
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
            if (status == 'pending' || status == 'needs_attention')
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _work(() async {
                        await _service.reconcile(
                          (op as Map)['operationId'] as String,
                          retry: true,
                        );
                        final data = await _service.status();
                        if (mounted) setState(() => _data = data);
                      }),
                child: const Text('Try again'),
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
