import 'dart:math';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/business_workspace_service.dart';
import '../../services/platform_billing_service.dart';
import 'subscription_screen.dart';
import '../../widgets/billing_selection_editor.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../navigation/app_router.dart';

class BusinessMembershipScreen extends StatefulWidget {
  const BusinessMembershipScreen({
    super.key,
    this.service,
    this.businessId,
    this.section,
  });
  final String? section;
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
  final _sectionKeys = {
    for (final name in ['cancel', 'upgrade', 'addons', 'history'])
      name: GlobalKey(),
  };
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
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final target = _sectionKeys[widget.section]?.currentContext;
          if (mounted && target != null) Scrollable.ensureVisible(target);
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Your membership details could not be loaded. Please retry. Do not choose another plan to resolve a loading problem.',
        );
      }
    }
  }

  String get _end {
    final ms = _data?['periodEndMs'];
    if (ms is! num) return 'the verified end of your paid period';
    final d = DateTime.fromMillisecondsSinceEpoch(ms.toInt()).toLocal();
    return widget.section == 'cancel'
        ? MaterialLocalizations.of(context).formatFullDate(d)
        : MaterialLocalizations.of(context).formatMediumDate(d);
  }

  String get _recurring {
    final cents = _data?['monthlyCents'];
    final price = cents is num ? cents / 100 : _data?['price'];
    return price is num ? '\$${price.toStringAsFixed(2)}' : 'verified';
  }

  Widget _cancellationView(BuildContext context) {
    final data = _data;
    final scheduled = data?['cancelAtPeriodEnd'] == true;
    final ended = data?['status'] == 'canceled';
    final status = switch (data?['status']) {
      'active' => 'Active',
      'trialing' => 'Trial active',
      'past_due' => 'Payment overdue',
      'canceled' => 'Ended',
      _ => 'Membership needs attention',
    };
    void account() => AppNavigation.replace(context, '/billing');
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cancel Membership'),
        leading: BackButton(onPressed: _busy ? null : account),
      ),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (data == null && _error == null)
                  const Center(child: CircularProgressIndicator()),
                if (_error != null) ...[
                  Text(
                    'Membership status could not be confirmed. Please refresh before making a change.',
                  ),
                  TextButton(
                    onPressed: _busy ? null : _load,
                    child: const Text('Refresh Membership'),
                  ),
                ],
                if (data != null) ...[
                  Text(
                    scheduled
                        ? 'Cancellation Scheduled'
                        : ended
                        ? 'Membership Ended'
                        : 'Cancel Membership',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 20),
                  Text('Current plan: ${data['planName']} — $_recurring/month'),
                  Text('Current status: $status'),
                  if (!scheduled && !ended)
                    Text(
                      data['complimentary'] == true
                          ? 'Complimentary access through $_end. No recurring charge.'
                          : 'Next renewal: $_recurring on $_end',
                    ),
                  const SizedBox(height: 24),
                  if (scheduled) ...[
                    Text(
                      'Your ${data['planName']} membership remains active until $_end.',
                    ),
                    const Text(
                      'You will not be charged another membership renewal unless you reactivate.',
                    ),
                  ] else if (!ended) ...[
                    const Text(
                      'If you cancel now:',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    Text('Your membership remains active until $_end.'),
                    const Text(
                      'You will not be charged the next recurring membership payment.',
                    ),
                  ],
                  const Text(
                    'Existing funded campaigns and accepted Scaler obligations continue. Billing and account history remain available according to our retention policy.',
                  ),
                  const SizedBox(height: 24),
                  if (scheduled && data['canWithdrawCancellation'] == true)
                    FilledButton(
                      onPressed: _busy || _error != null
                          ? null
                          : () => _change('reactivate'),
                      child: const Text('Reactivate Membership'),
                    ),
                  if (!scheduled && !ended) ...[
                    FilledButton(
                      onPressed: _busy ? null : account,
                      child: const Text('Keep My Membership'),
                    ),
                    if (data['scheduledChange'] != null) ...[
                      const Text(
                        'A future plan change is scheduled. Remove that change first, then schedule cancellation.',
                      ),
                      OutlinedButton(
                        onPressed: _busy || _error != null
                            ? null
                            : _removeScheduledChange,
                        child: const Text('Remove Scheduled Change'),
                      ),
                    ] else if (data['canCancel'] == true &&
                        data['changePending'] != true)
                      OutlinedButton(
                        onPressed: _busy || _error != null
                            ? null
                            : () => _change('cancel'),
                        child: const Text('Cancel at End of Billing Period'),
                      ),
                    if (data['changePending'] == true)
                      const Text(
                        'A membership change is still being confirmed. Refresh to check its status.',
                      ),
                  ],
                  if (scheduled || ended)
                    TextButton(
                      onPressed: _busy ? null : account,
                      child: const Text('Return to Account'),
                    ),
                  TextButton(
                    onPressed: _busy ? null : _load,
                    child: const Text('Refresh Membership'),
                  ),
                  if (_busy) const LinearProgressIndicator(),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _change(String action) async {
    if (_busy) return;
    final cancel = action == 'cancel';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(
          cancel ? 'Schedule cancellation?' : 'Reactivate Membership?',
        ),
        content: Text(
          cancel
              ? 'Your ${_data?['planName']} membership remains active through $_end. After that date your paid membership benefits will end. You will not be charged the next $_recurring membership renewal after cancellation is confirmed.\n\nFunded campaigns, accepted Scaler obligations and your history remain intact.'
              : 'Withdraw the pending cancellation and continue your existing subscription at its next renewal. Existing campaign obligations remain unchanged.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: Text(cancel ? 'Go Back' : 'Keep Current Settings'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: Text(
              cancel ? 'Schedule Cancellation' : 'Confirm Reactivation',
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
    if (widget.section == 'cancel') return _cancellationView(context);
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Billing / Plan')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 680),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
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
                  if (widget.section == 'cancel')
                    const Text(
                      'Review your membership below, then choose Cancel Membership to confirm. Opening this page does not cancel anything.',
                    ),
                  if (widget.section == 'upgrade' || widget.section == 'addons')
                    const Text(
                      'Review your current membership and choose a change below. Nothing changes until you confirm.',
                    ),
                  const Text('Current Plan'),
                  Text(
                    data['planName']?.toString() ?? 'Membership',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  Text(
                    data['complimentary'] == true
                        ? 'Complimentary access · No recurring charge'
                        : '\$${data['price']} per month',
                  ),
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
                    data['complimentary'] == true
                        ? 'Complimentary access through $_end. No automatic renewal charge.'
                        : data['cancelAtPeriodEnd'] == true
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
                      key: _sectionKeys['cancel'],
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
                      data['complimentary'] != true &&
                      data['changePending'] != true &&
                      data['scheduledChange'] == null &&
                      data['bundle'] == null &&
                      (data['addons'] as List? ?? []).isEmpty)
                    DropdownButtonFormField<String>(
                      key: _sectionKeys['upgrade'],
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Change Plan',
                      ),
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
                      data['complimentary'] != true &&
                      data['changePending'] != true &&
                      data['scheduledChange'] == null &&
                      data['cancelAtPeriodEnd'] != true) ...[
                    const SizedBox(height: 24),
                    Container(
                      key: _sectionKeys['addons'],
                      child: BillingSelectionEditor(
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
                        onChanged: (value) =>
                            setState(() => _selection = value),
                      ),
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
                  const SizedBox(height: 24),
                  Text(
                    key: _sectionKeys['history'],
                    'Billing History',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (data['billingHistoryStatus'] == 'complimentary')
                    const Text(
                      'This complimentary membership has no recurring subscription charge. Existing financial history is preserved.',
                    )
                  else if (data['billingHistoryStatus'] != 'verified')
                    const Text(
                      'Billing history could not be verified. Refresh Membership to retry.',
                    )
                  else if ((data['billingHistory'] as List? ?? []).isEmpty)
                    const Text('No reconciled membership payments yet.'),
                  for (final row in (data['billingHistory'] as List? ?? []))
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              row['description']?.toString() ??
                                  'Membership payment',
                            ),
                            if (row['dateMs'] is num)
                              Text(
                                MaterialLocalizations.of(
                                  context,
                                ).formatMediumDate(
                                  DateTime.fromMillisecondsSinceEpoch(
                                    (row['dateMs'] as num).toInt(),
                                  ).toLocal(),
                                ),
                              ),
                            Text(
                              '\$${((row['amountCents'] as num) / 100).toStringAsFixed(2)} · ${row['status']}',
                            ),
                            for (final entry in const {
                              'invoiceUrl': 'View Invoice',
                              'pdfUrl': 'Download Invoice',
                            }.entries)
                              if (row[entry.key] is String)
                                TextButton(
                                  onPressed: () async {
                                    final uri = Uri.tryParse(
                                      row[entry.key] as String,
                                    );
                                    if (uri == null ||
                                        uri.scheme != 'https' ||
                                        !const {
                                          'invoice.stripe.com',
                                          'pay.stripe.com',
                                        }.contains(uri.host)) {
                                      return;
                                    }
                                    final opened = await launchUrl(
                                      uri,
                                      mode: LaunchMode.externalApplication,
                                    );
                                    if (!opened && mounted) {
                                      setState(
                                        () => _error =
                                            'The invoice could not open. Please retry.',
                                      );
                                    }
                                  },
                                  child: Text(entry.value),
                                ),
                          ],
                        ),
                      ),
                    ),
                  TextButton(
                    onPressed: _busy ? null : _load,
                    child: const Text('Refresh Membership'),
                  ),
                  if (data['complimentary'] != true)
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              try {
                                await PlatformBillingService()
                                    .purchaseSubscription(
                                      businessId: _businessId,
                                      plan:
                                          data['plan']?.toString() ?? 'starter',
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
                if (data != null &&
                    _error == null &&
                    data['paidAccess'] != true)
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
                      data['paidAccess'] == true
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
      ),
    );
  }
}
