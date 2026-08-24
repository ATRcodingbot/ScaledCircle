import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/user/user_profile.dart';
import '../../services/auth/auth_service.dart';
import '../../services/public_site_service.dart';
import '../../services/affiliate_service.dart';
import '../public/early_access_pending_screen.dart';
import '../../widgets/referral_source_fields.dart';
import '../../widgets/scaled_circle_brand.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';

class RegisterScreen extends StatefulWidget {
  final UserRole initialRole;

  const RegisterScreen({super.key, this.initialRole = UserRole.business});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _companyController = TextEditingController();
  final _emailController = TextEditingController();
  final _contactNumberController = TextEditingController();
  final _postalController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _referrerNameController = TextEditingController();
  final _authService = AuthService();

  late UserRole _role;
  String? _discoverySource;
  bool _emailUpdates = true;
  bool _acceptedLegal = false;
  bool _obscurePassword = true;
  bool _loading = false;
  String? _affiliateReferralCode;
  late final int _affiliateCapturedAtMillis;

  @override
  void initState() {
    super.initState();
    _role = widget.initialRole == UserRole.scaler
        ? UserRole.scaler
        : UserRole.business;
    _affiliateReferralCode = AffiliateService.referralCodeFromUri(Uri.base);
    _affiliateCapturedAtMillis = DateTime.now().millisecondsSinceEpoch;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _companyController.dispose();
    _emailController.dispose();
    _contactNumberController.dispose();
    _postalController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _referrerNameController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_acceptedLegal) {
      _showError('Review and accept the Terms and Privacy Policy to continue.');
      return;
    }
    setState(() => _loading = true);

