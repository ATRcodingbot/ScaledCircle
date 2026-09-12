import 'package:flutter/material.dart';
import '../../services/market_rollout_service.dart';

class AdminMarketRolloutScreen extends StatefulWidget {
  const AdminMarketRolloutScreen({super.key, this.call});
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>)? call;
  @override
  State<AdminMarketRolloutScreen> createState() =>
      _AdminMarketRolloutScreenState();
}

class _AdminMarketRolloutScreenState extends State<AdminMarketRolloutScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    _run({'action': 'demand'});
  }

  Future<void> _run(Map<String, dynamic> input) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final call = widget.call ?? MarketRolloutService.admin;
      final result = await call(input);
      final data = input['action'] == 'demand'
          ? result
          : await call({'action': 'demand'});
      if (mounted) setState(() => _data = data);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Could not confirm market status. Refresh before trying again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _change(Map row, String status) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Change ${row['name']} to ${_label(status)}?'),
        content: const Text(
          'This changes new marketplace eligibility. Account, legal, payment and safety checks still apply. Existing work and history remain intact. No launch messages will be sent by this action.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep current status'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm change'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _run({
        'action': 'setStatus',
        'stateId': row['id'],
        'status': status,
        'expectedRevision': _data!['revision'],
      });
    }
  }

  String _label(String status) => switch (status) {
    'ACTIVE' => 'Active',
    'PAUSED' => 'Paused',
    _ => 'Prelaunch',
  };
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Markets & signup demand')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'State is reported separately from job-alert service areas. Counts include Business owners and Scalers, not extra Business team seats.',
            ),
            const SizedBox(height: 12),
            const Text(
              'Activating a state does not activate LIVE payouts or bypass paid-work readiness.',
            ),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Semantics(liveRegion: true, child: Text(_error!)),
            TextButton(
              onPressed: _busy ? null : () => _run({'action': 'demand'}),
              child: const Text('Refresh counts'),
            ),
            if (_data != null) ...[
              if (_data!['initialized'] != true)
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () => _run({'action': 'initialize'}),
                  child: const Text(
                    'Initialize Maryland Active; other states Prelaunch',
                  ),
                ),
              Card(
                child: ListTile(
                  title: const Text('Unknown — state not confirmed'),
                  subtitle: Text(
                    '${(_data!['unknown'] as Map)['businesses']} Businesses · ${(_data!['unknown'] as Map)['scalers']} Scalers\nExisting locations have not been guessed.',
                  ),
                ),
              ),
              for (final row in _data!['rows'] as List)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          row['name'] as String,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        Text(
                          '${row['businesses']} Businesses · ${row['scalers']} Scalers',
                        ),
                        DropdownButton<String>(
                          value: row['status'] as String,
                          isExpanded: true,
                          items: [
                            for (final value in [
                              'PRELAUNCH',
                              'ACTIVE',
                              'PAUSED',
                            ])
                              DropdownMenuItem(
                                value: value,
                                child: Text(_label(value)),
                              ),
                          ],
                          onChanged: _busy || _data!['initialized'] != true
                              ? null
                              : (value) {
                                  if (value != null && value != row['status']) {
                                    _change(row as Map, value);
                                  }
                                },
                        ),
                      ],
                    ),
                  ),
                ),
              const Text(
                'Additional funnel and county-supply metrics: not measured in this view. No historical activity has been inferred.',
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
