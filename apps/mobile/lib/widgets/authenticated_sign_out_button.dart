import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../navigation/app_router.dart';
import '../navigation/app_routes.dart';

class AuthenticatedSignOutButton extends StatelessWidget {
  const AuthenticatedSignOutButton({super.key});

  Future<void> _signOut(BuildContext context) async {
    await FirebaseAuth.instance.signOut();
    if (context.mounted) {
      AppNavigation.replace(context, AppRoutes.login);
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: 'Sign Out',
    icon: const Icon(Icons.logout),
    onPressed: () => _signOut(context),
  );
}
