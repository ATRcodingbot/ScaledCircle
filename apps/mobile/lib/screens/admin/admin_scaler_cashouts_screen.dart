import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../config/app_environment.dart';
import 'admin_role_gate.dart';

class AdminScalerCashoutsScreen extends StatefulWidget {
  const AdminScalerCashoutsScreen({super.key, this.call});
  final Future<Map<String, dynamic>> Function(String, Map<String, dynamic>)?
  call;
  @override
  State<AdminScalerCashoutsScreen> createState() =>
      _AdminScalerCashoutsScreenState();
}

class _AdminScalerCashoutsScreenState extends State<AdminScalerCashoutsScreen> {
  List<Map> _items = [];
  bool _busy = false;
  String? _message;
  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> data,
  ) async {
    if (widget.call != null) return widget.call!(name, data);
    final result = await FirebaseFunctions.instanceFor(
      region: AppEnvironmentConfig.functionsRegion,
    ).httpsCallable(name).call(data);
    return Map<String, dynamic>.from(result.data as Map);
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load([String? operationId]) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      if (operationId != null) {
        await _call('adminReconcileScalerCashoutV1', {
          'operationId': operationId,
          'retry': false,
        });
      }
      final data = await _call('adminScalerCashoutsV1', {});
      if (mounted) {
        setState(() {
          _items = (data['operations'] as List? ?? [])
              .whereType<Map>()
              .toList();
          _message = operationId == null
              ? null
              : 'Provider status checked. No new payout was requested.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message =
              'Could not confirm payout status. No new payout was requested.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(title: const Text('Scaler payout support')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Review Wallet reservations and Stripe reconciliation. Checking status never requests a new payout.',
          ),
          TextButton(
            onPressed: _busy ? null : _load,
            child: const Text('Refresh'),
          ),
          if (_busy) const LinearProgressIndicator(),
          if (_message != null) Text(_message!),
          if (!_busy && _items.isEmpty)
            const Text('No LIVE Scaler cash-outs have been requested.'),
          for (final item in _items)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '\$${((item['amountCents'] as num) / 100).toStringAsFixed(2)} · ${item['message'] ?? item['status']}',
                    ),
                    SelectableText('Scaler: ${item['scalerId']}'),
                    Text('Payout setup: ${(item['connectHealth'] ?? 'Check provider status').toString().replaceAll('_', ' ')}'),
                    Text(
                      'Requested: ${DateTime.fromMillisecondsSinceEpoch(item['requestedAt'] as int).toLocal()}',
                    ),
                    SelectableText('Wallet operation: ${item['operationId']}'),
                    SelectableText(
                      'Transfer: ${item['providerTransferId'] ?? 'Not yet confirmed'}',
                    ),
                    SelectableText(
                      'Payout: ${item['providerPayoutId'] ?? 'Not yet confirmed'}',
                    ),
                    Text(
                      'Funds ${item['reserved'] == true ? 'reserved for this payout' : 'reconciled'}',
                    ),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => _load(item['operationId'] as String),
                      child: const Text('Check provider status'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    ),
  );
}
