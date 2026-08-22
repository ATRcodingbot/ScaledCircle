import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  final String initialEmail;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;

  bool _sending = false;
  bool _sent = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _sendResetLink() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _sending = true;
      _errorMessage = null;
    });

    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(
        email: _emailController.text.trim(),
      );

      if (!mounted) return;
      setState(() => _sent = true);
    } on FirebaseAuthException catch (error) {
      if (!mounted) return;

      // Do not reveal whether an email is registered with Scaled Circle.
      if (error.code == 'user-not-found') {
        setState(() => _sent = true);
        return;
      }

      setState(() {
        _errorMessage = switch (error.code) {
          'invalid-email' => 'Enter a valid email address.',
          'too-many-requests' =>
            'Too many reset attempts. Please wait and try again.',
          'network-request-failed' =>
            'Unable to connect. Check your internet connection and try again.',
          _ => 'Unable to send the reset email. Please try again.',
        };
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Unable to send the reset email. Please try again.';
      });
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Reset Password'), centerTitle: true),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: _sent
                      ? _ResetEmailSent(
                          email: _emailController.text.trim(),
                          onBack: () => Navigator.pop(context),
                        )
                      : Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Icon(
                                Icons.lock_reset_rounded,
                                size: 58,
                                color: colorScheme.primary,
                              ),
                              const SizedBox(height: 20),
                              Text(
                                'Recover your account',
                                textAlign: TextAlign.center,
                                style: Theme.of(context).textTheme.headlineSmall
                                    ?.copyWith(fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 12),
                              const Text(
                                'Enter the email used for your Scaled Circle '
                                'account. Firebase will send a secure link to '
                                'choose a new password.',
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: colorScheme.primaryContainer
                                      .withValues(alpha: 0.45),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(Icons.shield_outlined),
                                    SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        'Resetting your password does not remove '
                                        'payments, earnings, campaigns, GPS work, '
                                        'or account history.',
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 24),
                              TextFormField(
                                controller: _emailController,
                                autofocus: widget.initialEmail.isEmpty,
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.done,
                                autofillHints: const [AutofillHints.email],
                                onFieldSubmitted: (_) {
                                  if (!_sending) {
                                    _sendResetLink();
                                  }
                                },
                                decoration: const InputDecoration(
                                  labelText: 'Account email',
                                  prefixIcon: Icon(Icons.email_outlined),
                                  border: OutlineInputBorder(),
                                ),
                                validator: (value) {
                                  final email = value?.trim() ?? '';
                                  if (!RegExp(
                                    r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                                  ).hasMatch(email)) {
                                    return 'Enter a valid email address.';
                                  }
                                  return null;
                                },
                              ),
                              if (_errorMessage != null) ...[
                                const SizedBox(height: 12),
                                Text(
                                  _errorMessage!,
                                  style: TextStyle(color: colorScheme.error),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                              const SizedBox(height: 20),
                              SizedBox(
                                height: 54,
                                child: ElevatedButton.icon(
                                  onPressed: _sending ? null : _sendResetLink,
                                  icon: _sending
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(
                                          Icons.mark_email_read_outlined,
                                        ),
                                  label: Text(
                                    _sending
                                        ? 'Sending reset link...'
                                        : 'Email Me a Reset Link',
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextButton(
                                onPressed: _sending
                                    ? null
                                    : () => Navigator.pop(context),
                                child: const Text('Back to Log in'),
                              ),
                            ],
                          ),
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ResetEmailSent extends StatelessWidget {
  const _ResetEmailSent({required this.email, required this.onBack});

  final String email;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(
          Icons.mark_email_read_rounded,
          size: 64,
          color: colorScheme.primary,
        ),
        const SizedBox(height: 20),
        Text(
          'Check your email',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Text(
          'If an account exists for $email, a secure password reset link is on '
          'the way. Check spam or promotions if it does not arrive shortly.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        SizedBox(
          height: 54,
          child: ElevatedButton(
            onPressed: onBack,
            child: const Text('Return to Log in'),
          ),
        ),
      ],
    );
  }
}