    final email = _emailController.text.trim();
    try {
      await _authService.signUpForEarlyAccess(
        email: email,
        password: _passwordController.text,
        role: _role,
        displayName: _nameController.text.trim(),
        postalCode: _postalController.text.trim(),
        contactNumber: _contactNumberController.text.trim(),
        companyName: _role == UserRole.business
            ? _companyController.text.trim()
            : '',
        discoverySource: _discoverySource!,
        referrerName: _discoverySource == ReferralSourceFields.personalReferral
            ? _referrerNameController.text.trim()
            : '',
        affiliateReferralCode: _role == UserRole.business
            ? _affiliateReferralCode
            : null,
        affiliateCapturedAtMillis: _role == UserRole.business &&
                _affiliateReferralCode != null
            ? _affiliateCapturedAtMillis
            : null,
      );

      if (_emailUpdates) {
        try {
          await PublicSiteService.joinWaitlist(
            role: UserProfile.roleValue(_role),
            displayName: _nameController.text.trim(),
            email: email,
            postalCode: _postalController.text.trim(),
            contactNumber: _contactNumberController.text.trim(),
            companyName: _role == UserRole.business
                ? _companyController.text.trim()
                : '',
            consent: true,
            source: 'flutter_account_creation',
            discoverySource: _discoverySource!,
            referrerName:
                _discoverySource == ReferralSourceFields.personalReferral
                ? _referrerNameController.text.trim()
                : '',
          );
        } catch (_) {
          // The real account is already safely pending. Alert enrollment can
          // be retried later without blocking account creation.
        }
      }

      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => EarlyAccessPendingScreen(
            email: email,
            role: UserProfile.roleValue(_role),
          ),
        ),
        (_) => false,
      );
    } on FirebaseAuthException catch (error) {
      _showError(_authMessage(error));
    } catch (error) {
      _showError(error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _authMessage(FirebaseAuthException error) {
    switch (error.code) {
      case 'email-already-in-use':
        return 'An account already exists for this email. Try logging in.';
      case 'invalid-email':
        return 'Enter a valid email address.';
      case 'weak-password':
        return 'Choose a stronger password.';
      case 'network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return error.message ?? 'Unable to create the account.';
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String? _required(String? value, String label) {
    if (value == null || value.trim().isEmpty) return '$label is required.';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const ScaledCircleBrand(compact: true)),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  const Text(
                    'Join ScaledCircle',
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Choose how you will use ScaledCircle. New Maryland accounts are placed in early-access review until launch access is approved.',
                  ),
                  const SizedBox(height: 24),
                  SegmentedButton<UserRole>(
                    segments: const [
                      ButtonSegment(
                        value: UserRole.business,
                        icon: Icon(Icons.business_outlined),
                        label: Text('Business'),
                      ),
                      ButtonSegment(
                        value: UserRole.scaler,
                        icon: Icon(Icons.directions_walk),
                        label: Text('Scaler'),
                      ),
                    ],
                    selected: {_role},
                    onSelectionChanged: _loading
                        ? null
                        : (selection) =>
                              setState(() => _role = selection.first),
                  ),
                  const SizedBox(height: 22),
                  TextFormField(
                    controller: _nameController,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.name],
                    validator: (value) => _required(value, 'Full name'),
                    decoration: const InputDecoration(
                      labelText: 'Full name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (_role == UserRole.business) ...[
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _companyController,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.organizationName],
                      validator: (value) => _required(value, 'Business name'),
                      decoration: const InputDecoration(
                        labelText: 'Business name',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    validator: (value) {
                      final required = _required(value, 'Email');
                      if (required != null) return required;
                      return value!.contains('@')
                          ? null
                          : 'Enter a valid email.';
                    },
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _contactNumberController,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    decoration: const InputDecoration(
                      labelText: 'Contact number (optional)',
                      helperText: 'Used only for Scaled Circle outreach.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ReferralSourceFields(
                    source: _discoverySource,
                    onSourceChanged: _loading
                        ? (_) {}
                        : (value) => setState(() {
                            _discoverySource = value;
                            if (value !=
                                ReferralSourceFields.personalReferral) {
                              _referrerNameController.clear();
                            }
                          }),
                    referrerNameController: _referrerNameController,
                    enabled: !_loading,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _postalController,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.postalCode],
                    validator: (value) => _required(value, 'ZIP code'),
                    decoration: const InputDecoration(
                      labelText: 'Maryland ZIP code',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.newPassword],
                    validator: (value) => (value?.length ?? 0) >= 8
                        ? null
                        : 'Use at least 8 characters.',
                    decoration: InputDecoration(
                      labelText: 'Password',
                      helperText: 'At least 8 characters',
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        onPressed: () => setState(
                          () => _obscurePassword = !_obscurePassword,
                        ),
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _confirmPasswordController,
                    obscureText: true,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) {
                      if (!_loading) _register();
                    },
                    validator: (value) => value == _passwordController.text
                        ? null
                        : 'Passwords do not match.',
                    decoration: const InputDecoration(
                      labelText: 'Confirm password',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _emailUpdates,
                    onChanged: _loading
                        ? null
                        : (value) =>
                              setState(() => _emailUpdates = value ?? false),
                    title: const Text(
                      'Email me launch updates and beta invitations.',
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  CheckboxListTile(
                    key: const Key('signup-legal-acceptance'),
                    contentPadding: EdgeInsets.zero,
                    value: _acceptedLegal,
                    onChanged: _loading
                        ? null
                        : (value) => setState(() => _acceptedLegal = value ?? false),
                    title: const Text('I agree to the Terms of Service and acknowledge the Privacy Policy.'),
                    subtitle: Wrap(
                      spacing: 4,
                      children: [
                        TextButton(
                          onPressed: () => AppNavigation.push(context, AppRoutes.terms),
                          child: const Text('Read Terms'),
                        ),
                        TextButton(
                          onPressed: () => AppNavigation.push(context, AppRoutes.privacy),
                          child: const Text('Read Privacy Policy'),
                        ),
                        if (_role == UserRole.scaler)
                          TextButton(
                            onPressed: () => AppNavigation.push(context, AppRoutes.scalerTerms),
                            child: const Text('Scaler Work & Earnings'),
                          ),
                      ],
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 56,
                    child: FilledButton(
                      onPressed: _loading ? null : _register,
                      child: _loading
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              _role == UserRole.business
                                  ? 'Create Business Account'
                                  : 'Create Scaler Account',
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
