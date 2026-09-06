import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../../config/app_environment.dart';

class StagingScalerApprovalScreen extends StatefulWidget {
  const StagingScalerApprovalScreen({super.key});
  @override
  State<StagingScalerApprovalScreen> createState() =>
      _StagingScalerApprovalState();
}

class _StagingScalerApprovalState extends State<StagingScalerApprovalScreen> {
  final _uid = TextEditingController();
  bool _busy = false;
  String? _result;
  @override
  void dispose() {
    _uid.dispose();
    super.dispose();
  }

  Future<void> _approve() async {
    if (!AppEnvironmentConfig.isStaging || _busy) return;
    setState(() {
      _busy = true;
      _result = null;
    });
    try {
      final response = await FirebaseFunctions.instanceFor(region: 'us-east1')
          .httpsCallable('approveStagingScalerV1')
          .call({'targetUid': _uid.text.trim()});
      if (mounted) {
        setState(
          () => _result = 'Approved. Audit: ${response.data['auditId']}',
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(() => _result = error.message ?? 'Approval failed safely.');
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _result =
              'Approval outcome unavailable. Check the audit before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Staging Scaler approval')),
    body: !AppEnvironmentConfig.isStaging
        ? const Center(child: Text('Unavailable'))
        : Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const Text(
                  'Approve a verified pending Scaler after server eligibility checks. Staging only.',
                ),
                TextField(
                  controller: _uid,
                  enabled: !_busy,
                  decoration: const InputDecoration(
                    labelText: 'Target Scaler UID',
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _approve,
                  child: Text(
                    _busy ? 'Checking eligibility…' : 'Approve pending Scaler',
                  ),
                ),
                if (_result != null) SelectableText(_result!),
              ],
            ),
          ),
  );
}
