import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/business_workspace_service.dart';
import '../../services/platform_billing_service.dart';
import 'subscription_screen.dart';
import '../../widgets/billing_selection_editor.dart';

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
  Map<String, dynamic>? _selection;
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
            'Invoice preview: \$${amount.toStringAsFixed(2)} due. '
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

  Future<void> _changeSelection() async {
    if (_busy || _selection == null) return;
    setState(() => _busy = true);
    try {
      final quote = await _service.call('previewBusinessMembershipChange', {
        'businessId': _businessId,
        'selection': _selection,
      });
      if (!mounted) return;
      final effective = DateTime.fromMillisecondsSinceEpoch(
        (quote['effectiveAtMs'] as num).toInt(),
      ).toLocal();
      final date = MaterialLocalizations.of(
        context,
      ).formatMediumDate(effective);
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('Review plan & add-on change'),
          content: Text(
            'New recurring total: \$${((quote['monthlyCents'] as num) / 100).toStringAsFixed(2)}/month. ${quote['seatLimit']} total users, including the owner.\n\nEffective $date at renewal. Your current paid access continues until then. No change charge today.\n\nNext-invoice preview: \$${((quote['amountDueCents'] as num) / 100).toStringAsFixed(2)}. Taxes and any existing credits are included in this preview. The bundle replaces its individual components; it never adds duplicate charges.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Keep Current Membership'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Confirm Change at Renewal'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      await _service.call('changeBusinessMembership', {
        'businessId': _businessId,
        'action': 'changeSelection',
        'quoteId': quote['quoteId'],
        'requestId':
            'selection_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 32)}',
      });
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The selection change is not confirmed. Refresh membership to reconcile the provider result. No access is granted by this screen.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeScheduledChange() async {
    if (_busy) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Keep your current membership?'),
        content: const Text(
          'Remove the future plan/add-on change. Your current membership continues. You can then cancel renewal or choose a different selection.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Go Back'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Remove Scheduled Change'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await _service.call('changeBusinessMembership', {
        'businessId': _businessId,
        'action': 'cancelScheduledChange',
        'requestId':
            'unschedule_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 32)}',
      });
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The scheduled change could not be cleared. Refresh to verify provider state.',
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
                const Text('Current Plan'),
                Text(
                  data['planName']?.toString() ?? 'Membership',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                Text('\$${data['price']} per month'),
                const SizedBox(height: 12),
                if (data['seatStatus'] == 'verified' &&
                    data['seatsUsed'] is num &&
                    data['seatLimit'] is num &&
                    data['seatsAvailable'] is num) ...[
                  Text(
                    '${data['seatsUsed']} of ${data['seatLimit']} seats used',
                  ),
                  Text(
                    '${data['seatsAvailable']} seats available · Owner included',
                  ),
                  if ((data['seatsReserved'] as num? ?? 0) > 0)
                    Text(
                      '${data['seatsReserved']} ${data['seatsReserved'] == 1 ? 'seat' : 'seats'} reserved for invitations',
                    ),
                  if ((data['seatsUsed'] as num) > (data['seatLimit'] as num))
                    const Text(
                      'Review your team: current membership exceeds this plan’s capacity.',
                    ),
                ] else ...[
                  const Text('Seat availability could not be verified.'),
                  TextButton(
                    onPressed: _busy ? null : _load,
                    child: const Text('Retry Seat Availability'),
                  ),
                ],
                const SizedBox(height: 12),
                const Text(
                  'Active Add-ons',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                if ((data['addons'] as List? ?? []).isEmpty)
                  const Text('No paid add-ons'),
                for (final addon in (data['addons'] as List? ?? []))
                  Text(
                    data['bundle'] == 'growth_department'
                        ? '${addon == 'business_assistant' ? 'Business Assistant — Beta' : 'Lead Generation Research — Beta'} · Included in Growth Department'
                        : billingAddOnLabels[addon] ?? 'Verified add-on',
                  ),
                if (data['scheduledChange'] is Map) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Scheduled at renewal: \$${(((data['scheduledChange'] as Map)['monthlyCents'] as num) / 100).toStringAsFixed(2)}/month. Current access remains through $_end.',
                  ),
                  OutlinedButton(
                    onPressed: _busy ? null : _removeScheduledChange,
                    child: const Text('Remove Scheduled Change'),
                  ),
                ],
                Text(
                  data['cancelAtPeriodEnd'] == true
                      ? 'Paid access ends $_end. No further subscription renewal is scheduled.'
                      : 'Next renewal date: $_end',
                ),
                const SizedBox(height: 20),
                const Text(
                  'Your funded campaigns and accepted Scaler contracts continue independently of subscription cancellation. You can still sign in to view your historical records after the paid term ends, subject to our retention policy.',
                ),
                const SizedBox(height: 16),
                if (data['canCancel'] == true &&
                    data['changePending'] != true &&
                    data['scheduledChange'] == null)
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
                if (data['paidAccess'] == true &&
                    data['changePending'] != true &&
                    data['scheduledChange'] == null &&
                    data['bundle'] == null &&
                    (data['addons'] as List? ?? []).isEmpty)
                  DropdownButtonFormField<String>(
                    isExpanded: true,
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
                if (data['paidAccess'] == true &&
                    data['changePending'] != true &&
                    data['scheduledChange'] == null &&
                    data['cancelAtPeriodEnd'] != true) ...[
                  const SizedBox(height: 24),
                  BillingSelectionEditor(
                    key: ValueKey(
                      '${data['plan']}:${data['bundle']}:${data['addons']}',
                    ),
                    initial: {
                      'plan': data['plan'],
                      'bundle': data['bundle'],
                      'addons': data['bundle'] == null
                          ? data['addons'] ?? []
                          : [],
                    },
                    enabled: !_busy,
                    onChanged: (value) => setState(() => _selection = value),
                  ),
                  FilledButton(
                    onPressed: _busy || _selection == null
                        ? null
                        : _changeSelection,
                    child: const Text('Review Plan & Add-on Changes'),
                  ),
                ],
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
