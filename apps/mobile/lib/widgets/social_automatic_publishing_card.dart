import 'package:flutter/material.dart';

class SocialAutomaticPublishingCard extends StatefulWidget {
  const SocialAutomaticPublishingCard({
    super.key,
    required this.policy,
    required this.planId,
    required this.invoke,
    required this.onChanged,
  });
  final Map? policy;
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
  int _cadence = 2;
  @override
  void initState() {
    super.initState();
    final saved = widget.policy?['maxPerWeek'];
    if (saved is int && saved >= 1 && saved <= 7) _cadence = saved;
  }
  Future<void> _change(String action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (action == 'enable') {
        final scope = await widget.invoke({
          'action': 'preview',
          'planId': widget.planId,
          'maxPerWeek': _cadence,
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
                  Text(
                    'Up to ${scope['maxPerWeek']} posts per week per channel',
                  ),
                  Text('Voice: ${scope['voice']}'),
                  Text('Services: ${(scope['services'] as List).join(', ')}'),
                  Text(
                    'Destinations: ${(scope['destinations'] as List).join(', ')}',
                  ),
                  Text(
                    'Through ${DateTime.fromMillisecondsSinceEpoch((scope['endsAt'] as num).toInt()).toLocal().toString().split(' ').first}',
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
          'action': 'enable',
          'planId': widget.planId,
          'maxPerWeek': _cadence,
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
              'Automatic publishing',
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
              DropdownButton<int>(
                value: _cadence,
                isExpanded: true,
                items: List.generate(
                  7,
                  (i) => DropdownMenuItem(
                    value: i + 1,
                    child: Text('Up to ${i + 1} posts/week per channel'),
                  ),
                ),
                onChanged: _busy
                    ? null
                    : (value) => setState(() => _cadence = value!),
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
                          : 'Review & Authorize Strategy',
                    ),
                  ),
                  if (widget.policy != null)
                    TextButton(
                      onPressed: _busy ? null : () => _change('enable'),
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
