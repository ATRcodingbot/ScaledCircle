import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../navigation/app_router.dart';
import '../../services/business_workspace_service.dart';
import '../../services/legal_consent_service.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import 'login_screen.dart';
import 'invited_account_screen.dart';
import '../../services/transactional_email_service.dart';

class TeamInvitationScreen extends StatefulWidget {
  const TeamInvitationScreen({super.key, required this.location});
  final Uri location;
  @override
  State<TeamInvitationScreen> createState() => _TeamInvitationScreenState();
}

class _TeamInvitationScreenState extends State<TeamInvitationScreen> {
  bool _busy = false, _checked = false;
  String? _error;
  Future<void> _accept() async {
    if (_busy || !_checked) return;
    setState(() => _busy = true);
    try {
      await LegalConsentService().acceptRequiredAgreements([
        'terms',
        'privacy',
      ]);
      await BusinessWorkspaceService().call('acceptBusinessTeamInvitation', {
        'businessId': widget.location.queryParameters['business'],
        'invitationId': widget.location.queryParameters['invitation'],
        'token': widget.location.queryParameters['token'],
      });
      await BusinessWorkspaceService().context();
      if (mounted) AppNavigation.replace(context, '/business');
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Invitation could not be accepted. Use the invited email, verify it, and check that the invitation is still valid. No membership was confirmed.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<User?>(
    stream: FirebaseAuth.instance.authStateChanges(),
    initialData: FirebaseAuth.instance.currentUser,
    builder: (context, snapshot) {
      final user = FirebaseAuth.instance.currentUser;
      return Scaffold(
        appBar: AppBar(
          title: const Text('Join a Business team'),
          actions: [if (user != null) const AuthenticatedSignOutButton()],
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24),
              children: [
                const Text(
                  'Use the email address that received this invitation. Business information stays private until you accept.',
                ),
                if (user == null) ...[
                  FilledButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => LoginScreen(
                          returnRoute: widget.location.toString(),
                        ),
                      ),
                    ),
                    child: const Text('Sign In to Accept'),
                  ),
                  TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            InvitedAccountScreen(location: widget.location),
                      ),
                    ),
                    child: const Text('Create an Account'),
                  ),
                  const Text(
                    'Create a personal login, verify your email, then accept here. You do not need a separate Business subscription.',
                  ),
                ] else ...[
                  Text('Signed in as ${user.email ?? 'your account'}'),
                  if (!user.emailVerified) ...[
                    const Text(
                      'Verify your email before accepting. Your invitation stays on this screen.',
                    ),
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              try {
                                await user.reload();
                                await FirebaseAuth.instance.currentUser
                                    ?.getIdToken(true);
                                if (mounted) setState(() {});
                              } catch (_) {
                                if (mounted) {
                                  setState(
                                    () => _error =
                                        'Verification could not be refreshed. Retry.',
                                  );
                                }
                              }
                            },
                      child: const Text('I have verified my email'),
                    ),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              try {
                                await TransactionalEmailService()
                                    .resendVerification();
                                if (mounted) {
                                  setState(
                                    () => _error =
                                        'Verification email requested. Check your inbox.',
                                  );
                                }
                              } catch (_) {
                                if (mounted) {
                                  setState(
                                    () => _error =
                                        'Verification email could not be sent. Retry.',
                                  );
                                }
                              }
                            },
                      child: const Text('Resend verification email'),
                    ),
                  ],
                  TextButton(
                    onPressed: () => AppNavigation.push(context, '/terms'),
                    child: const Text('Read Terms of Service'),
                  ),
                  TextButton(
                    onPressed: () => AppNavigation.push(context, '/privacy'),
                    child: const Text('Read Privacy Policy'),
                  ),
                  CheckboxListTile(
                    value: _checked,
                    onChanged: _busy
                        ? null
                        : (v) => setState(() => _checked = v == true),
                    title: const Text(
                      'I accept the current Terms and Privacy Policy and want to join this Business.',
                    ),
                  ),
                  if (_error != null) Text(_error!),
                  FilledButton(
                    onPressed:
                        _busy ||
                            !_checked ||
                            FirebaseAuth.instance.currentUser?.emailVerified !=
                                true
                        ? null
                        : _accept,
                    child: Text(_busy ? 'Joining…' : 'Accept Invitation'),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    },
  );
}
