import '../preferences/market_state_screen.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../widgets/authenticated_sign_out_button.dart';
import '../preferences/areas_preferences_screen.dart';
import '../../services/discovery_preferences_service.dart';
import '../../services/transactional_email_service.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import '../../services/auth/refresh_identity.dart';
import '../../screens/auth/complete_business_profile_screen.dart';

class EarlyAccessPendingScreen extends StatefulWidget {
  final String email;
  final String? role;

  const EarlyAccessPendingScreen({
    super.key,
    required this.email,
    this.role,
    this.onboardingComplete = false,
  });
  final bool onboardingComplete;

  @override
  State<EarlyAccessPendingScreen> createState() =>
      _EarlyAccessPendingScreenState();
}

class _EarlyAccessPendingScreenState extends State<EarlyAccessPendingScreen> {
  final _preferences = DiscoveryPreferencesService();
  Map<String, dynamic>? _summary;
  bool _emailVerified = false;
  bool _resending = false;
  String? _verificationNotice;

  @override
  void initState() {
    super.initState();
    _refreshVerification();
  }

  Future<void> _refreshVerification() async {
    try {
      final user = await refreshIdentity();
      if (mounted) setState(() => _emailVerified = user?.emailVerified == true);
    } catch (_) {
      if (mounted) {
        setState(
          () => _verificationNotice =
              'We could not refresh your account. Please retry.',
        );
      }
    }
  }

  Future<void> _resendVerification() async {
    if (_resending) return;
    setState(() {
      _resending = true;
      _verificationNotice = null;
    });
    try {
      await TransactionalEmailService().resendVerification();
      if (mounted) {
        setState(
          () => _verificationNotice = 'A new verification email is on its way.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _verificationNotice =
              'Please wait a few minutes before requesting another email.',
        );
      }
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  Future<void> _returnToSite(BuildContext context) async {
    AppNavigation.replace(context, '/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(actions: const [AuthenticatedSignOutButton()]),
      backgroundColor: const Color(0xFF020914),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0xFF071525),
                border: Border.all(color: const Color(0xFF143552)),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    if (widget.role == 'business' || widget.role == 'scaler')
                      MarketStatusCard(business: widget.role == 'business'),
                    const Icon(
                      Icons.schedule_send,
                      color: Color(0xFF14E39A),
                      size: 64,
                    ),
                    const SizedBox(height: 22),
                    Text(
                      widget.onboardingComplete
                          ? 'Your account is ready.'
                          : "YOU'RE SET UP",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      widget.onboardingComplete
                          ? 'ScaledCircle is currently in early access. We’ll notify you when full ${widget.role == 'business' ? 'Business' : 'Scaler'} access is available.'
                          : 'Your ScaledCircle account has been created for ${widget.email}. '
                                "We're rolling out marketplace access in stages. We'll let you know when your account is ready.",
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xFFB8C9D8),
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (widget.role == 'business') ...[
                      FilledButton(
                        onPressed: () => widget.onboardingComplete
                            ? Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) =>
                                      const CompleteBusinessProfileScreen(),
                                ),
                              )
                            : AppNavigation.replace(context, '/'),
                        child: Text(
                          widget.onboardingComplete
                              ? 'Edit Business profile'
                              : 'Continue account setup',
                        ),
                      ),
                      TextButton(
                        onPressed: () =>
                            AppNavigation.replace(context, AppRoutes.login),
                        child: const Text('Check access status'),
                      ),
                    ],
                    if (!_emailVerified) ...[
                      OutlinedButton.icon(
                        onPressed: _resending ? null : _resendVerification,
                        icon: _resending
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.mark_email_unread_outlined),
                        label: const Text('Resend Verification Email'),
                      ),
                      if (_verificationNotice != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          _verificationNotice!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFFB8C9D8)),
                        ),
                      ],
                      const SizedBox(height: 18),
                    ],
                    if (widget.role == 'scaler') ...[
                      if (_summary != null)
                        Card(
                          child: ListTile(
                            leading: const Icon(Icons.tune),
                            title: const Text("You're set up"),
                            subtitle: Text(
                              '${(_summary!['areas'] as List? ?? const []).length} Work Areas • '
                              '${(_summary!['jobTypes'] as List? ?? const []).length} Job Interests • '
                              'Email ${(_summary!['alertDelivery'] as Map?)?['email'] == true ? 'On' : 'Off'}',
                            ),
                          ),
                        ),
                      FilledButton.tonalIcon(
                        onPressed: () async {
                          await FirebaseAuth.instance.currentUser?.reload();
                          if (FirebaseAuth
                                  .instance
                                  .currentUser
                                  ?.emailVerified !=
                              true) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Verify your email first, then try again.',
                                ),
                              ),
                            );
                            return;
                          }
                          if (!context.mounted) return;
                          await Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => AreasPreferencesScreen(
                                role: 'scaler',
                                onboarding: true,
                                loadPreferences: _preferences.loadPendingScaler,
                                savePreferences: _preferences.savePendingScaler,
                                completePreferences:
                                    _preferences.completePendingScalerSetup,
                                onSaved: (saved) {
                                  setState(() => _summary = saved);
                                },
                                onCompleted: (saved) {
                                  setState(() => _summary = saved);
                                  Navigator.of(context).pop();
                                },
                                onSkip: () => Navigator.of(context).pop(),
                              ),
                            ),
                          );
                        },
                        icon: const Icon(Icons.work_outline),
                        label: Text(
                          _summary == null
                              ? 'Set Up Work Preferences'
                              : 'Edit Work Preferences',
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Choose Work Areas, job interests, travel, and alerts. This does not grant marketplace access.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFFB8C9D8)),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Referral Program — Coming Soon. Enrollment and rewards are not available yet.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF7FA0B8)),
                      ),
                      const SizedBox(height: 24),
                    ],
                    FilledButton(
                      onPressed: () => _returnToSite(context),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF14E39A),
                        foregroundColor: const Color(0xFF020914),
                        padding: const EdgeInsets.all(18),
                      ),
                      child: const Text('Return to Scaled Circle'),
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
