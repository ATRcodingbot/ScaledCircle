import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/business_workspace_service.dart';
import '../../services/transactional_email_service.dart';

/// Creates a personal login for an existing invitation. The server does not
/// grant membership or create a second Business during account preparation.
class InvitedAccountScreen extends StatefulWidget {
  const InvitedAccountScreen({super.key, required this.location});
  final Uri location;
  @override
  State<InvitedAccountScreen> createState() => _InvitedAccountScreenState();
}

class _InvitedAccountScreenState extends State<InvitedAccountScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(),
      _email = TextEditingController(),
      _password = TextEditingController();
  bool _busy = false, _obscured = true;
  String? _error;
  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.createUserWithEmailAndPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
      if (auth.currentUser?.email?.toLowerCase() !=
          _email.text.trim().toLowerCase()) {
        throw StateError('Different signed in email');
      }
      await BusinessWorkspaceService().call('prepareInvitedBusinessAccount', {
        'businessId': widget.location.queryParameters['business'],
        'invitationId': widget.location.queryParameters['invitation'],
        'token': widget.location.queryParameters['token'],
        'name': _name.text.trim(),
      });
      await TransactionalEmailService().resendVerification();
      if (mounted) Navigator.pop(context);
    } on FirebaseAuthException catch (e) {
      if (mounted) {
        setState(
          () => _error = e.code == 'email-already-in-use'
              ? 'This email already has an account. Go back and sign in to accept.'
              : 'Account creation could not finish. Check your email, password and connection, then retry.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'The invitation could not be verified or the verification email is not yet confirmed. Use the invited email and retry. No Business membership has been granted.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Create your team login')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text(
                'Join the existing Business. You do not need another Business workspace or subscription.',
              ),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Your name'),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Enter your name.' : null,
              ),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(labelText: 'Invited email'),
                validator: (v) => v == null || !v.contains('@')
                    ? 'Enter the invited email.'
                    : null,
              ),
              TextFormField(
                controller: _password,
                obscureText: _obscured,
                autofillHints: const [AutofillHints.newPassword],
                decoration: InputDecoration(
                  labelText: 'Password',
                  suffixIcon: IconButton(
                    tooltip: 'Show or hide password',
                    icon: const Icon(Icons.visibility_outlined),
                    onPressed: () => setState(() => _obscured = !_obscured),
                  ),
                ),
                validator: (v) => v == null || v.length < 8
                    ? 'Use at least 8 characters.'
                    : null,
              ),
              const SizedBox(height: 20),
              if (_error != null) Text(_error!),
              FilledButton(
                onPressed: _busy ? null : _create,
                child: Text(
                  _busy
                      ? 'Preparing your login…'
                      : 'Create Login & Verify Email',
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
