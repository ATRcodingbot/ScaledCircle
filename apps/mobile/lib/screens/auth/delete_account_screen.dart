import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../config/app_environment.dart';
import '../../navigation/app_router.dart';
import '../../services/business_workspace_service.dart';

typedef AccountClosureCall =
    Future<Map<String, dynamic>> Function(Map<String, dynamic> input);

class DeleteAccountTile extends StatelessWidget {
  const DeleteAccountTile({super.key});
  @override
  Widget build(BuildContext context) => !AppEnvironmentConfig.isStaging
      ? const SizedBox.shrink()
      : ListTile(
          leading: const Icon(Icons.person_remove_outlined),
          title: const Text('Delete Account'),
          subtitle: const Text(
            'Review obligations and permanently close your login',
          ),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const DeleteAccountScreen()),
          ),
        );
}

class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({
    super.key,
    this.call,
    this.reauthenticate,
    this.onDeleted,
    this.staging,
  });
  final AccountClosureCall? call;
  final Future<void> Function(String password)? reauthenticate;
  final Future<void> Function()? onDeleted;
  final bool? staging;
  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountState();
}

class _DeleteAccountState extends State<DeleteAccountScreen> {
  final _confirmation = TextEditingController(),
      _password = TextEditingController();
  Map<String, dynamic>? _status;
  bool _busy = false, _deleted = false;
  String? _error;
  bool get _staging => widget.staging ?? AppEnvironmentConfig.isStaging;
  @override
  void initState() {
    super.initState();
    if (_staging) _load();
  }

  @override
  void dispose() {
    _confirmation.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _call(Map<String, dynamic> input) async =>
      widget.call != null
      ? widget.call!(input)
      : Map<String, dynamic>.from(
          (await FirebaseFunctions.instanceFor(
                region: 'us-east1',
              ).httpsCallable('stagingAccountClosureV1').call(input)).data
              as Map,
        );
  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final status = await _call({'action': 'get'});
      if (mounted) setState(() => _status = status);
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(Object e) {
    if (mounted) {
      setState(
        () => _error = e is FirebaseFunctionsException
            ? e.message ?? 'Account status could not be verified.'
            : e is FirebaseAuthException
            ? 'Sign-in verification failed. Check your password or sign in again.'
            : 'Account deletion could not be confirmed. Check your connection and retry.',
      );
    }
  }

  Future<void> _delete() async {
    if (_busy ||
        _confirmation.text != 'DELETE' ||
        _status?['canDelete'] != true ||
        !_staging) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permanently delete your account?'),
        content: const Text(
          'Your login and personal profile will be removed. Required financial, work and audit history will be retained. You will leave any Business teams; their records remain intact.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep Account'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete Account'),
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
      if (widget.reauthenticate != null) {
        await widget.reauthenticate!(_password.text);
      } else {
        final user = FirebaseAuth.instance.currentUser;
        if (user == null) {
          throw FirebaseAuthException(code: 'requires-recent-login');
        }
        if (user.providerData.any((p) => p.providerId == 'password')) {
          await user.reauthenticateWithCredential(
            EmailAuthProvider.credential(
              email: user.email!,
              password: _password.text,
            ),
          );
        } else {
          final id = user.providerData.first.providerId;
          final AuthProvider provider = id == 'google.com'
              ? GoogleAuthProvider()
              : OAuthProvider(id);
          if (kIsWeb) {
            await user.reauthenticateWithPopup(provider);
          } else {
            await user.reauthenticateWithProvider(provider);
          }
        }
        await FirebaseAuth.instance.currentUser?.getIdToken(true);
      }
      _password.clear();
      final result = await _call({
        'action': 'delete',
        'confirmation': 'DELETE',
      });
      if (result['deleted'] != true) throw Exception('not_confirmed');
      if (widget.onDeleted != null) {
        await widget.onDeleted!();
      } else {
        BusinessWorkspaceSession.clear();
        await FirebaseAuth.instance.signOut();
      }
      if (mounted) setState(() => _deleted = true);
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Delete Account')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (!_staging)
              const Text('Account deletion is not enabled in this environment.')
            else if (_deleted) ...[
              const Text(
                'Account deleted',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const Text(
                'Your login is closed. Required financial and audit history has been retained.',
              ),
              FilledButton(
                onPressed: () => AppNavigation.replace(context, '/'),
                child: const Text('Return to ScaledCircle'),
              ),
            ] else ...[
              const Text(
                'Review before deleting',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const Text(
                'Deletion removes your login, personal profile and Business team access. It does not delete a Business or erase required work, financial and referral history.',
              ),
              if (_status != null) ...[
                if (_status!['email'] != null)
                  Text('Account: ${_status!['email']}'),
                for (final reason in (_status!['blockers'] as List? ?? []))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(reason.toString()),
                  ),
                if (_status!['canDelete'] == true) ...[
                  const Text(
                    'No outstanding obligations were found. Confirm with a fresh sign-in.',
                  ),
                  const SizedBox(height: 24),
                  const Text('Current password'),
                  const SizedBox(height: 8),
                  TextField(
                    key: const Key('delete-current-password'),
                    controller: _password,
                    obscureText: true,
                    enableSuggestions: false,
                    autocorrect: false,
                    decoration: const InputDecoration(
                      hintText: 'Enter your current password',
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 18,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'For email/password accounts. Connected accounts will use their sign-in provider.',
                    key: Key('delete-password-help'),
                  ),
                  const SizedBox(height: 24),
                  const Text('Type DELETE to confirm'),
                  const SizedBox(height: 8),
                  TextField(
                    key: const Key('delete-confirmation'),
                    controller: _confirmation,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(hintText: 'DELETE'),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy || _confirmation.text != 'DELETE'
                        ? null
                        : _delete,
                    child: const Text('Delete Account'),
                  ),
                ],
              ],
              if (_error != null) Text(_error!),
              if (_busy) const LinearProgressIndicator(),
              TextButton(
                onPressed: _busy ? null : _load,
                child: const Text('Check account status'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
