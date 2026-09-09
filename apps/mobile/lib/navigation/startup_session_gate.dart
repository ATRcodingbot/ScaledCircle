import '../services/discovery_preferences_service.dart';
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../services/business_workspace_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../screens/auth/complete_scaler_profile_screen.dart';
import '../screens/public/early_access_pending_screen.dart';
import '../services/legal_consent_service.dart';
import '../services/transactional_email_service.dart';
import '../services/auth/refresh_identity.dart';
import '../services/business_onboarding_service.dart';
import '../screens/auth/complete_business_profile_screen.dart';
import '../screens/public/legal_document_screen.dart';
import '../widgets/authenticated_sign_out_button.dart';
import 'app_router.dart';
import 'app_routes.dart';

enum StartupDestination {
  signedOut,
  verifyEmail,
  consent,
  scalerProfile,
  businessProfile,
  pending,
  business,
  scaler,
  admin,
  profileMissing,
}

StartupDestination resolveStartupDestination(Map<String, dynamic> state) {
  if (state['signedIn'] != true) return StartupDestination.signedOut;
  if (state['emailVerified'] != true) return StartupDestination.verifyEmail;
  final profile = state['profile'] as Map?;
  if (profile == null) return StartupDestination.profileMissing;
  final role = profile['role'];
  if (role == 'admin') return StartupDestination.admin;
  if (role != 'scaler' && role != 'business') {
    return StartupDestination.profileMissing;
  }
  if (role == 'business' &&
      state['workspaceReady'] != true &&
      state['businessProfileComplete'] == false) {
    return StartupDestination.businessProfile;
  }
  if ((state['missingAgreements'] as List? ?? []).isNotEmpty) {
    return StartupDestination.consent;
  }
  if (state['workspaceReady'] == true) return StartupDestination.business;
  if (role == 'scaler' && state['workProfileComplete'] != true) {
    return StartupDestination.scalerProfile;
  }
  if (profile['active'] != true && profile['betaAccess'] != 'approved') {
    return StartupDestination.pending;
  }
  return role == 'scaler'
      ? StartupDestination.scaler
      : StartupDestination.business;
}

/// Identity is resolved before marketing or login can paint. A failed read is
/// recoverable; it is never interpreted as a signed-out or completed profile.
class StartupSessionGate extends StatefulWidget {
  const StartupSessionGate({super.key, required this.signedOut, this.load});
  final Widget signedOut;
  final Future<Map<String, dynamic>> Function()? load;
  @override
  State<StartupSessionGate> createState() => _StartupSessionGateState();
}

