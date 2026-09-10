import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

typedef BusinessApprovalCall =
    Future<Map<String, dynamic>> Function(
      String function,
      Map<String, dynamic> input,
    );

class BusinessAccessApprovalScreen extends StatefulWidget {
  const BusinessAccessApprovalScreen({super.key, this.call});
  final BusinessApprovalCall? call;
  @override
  State<BusinessAccessApprovalScreen> createState() =>
      _BusinessAccessApprovalScreenState();
}

class _BusinessAccessApprovalScreenState
    extends State<BusinessAccessApprovalScreen> {
  final _email = TextEditingController();
  Map<String, dynamic>? _business;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> input,
  ) async {
    if (widget.call != null) return widget.call!(name, input);
    final result = await FirebaseFunctions.instanceFor(
      region: 'us-east1',
    ).httpsCallable(name).call<Map<Object?, Object?>>(input);
    return Map<String, dynamic>.from(result.data);
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
      _business = null;
    });
    try {
      final result = await _call('getBusinessAccessApproval', {
        'email': _email.text.trim(),
      });
      if (mounted) setState(() => _business = result);
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(Object error) {
    if (mounted) {
      setState(
        () => _error =
            error is FirebaseFunctionsException &&
                [
                  'invalid-argument',
                  'failed-precondition',
                  'permission-denied',
                  'not-found',
                ].contains(error.code)
            ? error.message
            : 'Unable to verify Business access. Please retry.',
      );
    }
  }

  Future<void> _approve() async {
    final selected = _business;
    if (_busy || selected?['eligible'] != true) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approve Business?'),
        content: Text(
          '${selected!['businessName']} (${selected['email']}) has completed onboarding. '
          'Approve access to ScaledCircle? This does not activate a subscription or paid features.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm approval'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _call('approveBusinessAccess', {
        'uid': selected!['uid'],
      });
      if (mounted) setState(() => _business = result);
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Business access')),
    body: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'Approve a Business that has completed onboarding.',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Account access is separate from subscriptions and paid features.',
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _email,
              enabled: !_busy,
              keyboardType: TextInputType.emailAddress,
              onChanged: (_) => setState(() {
                _business = null;
                _error = null;
              }),
              decoration: const InputDecoration(
                labelText: 'Business owner email',
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _busy ? null : _load,
              child: Text(_busy ? 'Checking…' : 'Review Business'),
            ),
            if (_business != null) ...[
              const SizedBox(height: 20),
              Text(
                _business!['businessName'] as String,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(_business!['email'] as String),
              Text('Access: ${_business!['state']}'),
              if (_business!['reason'] != null)
                Text(_business!['reason'] as String),
              if (_business!['approved'] == true)
                const Text(
                  'Business access is approved. Membership and billing are unchanged.',
                ),
              if (_business!['eligible'] == true)
                FilledButton(
                  onPressed: _busy ? null : _approve,
                  child: const Text('Approve Business'),
                ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(_error!, semanticsLabel: 'Error: $_error'),
              ),
          ],
        ),
      ),
    ),
  );
}
