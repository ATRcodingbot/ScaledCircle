import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'startup_session_gate.dart';

/// Checks the existing session before showing registration. Once signed out is
/// established, the form owns its signup transition: Firebase authenticates a
/// new identity before server finalization, consent and referral writes finish.
/// Reacting to that intermediate auth event would dispose the active form.
class RegistrationEntryGate extends StatefulWidget {
  const RegistrationEntryGate({
    super.key,
    required this.signedOut,
    this.initialIdentityCheck,
    this.startupLoad,
  });

  final Widget signedOut;

  @visibleForTesting
  final Future<bool> Function()? initialIdentityCheck;

  @visibleForTesting
  final Future<Map<String, dynamic>> Function()? startupLoad;

  @override
  State<RegistrationEntryGate> createState() => _RegistrationEntryGateState();
}

class _RegistrationEntryGateState extends State<RegistrationEntryGate> {
  bool? _signedIn;
  bool _failed = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _checkIdentity();
  }

  Future<void> _checkIdentity() async {
    final generation = ++_generation;
    setState(() {
      _signedIn = null;
      _failed = false;
    });
    try {
      final signedIn =
          await (widget.initialIdentityCheck?.call() ??
                  FirebaseAuth.instance.authStateChanges().first.then(
                    (user) => user != null,
                  ))
              .timeout(const Duration(seconds: 20));
      if (mounted && generation == _generation) {
        setState(() => _signedIn = signedIn);
      }
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() => _failed = true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_signedIn == false) return widget.signedOut;
    if (_signedIn == true) {
      return StartupSessionGate(
        signedOut: widget.signedOut,
        load: widget.startupLoad,
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Scaled Circle')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: _failed
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'We could not verify your session. Please retry.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _checkIdentity,
                        child: const Text('Retry'),
                      ),
                    ],
                  )
                : const Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 16),
                      Text('Checking your session…'),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
