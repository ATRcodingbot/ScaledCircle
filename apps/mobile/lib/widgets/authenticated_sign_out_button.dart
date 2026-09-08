import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../navigation/app_router.dart';
import '../services/business_workspace_service.dart';

class AuthenticatedSignOutButton extends StatelessWidget {
  const AuthenticatedSignOutButton({super.key});

  Future<void> _signOut(BuildContext context) async {
    final router = AppRouterScope.maybeOf(context);
    final navigator = Navigator.of(context);
    BusinessWorkspaceSession.clear();
    await FirebaseAuth.instance.signOut();
    if (!navigator.mounted) return;
    navigator.popUntil((r) => r.isFirst);
    if (router != null) {
      router.clearSessionNavigation();
    } else {
      navigator.pushNamedAndRemoveUntil('/', (_) => false);
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: 'Sign Out',
    icon: const Icon(Icons.logout),
    onPressed: () => _signOut(context),
  );
}
