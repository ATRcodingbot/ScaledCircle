import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../../services/discovery_preferences_service.dart';
import '../preferences/areas_preferences_screen.dart';
import '../public/early_access_pending_screen.dart';
import '../scaler/dashboard/scaler_dashboard_screen.dart';
import 'login_screen.dart';

class CompleteScalerProfileScreen extends StatefulWidget {
  const CompleteScalerProfileScreen({super.key});
  @override
  State<CompleteScalerProfileScreen> createState() =>
      _CompleteScalerProfileScreenState();
}

class _CompleteScalerProfileScreenState
    extends State<CompleteScalerProfileScreen> {
  bool _loading = true;
  String? _message;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _open());
  }

  Future<void> _open() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) =>
              const LoginScreen(returnRoute: AppRoutes.completeScalerProfile),
        ),
      );
      return;
    }
    await user.reload();
    if (FirebaseAuth.instance.currentUser?.emailVerified != true) {
      if (mounted) {
        setState(() {
          _loading = false;
          _message = 'Verify your email before completing your profile.';
        });
      }
      return;
    }
    final profile = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();
    final data = profile.data() ?? const <String, dynamic>{};
    if (data['role'] != 'scaler') {
      if (mounted) {
        setState(() {
          _loading = false;
          _message = 'Scaler profile setup is not available for this account.';
        });
      }
      return;
    }
    final approved = data['active'] == true || data['betaAccess'] == 'approved';
    final preferences = DiscoveryPreferencesService();
    if (!mounted) return;
    final navigator = Navigator.of(context);
    final email = user.email ?? data['email']?.toString() ?? '';
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => AreasPreferencesScreen(
          role: 'scaler',
          onboarding: true,
          loadPreferences: approved
              ? preferences.load
              : preferences.loadPendingScaler,
          savePreferences: approved
              ? preferences.save
              : preferences.savePendingScaler,
          completePreferences: approved
              ? preferences.completeScalerSetup
              : preferences.completePendingScalerSetup,
          onCompleted: (_) => approved
              ? _openApprovedWorkspace(navigator)
              : _openPendingStatus(navigator, email),
          onSkip: approved
              ? () => _openApprovedWorkspace(navigator)
              : () => _openPendingStatus(navigator, email),
        ),
      ),
    );
  }

  void _openApprovedWorkspace(NavigatorState navigator) {
    navigator.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const ScalerDashboardScreen()),
      (_) => false,
    );
  }

  void _openPendingStatus(NavigatorState navigator, String email) {
    navigator.pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => EarlyAccessPendingScreen(email: email, role: 'scaler'),
      ),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: _loading
            ? const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Loading your Scaler profile…'),
                ],
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _message ?? 'Unable to continue.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: () =>
                        AppNavigation.replace(context, AppRoutes.verifyEmail),
                    child: const Text('VERIFY MY EMAIL'),
                  ),
                ],
              ),
      ),
    ),
  );
}