class _StartupSessionGateState extends State<StartupSessionGate>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _state;
  String? _error;
  bool _checked = false, _busy = false;
  int _generation = 0;
  StreamSubscription<User?>? _authChanges;
  Timer? _authDeadline;
  static const _agreements = {
    'terms': 'terms-2026-08-v1',
    'privacy': 'privacy-2026-08-v1',
    'scaler_work': 'scaler-work-2026-08-v1',
  };
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.load != null) {
      _refresh();
    } else {
      _authDeadline = Timer(const Duration(seconds: 20), _fail);
      _authChanges = FirebaseAuth.instance.authStateChanges().listen((_) {
        _authDeadline?.cancel();
        _refresh();
      }, onError: (_) => _fail());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _generation++;
    _authChanges?.cancel();
    _authDeadline?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        !_busy &&
        _state != null &&
        resolveStartupDestination(_state!) == StartupDestination.verifyEmail) {
      _refresh();
    }
  }

  void _fail() {
    if (mounted) {
      setState(() {
        _busy = false;
        _error = 'We could not verify your session. Please retry.';
      });
    }
  }

  Future<Map<String, dynamic>> _load() async {
    final auth = FirebaseAuth.instance;
    final user = auth.currentUser;
    if (user == null) return {'signedIn': false};
    try {
      await refreshIdentity(auth: auth);
    } on FirebaseAuthException catch (error) {
      if ([
        'user-disabled',
        'user-not-found',
        'user-token-expired',
        'invalid-user-token',
      ].contains(error.code)) {
        await auth.signOut();
        return {'signedIn': false};
      }
      rethrow;
    }
    if (auth.currentUser?.uid != user.uid) throw StateError('Session changed');
    if (auth.currentUser?.emailVerified != true) {
      return {'signedIn': true, 'emailVerified': false, 'email': user.email};
    }
    final db = FirebaseFirestore.instance;
    final profile =
        (await db
                .doc('users/${user.uid}')
                .get(const GetOptions(source: Source.server)))
            .data();
    final missing = <String>[];
    if (profile != null && profile['role'] != 'admin') {
      final required = await LegalConsentService().missingFor('account');
      missing.addAll(required.map((agreement) => agreement['type']!).toList());
    }

    bool workspaceReady = false;
    if (profile?['activeBusinessId'] != null && missing.isEmpty) {
      try {
        await BusinessWorkspaceService().context();
        workspaceReady = true;
      } on FirebaseFunctionsException catch (error) {
        if (error.code != 'permission-denied') rethrow;
        BusinessWorkspaceSession.clear();
      }
    }
    Map<String, dynamic>? preferences;
    bool? businessProfileComplete;
    if (profile?['role'] == 'business' &&
        profile?['signupPurpose'] != 'team_invitation' &&
        !workspaceReady &&
        profile?['active'] != true &&
        profile?['betaAccess'] != 'approved') {
      businessProfileComplete =
          (await BusinessOnboardingService().load())['profileComplete'] == true;
    }
    if (profile?['role'] == 'scaler') {
      final approved =
          profile?['active'] == true || profile?['betaAccess'] == 'approved';
      preferences = approved
          ? (await db
                    .doc('discoveryPreferences/${user.uid}')
                    .get(const GetOptions(source: Source.server)))
                .data()
          : await DiscoveryPreferencesService().loadPendingScaler();
    }

    if (auth.currentUser?.uid != user.uid) throw StateError('Session changed');
    return {
      'signedIn': true,
      'emailVerified': auth.currentUser!.emailVerified,
      'email': user.email,
      'profile': profile,
      'workspaceReady': workspaceReady,
      'businessProfileComplete': businessProfileComplete,
      'missingAgreements': missing,
      'workProfileComplete':
          preferences?['initialSetupCompletedAt'] != null ||
          preferences?['initialSetupCompleted'] == true,
    };
  }

  Future<void> _refresh() async {
    final generation = ++_generation;
    setState(() {
      _state = null;
      _error = null;
      _checked = false;
      _busy = true;
    });
    try {
      final state = await (widget.load ?? _load)().timeout(
        const Duration(seconds: 20),
      );
      if (mounted && generation == _generation) {
        setState(() {
          _state = state;
          _busy = false;
        });
      }
    } catch (_) {
      if (generation == _generation) _fail();
    }
  }

  Future<void> _acknowledge() async {
    if (!_checked || _busy) return;
    setState(() => _busy = true);
    try {
      await LegalConsentService()
          .acceptRequiredAgreements(
            List<String>.from(_state!['missingAgreements'] as List),
          )
          .timeout(const Duration(seconds: 20));
      await _refresh();
    } catch (_) {
      _fail();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    if (_error != null) {
      return _shell([
        Text(_error!),
        FilledButton(onPressed: _refresh, child: const Text('Retry')),
      ]);
    }
    if (state == null) {
      return _shell([
        const CircularProgressIndicator(),
        const Text('Opening ScaledCircle…'),
      ]);
    }
    switch (resolveStartupDestination(state)) {
      case StartupDestination.signedOut:
        return widget.signedOut;
      case StartupDestination.scalerProfile:
        return const CompleteScalerProfileScreen();
      case StartupDestination.businessProfile:
        return CompleteBusinessProfileScreen(onCompleted: _refresh);
      case StartupDestination.pending:
        return EarlyAccessPendingScreen(
          email: state['email']?.toString() ?? '',
          role: (state['profile'] as Map)['role']?.toString(),
          onboardingComplete: true,
        );
      case StartupDestination.verifyEmail:
        return _shell([
          const Text('Verify your email to continue.'),
          FilledButton(
            onPressed: _refresh,
            child: const Text('I have verified my email'),
          ),
          TextButton(
            onPressed: () async {
              try {
                await TransactionalEmailService().resendVerification();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Verification email requested. Check your inbox.',
                      ),
                    ),
                  );
                }
              } catch (_) {
                _fail();
              }
            },
            child: const Text('Resend verification email'),
          ),
        ]);
      case StartupDestination.profileMissing:
        return _shell([
          const Text(
            'Your account setup needs attention. Retry to check its status, or contact support@scaledcircle.com.',
          ),
          FilledButton(onPressed: _refresh, child: const Text('Retry')),
        ]);
      case StartupDestination.consent:
        return _shell([
          const Text(
            'Review the agreements needed to continue.',
            style: TextStyle(fontSize: 22),
          ),
          for (final type in List<String>.from(
            state['missingAgreements'] as List,
          )) ...[
            TextButton(
              onPressed: () => openLegalDocument(
                context,
                type == 'terms'
                    ? LegalDocumentKind.terms
                    : type == 'privacy'
                    ? LegalDocumentKind.privacy
                    : LegalDocumentKind.scalerTerms,
              ),
              child: Text(
                type == 'terms'
                    ? 'Read Terms of Service'
                    : type == 'privacy'
                    ? 'Read Privacy Policy'
                    : 'Read Scaler Work Agreement',
              ),
            ),
            Text(
              _agreements[type]!,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          CheckboxListTile(
            value: _checked,
            onChanged: _busy
                ? null
                : (value) => setState(() => _checked = value == true),
            title: const Text(
              'I have read and accept the agreements listed above.',
            ),
          ),
          FilledButton(
            onPressed: _checked && !_busy ? _acknowledge : null,
            child: const Text('Accept and continue'),
          ),
        ]);
      case StartupDestination.business:
      case StartupDestination.scaler:
      case StartupDestination.admin:
        final destination = resolveStartupDestination(state);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            AppNavigation.replace(
              context,
              destination == StartupDestination.admin
                  ? AppRoutes.adminDashboard
                  : destination == StartupDestination.scaler
                  ? AppRoutes.scalerDashboard
                  : AppRoutes.businessDashboard,
            );
          }
        });
        return _shell([
          const CircularProgressIndicator(),
          const Text('Opening your workspace…'),
        ]);
    }
  }

  Widget _shell(List<Widget> children) => Scaffold(
    appBar: AppBar(
      title: const Text('ScaledCircle'),
      actions: [
        if (widget.load == null && FirebaseAuth.instance.currentUser != null)
          const AuthenticatedSignOutButton(),
      ],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(24),
          children: [
            for (final child in children)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: child,
              ),
          ],
        ),
      ),
    ),
  );
}
