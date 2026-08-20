import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';
import '../../services/transactional_email_service.dart';
import '../../theme/app_theme.dart';
import 'login_screen.dart';

enum VerificationViewState { verifying, success, alreadyVerified, expired, invalid }

class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key, required this.actionCode});
  final String? actionCode;

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  VerificationViewState _state = VerificationViewState.verifying;
  bool _resending = false;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _verify();
  }

  Future<void> _verify() async {
    final code = widget.actionCode?.trim() ?? '';
    if (code.isEmpty) {
      setState(() => _state = VerificationViewState.invalid);
      return;
    }
    setState(() => _state = VerificationViewState.verifying);
    try {
      await FirebaseAuth.instance.checkActionCode(code);
      await FirebaseAuth.instance.applyActionCode(code);
      await FirebaseAuth.instance.currentUser?.reload();
      if (mounted) setState(() => _state = VerificationViewState.success);
    } on FirebaseAuthException catch (error) {
      await FirebaseAuth.instance.currentUser?.reload();
      if (!mounted) return;
      if (FirebaseAuth.instance.currentUser?.emailVerified == true) {
        setState(() => _state = VerificationViewState.alreadyVerified);
      } else if (error.code == 'expired-action-code') {
        setState(() => _state = VerificationViewState.expired);
      } else {
        setState(() => _state = VerificationViewState.invalid);
      }
    }
  }

  Future<void> _resend() async {
    if (_resending) return;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => const LoginScreen(returnRoute: AppRoutes.verifyEmail),
      ));
      return;
    }
    setState(() { _resending = true; _notice = null; });
    try {
      await TransactionalEmailService().resendVerification();
      if (mounted) setState(() => _notice = 'A new verification email is on its way.');
    } catch (_) {
      if (mounted) setState(() => _notice = "We couldn't send another email yet. Please wait a few minutes and try again.");
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  void _continue() => Navigator.of(context).pushNamed(AppRoutes.completeScalerProfile);

  @override
  Widget build(BuildContext context) {
    final verifying = _state == VerificationViewState.verifying;
    final success = _state == VerificationViewState.success || _state == VerificationViewState.alreadyVerified;
    final title = switch (_state) {
      VerificationViewState.verifying => 'Verifying your email…',
      VerificationViewState.success => 'Email verified',
      VerificationViewState.alreadyVerified => 'Your email is already verified',
      VerificationViewState.expired => 'This verification link has expired',
      VerificationViewState.invalid => "We couldn't verify this link",
    };
    return Scaffold(
      backgroundColor: const Color(0xFFF3F7FB),
      body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Card(child: Padding(padding: const EdgeInsets.all(32), child: Column(children: [
          Icon(success ? Icons.verified : Icons.mark_email_read_outlined,
            color: success ? const Color(0xFF0C9F73) : const Color(0xFF1769E0), size: 64),
          const SizedBox(height: 20),
          Text(title, textAlign: TextAlign.center, style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: success ? AppColors.textPrimary : const Color(0xFF10243E),
          )),
          const SizedBox(height: 12),
          Text(success ? "You're ready to finish setting up your Scaler profile." :
            verifying ? 'Please keep this page open while Firebase confirms your verification.' :
            'Request a fresh verification email and try again.', textAlign: TextAlign.center,
            style: success ? const TextStyle(color: AppColors.textSecondary) : null),
          if (verifying) ...[const SizedBox(height: 24), const CircularProgressIndicator()],
          if (success) ...[const SizedBox(height: 24), FilledButton(onPressed: _continue, child: const Text('COMPLETE MY PROFILE'))],
          if (!verifying && !success) ...[const SizedBox(height: 24), FilledButton(
            onPressed: _resending ? null : _resend,
            child: _resending ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('SEND A NEW VERIFICATION EMAIL'),
          )],
          if (_notice != null) ...[const SizedBox(height: 14), Text(_notice!, textAlign: TextAlign.center)],
        ]))),
      ))),
    );
  }
}
