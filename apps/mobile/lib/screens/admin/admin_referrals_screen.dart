import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../../navigation/context_back_button.dart';
import 'admin_role_gate.dart';

class AdminReferralsScreen extends StatefulWidget {
  const AdminReferralsScreen({super.key});
  @override
  State<AdminReferralsScreen> createState() => _AdminReferralsScreenState();
}

class _AdminReferralsScreenState extends State<AdminReferralsScreen> {
  final _functions = FirebaseFunctions.instanceFor(region: 'us-east1');
  Map<String, dynamic>? _data;
  bool _busy = false;
  String? _feedback;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final result = await _functions
          .httpsCallable('adminGetScalerAffiliateOverview')
          .call();
      if (mounted) {
        setState(() => _data = Map<String, dynamic>.from(result.data as Map));
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _feedback =
              'Referral review is unavailable. Retry to read the latest authority.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _money(dynamic value) =>
      '\$${((value as num? ?? 0) / 100).toStringAsFixed(2)}';
  Future<void> _review(Map<String, dynamic> reward) async {
    String reason = '';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Review referral economics'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'The server rechecks the source economics and records your review. This does not release or send money.',
            ),
            TextField(
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              onChanged: (value) => reason = value,
              decoration: const InputDecoration(labelText: 'Review note'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Record review'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    if (reason.trim().length < 10) {
      setState(
        () => _feedback = 'Add a review note of at least 10 characters.',
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await _functions.httpsCallable('adminReviewReferralRewardV1').call({
        'rewardId': reward['rewardId'],
        'expectedDigest': reward['authorityDigest'],
        'action': 'review',
        'reason': reason.trim(),
      });
      if (mounted) {
        setState(() => _feedback = 'Review recorded. No payment was sent.');
      }
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _feedback =
              'The reward needs another check. Refresh its current economics before review. No payment was sent.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AdminRoleGate(
    builder: (context) => Scaffold(
      appBar: AppBar(
        leading: const ContextBackButton(),
        title: const Text('Referral review'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Referral Program · Private Beta',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          const Text(
            'Automatic payouts are off. Pending liabilities remain separate from worker pay and Business funding.',
          ),
          if (_busy) const LinearProgressIndicator(),
          if (_feedback != null) Text(_feedback!),
          TextButton(
            onPressed: _busy ? null : _load,
            child: const Text('Refresh referral authority'),
          ),
          if (_data != null) ...[
            Text(
              '${(_data!['affiliates'] as List? ?? []).length} enrolled referrers',
            ),
            if ((_data!['rewards'] as List? ?? []).isEmpty)
              const Text(
                'No qualifying referral rewards have been recorded yet.',
              ),
            for (final raw in _data!['rewards'] as List? ?? [])
              Builder(
                builder: (context) {
                  final reward = Map<String, dynamic>.from(raw as Map);
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            reward['type'] == 'BUSINESS_SUBSCRIPTION_REFERRAL'
                                ? 'Business subscription referral'
                                : 'Scaler completed-work referral',
                          ),
                          Text(
                            'Liability: ${_money(reward['currentCents'])} · Paid: ${_money(reward['paidCents'])}',
                          ),
                          Text('Referrer: ${reward['beneficiaryUid']}'),
                          Text('Economic source: ${reward['sourceId']}'),
                          OutlinedButton(
                            onPressed: _busy ? null : () => _review(reward),
                            child: const Text('Review economics'),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            for (final issue in _data!['checks'] as List? ?? [])
              ListTile(
                title: const Text('Source reconciliation needs review'),
                subtitle: Text('${issue['id']} · ${issue['code']}'),
              ),
          ],
        ],
      ),
    ),
  );
}
