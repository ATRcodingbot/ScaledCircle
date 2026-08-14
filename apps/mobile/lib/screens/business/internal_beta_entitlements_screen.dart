import 'package:flutter/material.dart';

import '../../services/secure_function_service.dart';

class InternalBetaEntitlementsScreen extends StatefulWidget {
  const InternalBetaEntitlementsScreen({super.key});

  @override
  State<InternalBetaEntitlementsScreen> createState() =>
      _InternalBetaEntitlementsScreenState();
}

class _InternalBetaEntitlementsScreenState
    extends State<InternalBetaEntitlementsScreen> {
  final _emailController = TextEditingController();
  final _reasonController = TextEditingController();
  final _functions = const SecureFunctionService();
  int _durationDays = 90;
  bool _working = false;
  String? _result;

  @override
  void dispose() {
    _emailController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<bool> _confirm(String action) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('$action internal beta access?'),
          content: Text(
            action == 'Grant'
                ? 'This creates a comped Managed Growth entitlement. It does not create a payment or Stripe subscription.'
                : 'This revokes only internal beta authority. Paid Stripe authority is not changed.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text(action),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _grant() async {
    final email = _emailController.text.trim();
    final reason = _reasonController.text.trim();
    if (email.isEmpty || reason.isEmpty || !await _confirm('Grant')) return;
    await _call(
      'grantInternalBetaEntitlement',
      {
        'businessEmail': email,
        'plan': 'managed_growth',
        'reason': reason,
        'expiresAt': DateTime.now()
            .toUtc()
            .add(Duration(days: _durationDays))
            .toIso8601String(),
      },
    );
  }

  Future<void> _revoke() async {
    final email = _emailController.text.trim();
    final reason = _reasonController.text.trim();
    if (email.isEmpty || reason.isEmpty || !await _confirm('Revoke')) return;
    await _call('revokeInternalBetaEntitlement', {
      'businessEmail': email,
      'reason': reason,
    });
  }

  Future<void> _call(String functionName, Map<String, dynamic> data) async {
    setState(() {
      _working = true;
      _result = null;
    });
    try {
      final response = await _functions.call(
        functionName: functionName,
        data: data,
      );
      if (!mounted) return;
      final replay = response['idempotentReplay'] == true ? ' (already applied)' : '';
      final preserved = response['preservedPaidEntitlement'] == true;
      setState(() {
        _result = preserved
            ? 'Stripe-owned entitlement record preserved; no beta grant was written.'
            : '${response['plan'] ?? 'Managed Growth'} for Business ${response['businessUid']}$replay.';
      });
    } catch (error) {
      if (mounted) setState(() => _result = 'Unable to update beta access: $error');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Beta Entitlements')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'Trusted administrator tool',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text(
          'Grant finite, auditable, comped access to an existing verified Business. Public Managed Growth checkout remains disabled.',
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Business email'),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<int>(
          initialValue: _durationDays,
          decoration: const InputDecoration(labelText: 'Beta duration'),
          items: const [30, 60, 90]
              .map((days) => DropdownMenuItem(value: days, child: Text('$days days')))
              .toList(),
          onChanged: _working ? null : (value) => setState(() => _durationDays = value ?? 90),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _reasonController,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'Required reason',
            hintText: 'Managed Growth founding beta',
          ),
        ),
        const SizedBox(height: 8),
        const ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.workspace_premium_outlined),
          title: Text('Managed Growth — Internal Beta'),
          subtitle: Text('Comped access; no payment or Stripe subscription.'),
        ),
        Wrap(
          spacing: 12,
          children: [
            FilledButton.icon(
              onPressed: _working ? null : _grant,
              icon: const Icon(Icons.add_moderator_outlined),
              label: const Text('Grant Beta Access'),
            ),
            OutlinedButton.icon(
              onPressed: _working ? null : _revoke,
              icon: const Icon(Icons.remove_moderator_outlined),
              label: const Text('Revoke'),
            ),
          ],
        ),
        if (_working) const Padding(
          padding: EdgeInsets.only(top: 20),
          child: LinearProgressIndicator(),
        ),
        if (_result != null) Padding(
          padding: const EdgeInsets.only(top: 20),
          child: SelectableText(_result!),
        ),
      ],
    ),
  );
}
