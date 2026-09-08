import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/business_workspace_service.dart';
import '../../services/platform_billing_service.dart';
import 'subscription_screen.dart';

class BusinessMembershipScreen extends StatefulWidget {
  const BusinessMembershipScreen({super.key, this.service, this.businessId});
  final BusinessWorkspaceService? service;
  final String? businessId;
  @override
  State<BusinessMembershipScreen> createState() =>
      _BusinessMembershipScreenState();
}

class _BusinessMembershipScreenState extends State<BusinessMembershipScreen> {
  late final _service = widget.service ?? BusinessWorkspaceService();
  Map<String, dynamic>? _data;
  bool _busy = false;
  String? _error, _requestId;
  String get _businessId =>
      widget.businessId ??
      BusinessWorkspaceSession.businessIdFor(
        FirebaseAuth.instance.currentUser!.uid,
      );
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _service.call('getBusinessMembership', {
        'businessId': _businessId,
      });
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'No membership could be verified. Retry, or choose a plan if you have not subscribed.',
        );
      }
    }
  }

  String get _end {
    final ms = _data?['periodEndMs'];
    if (ms is! num) return 'the verified end of your paid period';
    final d = DateTime.fromMillisecondsSinceEpoch(ms.toInt()).toLocal();
    return MaterialLocalizations.of(context).formatMediumDate(d);
  }

  Future<void> _change(String action) async {
    if (_busy) return;
    final cancel = action == 'cancel';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(cancel ? 'Cancel Membership?' : 'Reactivate Membership?'),
        content: Text(
          cancel
              ? 'Your ${_data?['planName']} plan remains active through $_end. You will not be charged another subscription renewal after cancellation is confirmed.\n\nFunded campaigns, accepted Scaler compensation and your history remain intact.'
              : 'Withdraw the pending cancellation and continue your existing subscription at its next renewal. Existing campaign obligations remain unchanged.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Keep Current Settings'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: Text(
              cancel ? 'Confirm Cancellation' : 'Confirm Reactivation',
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    _requestId ??=
        'membership_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 32)}';
    try {
      await _service.call('changeBusinessMembership', {
        'businessId': _businessId,
        'action': action,
        'requestId': _requestId,
      });
      _requestId = null;
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The change is not yet confirmed. Refresh membership to verify its status before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changePlan(String plan) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final quote = await _service.call('previewBusinessMembershipChange', {
        'businessId': _businessId,
        'plan': plan,
      });
      if (!mounted) return;
      final amount = (quote['amountDueCents'] as num) / 100;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: Text('Change to ${quote['planName']}?'),
          content: Text(
            '${quote['seatLimit']} total seats, including the owner. \$${quote['price']} per month.\n\n'
            'Stripe invoice preview: \$${amount.toStringAsFixed(2)} due. '
            '${quote['upgrade'] == true ? 'The prorated upgrade is invoiced now. Access changes only if payment succeeds.' : 'Changes take effect now; any unused-time credit is applied to the next invoice. Review Team first to choose who remains.'}\n\n'
            'Funded campaigns, accepted pay and history remain unchanged.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Keep Current Plan'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Confirm Plan Change'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      final requestId =
          'plan_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 32)}';
      await _service.call('changeBusinessMembership', {
        'businessId': _businessId,
        'action': 'changePlan',
        'plan': plan,
        'quoteId': quote['quoteId'],
        'requestId': requestId,
      });
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The plan change was not confirmed. Refresh membership. Check Team seats and payment methods before requesting another preview.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Billing / Plan')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 680),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              if (_error != null) ...[
                Text(_error!),
                FilledButton(
                  onPressed: _busy ? null : _load,
                  child: const Text('Refresh Membership'),
                ),
              ],
              if (data == null && _error == null)
                const Center(child: CircularProgressIndicator()),
              if (data != null) ...[
                Text(
                  data['planName']?.toString() ?? 'Membership',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                Text('\$${data['price']} per month'),
                Text(
                  data['cancelAtPeriodEnd'] == true
                      ? 'Paid access ends $_end. No further subscription renewal is scheduled.'
                      : 'Current renewal date: $_end',
                ),
                const SizedBox(height: 20),
                const Text(
                  'Your funded campaigns and accepted Scaler contracts continue independently of subscription cancellation. You can still sign in to view your historical records after the paid term ends, subject to our retention policy.',
                ),
                const SizedBox(height: 16),
                if (data['canCancel'] == true && data['changePending'] != true)
                  OutlinedButton(
                    onPressed: _busy ? null : () => _change('cancel'),
                    child: const Text('Cancel Membership'),
                  ),
                if (data['canWithdrawCancellation'] == true &&
                    data['changePending'] != true)
                  FilledButton(
                    onPressed: _busy ? null : () => _change('reactivate'),
                    child: const Text('Reactivate Membership'),
                  ),
                if (data['paidAccess'] == true && data['changePending'] != true)
                  DropdownButtonFormField<String>(
                    decoration: const InputDecoration(labelText: 'Change Plan'),
                    items: const [
                      DropdownMenuItem(
                        value: 'starter',
                        child: Text('Starter — \$99 / 1 seat'),
                      ),
                      DropdownMenuItem(
                        value: 'growth',
                        child: Text('Growth — \$299 / 3 seats'),
                      ),
                      DropdownMenuItem(
                        value: 'scale',
                        child: Text('Scale — \$499 / 5 seats'),
                      ),
                      DropdownMenuItem(
                        value: 'managed_growth',
                        child: Text('Managed Growth — \$999 / 10 seats'),
                      ),
                    ],
                    onChanged: _busy
                        ? null
                        : (plan) {
                            if (plan != null && plan != data['plan']) {
                              _changePlan(plan);
                            }
                          },
                  ),
                if (data['changePending'] == true)
                  const Text(
                    'A previous membership change is being reconciled. Refresh to confirm it.',
                  ),
                TextButton(
                  onPressed: _busy ? null : _load,
                  child: const Text('Refresh Membership'),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () async {
                          try {
                            await PlatformBillingService().purchaseSubscription(
                              businessId: _businessId,
                              plan: data['plan']?.toString() ?? 'starter',
                              manageExisting: true,
                            );
                          } catch (_) {
                            if (mounted) {
                              setState(
                                () => _error =
                                    'Secure billing could not open. Please retry.',
                              );
                            }
                          }
                        },
                  child: const Text('Payment Methods & Billing Records'),
                ),
              ],
              const SizedBox(height: 20),
              if (data?['paidAccess'] != true)
                OutlinedButton(
                  onPressed: _busy
                      ? null
                      : () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const SubscriptionScreen(),
                          ),
                        ),
                  child: Text(
                    data?['paidAccess'] == true
                        ? 'Compare Plans'
                        : 'Reactivate — Choose a Plan',
                  ),
                ),
              const Text(
                'The owner counts as one seat. Review Team and select who remains before moving to a smaller plan. No member or history is silently deleted.',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
