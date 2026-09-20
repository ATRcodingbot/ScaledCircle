import 'package:flutter/material.dart';

class SocialAutomaticPublishingCard extends StatefulWidget {
  const SocialAutomaticPublishingCard({
    super.key,
    required this.policy,
    required this.planId,
    required this.invoke,
    required this.onChanged,
    this.initialAdaptive = false,
  });
  final Map? policy;
  final bool initialAdaptive;
  final String? planId;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) invoke;
  final Future<void> Function() onChanged;
  @override
  State<SocialAutomaticPublishingCard> createState() =>
      _SocialAutomaticPublishingCardState();
}

class _SocialAutomaticPublishingCardState
    extends State<SocialAutomaticPublishingCard> {
  bool _busy = false;
  String? _error;
  int _cadence = 5;
  bool _adaptive = false;
  @override
  void initState() {
    super.initState();
    _adaptive = widget.policy == null
        ? widget.initialAdaptive
        : widget.policy?['cadence']?['mode'] == 'adaptive';
    final saved = widget.policy?['maxPerWeek'];
    if (saved is int && saved >= 1) _cadence = saved;
  }

  Future<void> _change(String action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (action == 'enable' || action == 'cadence') {
        final scope = await widget.invoke({
          'action': 'preview',
          'planId': widget.planId,
          'maxPerWeek': _cadence,
          'cadenceSettings': {'mode': _adaptive ? 'adaptive' : 'fixed'},
        });
        if (!mounted) return;
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Authorize automatic publishing'),
            content: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${scope['businessName']}'),
                  Text('Channels: ${(scope['providers'] as List).join(', ')}'),
                  for (final account
                      in (scope['providerAccounts'] as List? ?? const [])
                          .whereType<Map>())
                    Text(
                      '${account['provider']}: ${account['name']}${account['handle'] == null ? '' : ' · @${account['handle']}'}',
                    ),
                  if (scope['strategy'] is Map)
                    Text(
                      'Audience: ${scope['strategy']['audience'] ?? 'Your maintained Business audience'}\n${scope['strategy']['claims'] ?? ''}',
                    ),
                  Text(
                    scope['spending']?.toString() ??
                        'Existing creative allowances and provider limits apply. No additional spending or paid upgrades are authorized.',
                  ),
                  Text('Publishing timezone: ${scope['timeZone']}'),
                  Text(
                    'Starting target: ${scope['maxPerWeek']} posts/week per channel. ${_adaptive ? 'Performance-driven cadence; changes require comparable evidence and remain subject to quality, cost and provider safeguards.' : 'Fixed cadence.'}',
                  ),
                  Text('Voice: ${scope['voice']}'),
                  Text('Services: ${(scope['services'] as List).join(', ')}'),
                  Text(
                    'Destinations: ${(scope['destinations'] as List).join(', ')}',
                  ),
                  Text(
                    'Authorization ends ${scope['endsAtLabel'] ?? '${DateTime.fromMillisecondsSinceEpoch((scope['endsAt'] as num).toInt(), isUtc: true).toIso8601String()} UTC'}',
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Routine posts within this strategy may be prepared, scheduled and published automatically. You do not need to approve each post. Posts needing judgment will ask for attention. You can pause publishing or change your strategy at any time.',
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Not now'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Authorize automatic publishing'),
              ),
            ],
          ),
        );
        if (confirmed != true) return;
        await widget.invoke({
          'action': action,
          'planId': widget.planId,
          'maxPerWeek': _cadence,
          'cadenceSettings': {'mode': _adaptive ? 'adaptive' : 'fixed'},
          'reviewDigest': scope['reviewDigest'],
          'confirmAutomaticPublishing': true,
        });
      } else {
        await widget.invoke({'action': action});
      }
      await widget.onChanged();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Publishing settings could not be confirmed. Check your current strategy and connected accounts, then try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _date(dynamic value) => value is num
      ? DateTime.fromMillisecondsSinceEpoch(
          value.toInt(),
          isUtc: true,
        ).toIso8601String()
      : 'Not evaluated';

  @override
  Widget build(BuildContext context) {
    final end = widget.policy?['endsAt'];
    final current = end is num && end > DateTime.now().millisecondsSinceEpoch;
    final active = widget.policy?['status'] == 'active' && current;
    final paused = widget.policy?['status'] == 'paused' && current;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              active
                  ? 'Automatic publishing: Authorized'
                  : paused
                  ? 'Automatic publishing: Paused'
                  : 'Automatic publishing: Not authorized',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text(
              active
                  ? 'Routine posts are scheduled within your approved strategy. Only exceptions need your attention.'
                  : paused
                  ? 'Publishing is paused. Your strategy and post history are preserved.'
                  : 'Authorize your strategy once. Routine posts can then schedule without individual approval.',
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (widget.planId != null) ...[
              TextFormField(
                initialValue: _cadence.toString(),
                decoration: const InputDecoration(
                  labelText: 'Starting posts/week per channel',
                ),
                keyboardType: TextInputType.number,
                enabled: !_busy,
                onChanged: (value) {
                  final parsed = int.tryParse(value);
                  if (parsed != null && parsed > 0) _cadence = parsed;
                },
              ),
              SwitchListTile(
                title: const Text('Adapt cadence from measured results'),
                subtitle: const Text(
                  'Frequency can increase or decrease from comparable results. No extra generation allowance or spending is authorized.',
                ),
                value: _adaptive,
                onChanged: _busy
                    ? null
                    : (value) => setState(() {
                        _adaptive = value;
                      }),
              ),
              const Text(
                'Scheduling preserves at least six hours between posts on each platform. Creative allowance, quality and provider limits may reduce available slots.',
              ),
              if (widget.policy?['cadence'] is Map)
                for (final entry
                    in ((widget.policy!['cadence'] as Map)['platforms']
                                as Map? ??
                            {})
                        .entries)
                  Text(
                    '${entry.key}: ${entry.value['currentPerWeek']} posts/week · ${(widget.policy!['cadence'] as Map)['mode']}\n${entry.value['reason']}\nLast evaluation: ${entry.value['lastEvaluatedLabel'] ?? _date(entry.value['lastEvaluatedAt'])} · Next: ${entry.value['nextEvaluationLabel'] ?? _date(entry.value['nextEvaluationAt'])}',
                  ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton(
                    onPressed: _busy
                        ? null
                        : () => _change(
                            active
                                ? 'pause'
                                : paused
                                ? 'resume'
                                : 'enable',
                          ),
                    child: Text(
                      active
                          ? 'Pause Publishing'
                          : paused
                          ? 'Resume Publishing'
                          : 'Authorize automatic publishing',
                    ),
                  ),
                  if (widget.policy != null)
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => _change(current ? 'cadence' : 'enable'),
                      child: const Text('Change publishing preferences'),
                    ),
                ],
              ),
            ] else
              const Text('Approve your current 30-day strategy first.'),
          ],
        ),
      ),
    );
  }
}
