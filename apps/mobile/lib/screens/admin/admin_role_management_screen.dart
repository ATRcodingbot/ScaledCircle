import 'package:flutter/material.dart';

import '../../services/secure_function_service.dart';

class AdminRoleManagementScreen extends StatefulWidget {
  const AdminRoleManagementScreen({super.key});

  @override
  State<AdminRoleManagementScreen> createState() =>
      _AdminRoleManagementScreenState();
}

class _AdminRoleManagementScreenState extends State<AdminRoleManagementScreen> {
  final _email = TextEditingController();
  final _reason = TextEditingController();
  final _replacementUid = TextEditingController();
  String _action = 'promote';
  bool _working = false;
  String? _result;

  @override
  void dispose() {
    _email.dispose();
    _reason.dispose();
    _replacementUid.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _reason.text.trim().isEmpty) return;
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          '${_action == 'promote' ? 'Promote' : 'Demote'} administrator?',
        ),
        content: Text(
          _action == 'promote'
              ? 'This grants application administrator authority. No product entitlement is created.'
              : 'Demotion requires another administrator whose Admin Dashboard login was recently verified.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (approved != true) return;
    setState(() {
      _working = true;
      _result = null;
    });
    try {
      final data = <String, dynamic>{
        'email': _email.text.trim(),
        'action': _action,
        'reason': _reason.text.trim(),
      };
      if (_action == 'demote') {
        data['replacementAdminUid'] = _replacementUid.text.trim();
      }
      final response = await const SecureFunctionService().call(
        functionName: 'setApplicationAdminRole',
        data: data,
      );
      if (mounted) {
        setState(
          () => _result = response['changed'] == true
              ? 'Administrator role updated and audited.'
              : 'No role change was required.',
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() => _result = 'Unable to update administrator role: $error');
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Administrator Accounts')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'Audited role management',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const Text(
          'Role authority is separate from Business plans and beta entitlements.',
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _email,
          decoration: const InputDecoration(
            labelText: 'Verified account email',
          ),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: _action,
          items: const [
            DropdownMenuItem(
              value: 'promote',
              child: Text('Promote to administrator'),
            ),
            DropdownMenuItem(
              value: 'demote',
              child: Text('Demote to Business'),
            ),
          ],
          onChanged: _working
              ? null
              : (value) => setState(() => _action = value ?? 'promote'),
        ),
        if (_action == 'demote') ...[
          const SizedBox(height: 16),
          TextField(
            controller: _replacementUid,
            decoration: const InputDecoration(
              labelText: 'Recently verified replacement administrator UID',
            ),
          ),
        ],
        const SizedBox(height: 16),
        TextField(
          controller: _reason,
          maxLength: 500,
          decoration: const InputDecoration(labelText: 'Required audit reason'),
        ),
        FilledButton(
          onPressed: _working ? null : _submit,
          child: Text(_working ? 'Applying…' : 'Review role change'),
        ),
        if (_result != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: SelectableText(_result!),
          ),
      ],
    ),
  );
}
