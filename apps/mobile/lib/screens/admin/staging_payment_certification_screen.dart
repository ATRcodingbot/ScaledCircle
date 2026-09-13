import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_environment.dart';

typedef CertificationCall =
    Future<Map<String, dynamic>> Function(Map<String, dynamic> input);

class StagingPaymentCertificationScreen extends StatefulWidget {
  const StagingPaymentCertificationScreen({super.key, this.call, this.staging});
  final CertificationCall? call;
  final bool? staging;
  @override
  State<StagingPaymentCertificationScreen> createState() =>
      _CertificationState();
}

class _CertificationState extends State<StagingPaymentCertificationScreen> {
  Map<String, dynamic>? _state;
  String? _error;
  bool _busy = false;
  final _notes = TextEditingController();
  bool get _staging => widget.staging ?? AppEnvironmentConfig.isStaging;
  @override
  void initState() {
    super.initState();
    if (_staging) _run('get');
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _run(String action, {bool confirmed = false}) async {
    if (_busy || !_staging) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final input = <String, dynamic>{
        'action': action,
        if (confirmed) 'attested': true,
        if (action == 'submit') 'notes': _notes.text.trim(),
      };
      final result = widget.call != null
          ? await widget.call!(input)
          : Map<String, dynamic>.from(
              (await FirebaseFunctions.instanceFor(region: 'us-east1')
                          .httpsCallable('stagingPaymentCertificationV1')
                          .call(input))
                      .data
                  as Map,
            );
      if (mounted) setState(() => _state = result);
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(
          () => _error =
              e.message ??
              'Could not verify the task. Refresh before retrying.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Could not verify the task. Refresh before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _action(String action) async {
    final copy = switch (action) {
      'create' =>
        'Create this single private staging task? No payment or completion will be created.',
      'checkout' =>
        'Prepare one \$6.00 TEST Checkout: \$5.00 compensation and \$1.00 fee. Use Stripe test details only.',
      'accept' =>
        'Accept this non-GPS task for \$5.00 TEST compensation and no bonus?',
      'submit' =>
        'Confirm that you performed the assigned checks and that your notes describe the actual result. Submission does not approve payment.',
      'approve' =>
        'Approve the submitted checks and record \$5.00 TEST compensation? The \$0.05 referral reward is separate, funded by ScaledCircle and held for review. This does not execute a cash-out.',
      _ => null,
    };
    if (copy != null) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Staging certification'),
          content: Text(copy),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Back'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm'),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    await _run(action, confirmed: copy != null);
  }

  static const _labels = {
    'create': 'Create staging task',
    'checkout': 'Prepare TEST payment',
    'apply': 'Apply for this task',
    'assign': 'Assign intended Scaler',
    'accept': 'Accept task',
    'submit': 'Submit checks for Business review',
    'approve': 'Approve \$5 TEST compensation',
  };
  static const _states = {
    'not_created': 'Ready to create',
    'created': 'Awaiting funding and application',
    'applied': 'Application received',
    'assigned': 'Awaiting Scaler acceptance',
    'accepted': 'Ready for your checks',
    'submitted': 'Awaiting Business review',
    'approved': 'Approved — TEST earning recorded',
  };

  @override
  Widget build(BuildContext context) {
    final s = _state;
    return Scaffold(
      appBar: AppBar(title: const Text('Staging payment certification')),
      body: !_staging
          ? const Center(child: Text('Unavailable in production'))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'STAGING • TEST ONLY',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const Text(
                        'LIVE payments are blocked. No GPS, route, location or photo evidence is collected.',
                      ),
                      const SizedBox(height: 16),
                      if (s != null) ...[
                        Text(
                          s['task'] as String? ?? '',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 12),
                        Text(_states[s['status']] ?? 'Status needs review'),
                        const Text(
                          'Fixed compensation: \$5.00 TEST\nBonus: \$0.00\nPlatform fee: \$1.00\nTotal Business funding: \$6.00 TEST',
                        ),
                        const Text(
                          'Check the assigned-task and submission experience, and report the Wallet/cash-out state you actually see. Bank payout certification is a separate step.',
                        ),
                        const Text(
                          'The \$0.05 referral reward does not come out of the Scaler’s pay. It stays pending review; signup alone earns nothing.',
                        ),
                        Text('Funding: ${s['fundingStatus']}'),
                        if ((s['notes'] as String? ?? '').isNotEmpty) ...[
                          const SizedBox(height: 12),
                          const Text(
                            'Submitted observations',
                            style: TextStyle(fontWeight: FontWeight.bold),
                          ),
                          Text(s['notes'] as String),
                        ],
                        if (s['role'] == 'scaler' && s['status'] == 'accepted')
                          TextField(
                            controller: _notes,
                            minLines: 4,
                            maxLines: 8,
                            maxLength: 2000,
                            enabled: !_busy,
                            decoration: const InputDecoration(
                              labelText:
                                  'What did you check, and what happened?',
                              helperText:
                                  'Report actual results, including anything blocked. Do not claim a payout that has not occurred.',
                            ),
                          ),
                        const SizedBox(height: 16),
                        for (final action
                            in (s['actions'] as List? ?? []).cast<String>())
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: FilledButton(
                              onPressed: _busy ? null : () => _action(action),
                              child: Text(_labels[action] ?? 'Refresh'),
                            ),
                          ),
                        if (s['checkoutUrl'] is String)
                          OutlinedButton(
                            onPressed: _busy
                                ? null
                                : () async {
                                    final uri = Uri.parse(
                                      s['checkoutUrl'] as String,
                                    );
                                    if (uri.scheme == 'https' &&
                                        uri.host == 'checkout.stripe.com') {
                                      await launchUrl(
                                        uri,
                                        mode: LaunchMode.externalApplication,
                                      );
                                    }
                                  },
                            child: const Text('Open existing TEST Checkout'),
                          ),
                      ],
                      if (_busy) const LinearProgressIndicator(),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(_error!),
                        ),
                      TextButton(
                        onPressed: _busy ? null : () => _run('get'),
                        child: const Text('Refresh status'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}
