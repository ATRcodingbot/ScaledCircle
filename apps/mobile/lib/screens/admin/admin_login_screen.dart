import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../config/app_environment.dart';
import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../../services/secure_function_service.dart';

class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key});

  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _working = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _email.text.trim(),
        password: _password.text,
      );
      final user = credential.user;
      if (user == null || !user.emailVerified) {
        await FirebaseAuth.instance.signOut();
        throw StateError('A verified administrator account is required.');
      }
      final profile = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();
      if (profile.data()?['role']?.toString().toLowerCase() != 'admin') {
        await FirebaseAuth.instance.signOut();
        throw StateError(
          'This account is not authorized for ScaledCircle administration.',
        );
      }
      await const SecureFunctionService().call(
        functionName: 'confirmAdminLoginReadiness',
        data: const <String, dynamic>{},
      );
      if (mounted) {
        AppNavigation.replace(context, AppRoutes.adminDashboard);
      }
    } on FirebaseAuthException catch (error) {
      if (AppEnvironmentConfig.isStaging) {
        debugPrint('Admin Firebase Auth failed: ${error.code}');
      }
      if (mounted) {
        setState(
          () => _error = switch (error.code) {
            'invalid-credential' || 'user-not-found' || 'wrong-password' =>
              'Incorrect email or password.',
            'user-disabled' =>
              'Your account is currently unavailable. Contact support.',
            _ => 'We couldn\'t sign you in. Please try again.',
          },
        );
      }
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Bad state: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('ScaledCircle Administration')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(24),
          children: [
            const Icon(Icons.admin_panel_settings_outlined, size: 56),
            const SizedBox(height: 16),
            const Text(
              'Admin Login',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const Text(
              'Administrator authority is verified after authentication.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _email,
              decoration: const InputDecoration(labelText: 'Admin email'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!),
              ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _working ? null : _login,
              child: Text(
                _working ? 'Checking authority…' : 'Sign in to Admin Dashboard',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
