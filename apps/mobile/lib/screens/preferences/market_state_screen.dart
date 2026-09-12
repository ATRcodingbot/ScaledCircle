import 'package:flutter/material.dart';
import '../../services/market_rollout_service.dart';
import '../../widgets/authenticated_sign_out_button.dart';

String marketStatusMessage(
  Map<String, dynamic> value, {
  bool business = false,
}) {
  if (value['stateConfirmed'] != true) {
    return 'Choose your state to see marketplace availability.';
  }
  if (value['status'] == 'ACTIVE') {
    return 'Your state is active. Job alerts still follow your saved service areas. Paid work remains subject to account and payment readiness.';
  }
  if (value['status'] == 'PAUSED') {
    return 'New marketplace work is paused in your state. Your profile and existing work history are preserved.';
  }
  return business
      ? 'ScaledCircle marketplace campaigns are not active in this state yet. Finish your profile and choose whether to receive launch updates.'
      : "ScaledCircle isn't active in your state yet. Finish your profile and choose launch updates to hear when opportunities launch in your area. Jobs will appear as Businesses post work.";
}

class MarketStateScreen extends StatefulWidget {
  const MarketStateScreen({super.key, this.onCompleted, this.load, this.save});
  final VoidCallback? onCompleted;
  final Future<Map<String, dynamic>> Function()? load;
  final Future<Map<String, dynamic>> Function(String, bool)? save;
  @override
  State<MarketStateScreen> createState() => _MarketStateScreenState();
}

class _MarketStateScreenState extends State<MarketStateScreen> {
  Map<String, dynamic>? _value;
  String? _selected, _error;
  bool _notifications = false, _busy = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final value = await (widget.load ?? MarketRolloutService.load)();
      if (mounted) {
        setState(() {
          _value = value;
          _selected = (value['state'] as Map?)?['id']?.toString();
          _notifications = value['launchNotifications'] == true;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'State status could not be loaded. Please retry.',
        );
      }
    }
  }

  Future<void> _save() async {
    if (_selected == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final value = await (widget.save ?? MarketRolloutService.save)(
        _selected!,
        _notifications,
      );
      if (value['stateConfirmed'] != true ||
          (value['state'] as Map?)?['id'] != _selected) {
        throw StateError('Readback failed');
      }
      if (!mounted) return;
      setState(() => _value = value);
      if (widget.onCompleted != null) {
        widget.onCompleted!();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('State and launch preference saved.')),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Your state was not confirmed. Retry to check and save it.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Your state'),
      actions: const [AuthenticatedSignOutButton()],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'Which state are you based in?',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            const Text(
              'This helps ScaledCircle open markets and understand demand. No home address is needed. Your state does not subscribe you to statewide job alerts.',
            ),
            const SizedBox(height: 20),
            if (_value != null) ...[
              DropdownButtonFormField<String>(
                initialValue: _selected,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'State'),
                items: [
                  for (final state in _value!['states'] as List)
                    DropdownMenuItem(
                      value: state['id'] as String,
                      child: Text(state['name'] as String),
                    ),
                ],
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _selected = value),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _notifications,
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _notifications = value == true),
                title: const Text('Let me know when my state launches'),
                subtitle: const Text(
                  'Launch updates do not promise immediate work. Nearby job alerts use your saved service areas.',
                ),
              ),
              Text(marketStatusMessage(_value!)),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy || _selected == null ? null : _save,
                child: Text(
                  _busy
                      ? 'Saving…'
                      : widget.onCompleted != null
                      ? 'Save and continue'
                      : 'Save state',
                ),
              ),
            ] else if (_error == null)
              const Center(child: CircularProgressIndicator()),
            if (_error != null) ...[
              Semantics(liveRegion: true, child: Text(_error!)),
              TextButton(
                onPressed: _busy ? null : _load,
                child: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}

class MarketStatusCard extends StatefulWidget {
  const MarketStatusCard({super.key, this.business = false, this.load});
  final bool business;
  final Future<Map<String, dynamic>> Function()? load;
  @override
  State<MarketStatusCard> createState() => _MarketStatusCardState();
}

class _MarketStatusCardState extends State<MarketStatusCard> {
  late Future<Map<String, dynamic>> _value;
  @override
  void initState() {
    super.initState();
    _value = (widget.load ?? MarketRolloutService.load)();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _value,
    builder: (context, snapshot) => Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              (snapshot.data?['state'] as Map?)?['name']?.toString() ??
                  'Marketplace availability',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              snapshot.hasError
                  ? 'State status is unavailable. Open Your state to retry.'
                  : snapshot.hasData
                  ? marketStatusMessage(
                      snapshot.data!,
                      business: widget.business,
                    )
                  : 'Checking state availability…',
            ),
            TextButton(
              onPressed: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const MarketStateScreen()),
                );
                if (mounted) {
                  setState(
                    () => _value = (widget.load ?? MarketRolloutService.load)(),
                  );
                }
              },
              child: const Text('Your state & launch updates'),
            ),
          ],
        ),
      ),
    ),
  );
}
