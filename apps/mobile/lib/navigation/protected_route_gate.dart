import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../screens/auth/login_screen.dart';
import 'app_routes.dart';
import 'app_router.dart';

enum ProtectedRouteAudience { business, scaler, admin, jobRoomParticipant }

String dashboardRouteForProfile(Map<String, dynamic> profile) {
  final role = profile['role']?.toString().toLowerCase();
  if (role == 'admin') return AppRoutes.adminDashboard;
  final accountType = (profile['activeView'] ?? profile['accountType'] ?? role)
      ?.toString()
      .toLowerCase();
  return accountType == 'scaler' || accountType == 'marketer'
      ? AppRoutes.scalerDashboard
      : AppRoutes.businessDashboard;
}

bool profileAllowsAudience(
  Map<String, dynamic> profile,
  ProtectedRouteAudience audience,
) {
  final role = profile['role']?.toString().toLowerCase();
  final approved =
      role == 'admin' ||
      profile['active'] == true ||
      profile['betaAccess'] == 'approved';
  if (!approved) return false;
  final accountType = (profile['activeView'] ?? profile['accountType'] ?? role)
      ?.toString()
      .toLowerCase();
  if (role == 'admin') return true;
  return switch (audience) {
    ProtectedRouteAudience.business => accountType == 'business',
    ProtectedRouteAudience.scaler =>
      accountType == 'scaler' || accountType == 'marketer',
    ProtectedRouteAudience.admin => false,
    ProtectedRouteAudience.jobRoomParticipant => true,
  };
}

class ProtectedRouteGate extends StatelessWidget {
  const ProtectedRouteGate({
    super.key,
    required this.routeName,
    required this.audience,
    required this.builder,
  });

  final String routeName;
  final ProtectedRouteAudience audience;
  final Widget Function(User user, Map<String, dynamic> profile) builder;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (context, authSnapshot) {
        if (authSnapshot.connectionState == ConnectionState.waiting) {
          return const _RouteLoadingScreen();
        }
        final user = authSnapshot.data;
        if (user == null) return LoginScreen(returnRoute: routeName);
        return FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          future: FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .get(),
          builder: (context, profileSnapshot) {
            if (profileSnapshot.connectionState != ConnectionState.done) {
              return const _RouteLoadingScreen();
            }
            final profile = profileSnapshot.data?.data();
            if (profile == null || !profileAllowsAudience(profile, audience)) {
              return RouteRecoveryScreen(
                title: 'You don\'t have access to this page.',
                destination: profile == null
                    ? AppRoutes.login
                    : dashboardRouteForProfile(profile),
              );
            }
            return builder(user, profile);
          },
        );
      },
    );
  }
}

class AuthenticatedLandingGate extends StatelessWidget {
  const AuthenticatedLandingGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (context, authSnapshot) {
        final user = authSnapshot.data;
        if (authSnapshot.connectionState == ConnectionState.waiting) {
          return const _RouteLoadingScreen();
        }
        if (user == null) return const LoginScreen();
        return FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          future: FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .get(),
          builder: (context, profileSnapshot) {
            if (profileSnapshot.connectionState != ConnectionState.done) {
              return const _RouteLoadingScreen();
            }
            final profile = profileSnapshot.data?.data();
            if (profile == null) return const LoginScreen();
            final destination = dashboardRouteForProfile(profile);
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (context.mounted) {
                AppNavigation.replace(context, destination);
              }
            });
            return const _RouteLoadingScreen();
          },
        );
      },
    );
  }
}

class UnknownRouteGate extends StatelessWidget {
  const UnknownRouteGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (context, authSnapshot) {
        final user = authSnapshot.data;
        if (user == null) {
          return const RouteRecoveryScreen(
            title: 'This page is not available.',
            destination: AppRoutes.login,
            actionLabel: 'Sign In',
          );
        }
        return FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          future: FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .get(),
          builder: (context, profileSnapshot) {
            if (profileSnapshot.connectionState != ConnectionState.done) {
              return const _RouteLoadingScreen();
            }
            return RouteRecoveryScreen(
              destination: dashboardRouteForProfile(
                profileSnapshot.data?.data() ?? const {},
              ),
            );
          },
        );
      },
    );
  }
}

class RouteRecoveryScreen extends StatelessWidget {
  const RouteRecoveryScreen({
    super.key,
    this.title = 'This page is not available.',
    required this.destination,
    this.actionLabel = 'Return to Dashboard',
  });

  final String title;
  final String destination;
  final String actionLabel;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ScaledCircle')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.explore_outlined, size: 52),
                    const SizedBox(height: 16),
                    Text(title, textAlign: TextAlign.center),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () =>
                          AppNavigation.replace(context, destination),
                      child: Text(actionLabel),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RouteLoadingScreen extends StatelessWidget {
  const _RouteLoadingScreen();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
