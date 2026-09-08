import 'package:flutter/material.dart';
import 'local_work_time.dart';
import '../services/job_room_service.dart';

class PausedWorkPanel extends StatefulWidget {
  const PausedWorkPanel({
    super.key,
    required this.zoneId,
    required this.data,
    required this.business,
    required this.onChanged,
    required this.onResume,
    required this.onMessage,
    this.service = const JobRoomService(),
  });
  final String zoneId;
  final Map<String, dynamic> data;
  final bool business;
  final Future<void> Function() onChanged;
  final VoidCallback onResume, onMessage;
  final JobRoomService service;
  @override
  State<PausedWorkPanel> createState() => _PausedWorkPanelState();
}

class _PausedWorkPanelState extends State<PausedWorkPanel> {
  bool _busy = false;
  String? _error;
  Future<void> _act(String action, {int? amount, String? reason}) async {
    final offer = widget.data['offer'] as Map?;
    final cents = action == 'accept_offer'
        ? (offer?['amountCents'])
        : (widget.data['securedBaseCents'] as num? ?? 0) +
              (widget.data['eligibleBonusCents'] as num? ?? 0);
    if (action == 'accept_current' || action == 'accept_offer') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            action == 'accept_offer'
                ? 'Accept partial payment?'
                : 'Accept current work?',
          ),
          content: Text(
            'Approve \$${((cents as num? ?? 0) / 100).toStringAsFixed(2)} for this saved work? This closes the assignment. Any unused reserve and its fee return to the Business.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Go back'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.service.reviewPausedWork(
        widget.zoneId,
        action,
        amountCents: amount,
        reason: reason,
        offerId: offer?['offerId']?.toString(),
      );
      await widget.onChanged();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The action could not be confirmed. Refresh saved work, then retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _offer() async {
    final amount = TextEditingController(), reason = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Offer Partial Payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Offer an exact amount for the saved work. The Scaler must explicitly accept; no payment is guaranteed.',
            ),
            TextField(
              controller: amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Payment amount (USD)',
              ),
            ),
            TextField(
              controller: reason,
              decoration: const InputDecoration(labelText: 'Reason'),
              maxLength: 1000,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Send offer'),
          ),
        ],
      ),
    );
    final parsed = double.tryParse(amount.text),
        explanation = reason.text.trim();
    amount.dispose();
    reason.dispose();
    if (confirmed != true || !mounted) return;
    if (parsed == null ||
        !parsed.isFinite ||
        parsed <= 0 ||
        explanation.isEmpty) {
      setState(() => _error = 'Enter a positive amount and a reason.');
      return;
    }
    await _act(
      'offer_partial',
      amount: (parsed * 100).round(),
      reason: explanation,
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data,
        canResume = d['canResume'] == true,
        estimate = d['estimate'] as Map? ?? {},
        percent = estimate['coveragePercentage'];
    final expired = d['state'] == 'incomplete_review',
        offer = d['offer'] as Map?;
    final deadline = localWorkTime(
      context,
      d['resumeByMs'] is num
          ? DateTime.fromMillisecondsSinceEpoch(
              (d['resumeByMs'] as num).toInt(),
            )
          : null,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              expired ? 'Incomplete — Review Required' : 'Work paused',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Text(
              'Route Coverage Estimate: ${percent is num ? '${percent.toStringAsFixed(1)}%' : 'Calculating'}',
            ),
            Text('Resume by $deadline (local time)'),
            Text(
              widget.business
                  ? 'Saved work is preserved. No action is needed to allow the 24-hour resume window.'
                  : 'Your route is saved. GPS is stopped until you resume this job.',
            ),
            if (expired)
              const Text(
                'The resume window ended. Evidence and any secured base or bonus remain protected for review.',
              ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            if (!widget.business && canResume)
              FilledButton(
                onPressed: _busy ? null : widget.onResume,
                child: const Text('Resume Job'),
              ),
            if (widget.business && d['securedBaseCents'] != null)
              FilledButton(
                onPressed: _busy ? null : () => _act('accept_current'),
                child: const Text('Accept Current Work'),
              ),
            if (widget.business &&
                percent is num &&
                percent < 80 &&
                offer?['state'] != 'offered')
              OutlinedButton(
                onPressed: _busy ? null : _offer,
                child: const Text('Offer Partial Payment'),
              ),
            if (offer?['state'] == 'offered') ...[
              Text(
                'Partial payment offered: \$${((offer!['amountCents'] as num) / 100).toStringAsFixed(2)}',
              ),
              Text(offer['reason']?.toString() ?? ''),
              if (!widget.business) ...[
                FilledButton(
                  onPressed: _busy ? null : () => _act('accept_offer'),
                  child: const Text('Review and Accept Offer'),
                ),
                TextButton(
                  onPressed: _busy ? null : () => _act('decline_offer'),
                  child: const Text('Decline Offer'),
                ),
              ],
            ],
            TextButton(
              onPressed: widget.onMessage,
              child: Text(
                widget.business ? 'Message Scaler' : 'Message Business',
              ),
            ),
            TextButton(
              onPressed: _busy ? null : widget.onChanged,
              child: const Text('Refresh saved work'),
            ),
          ],
        ),
      ),
    );
  }
}
