import 'package:firebase_auth/firebase_auth.dart';

import '../user/user_service.dart';
import '../../models/user/user_profile.dart';
import '../affiliate_service.dart';
import '../transactional_email_service.dart';

class AuthService {
  AuthService({FirebaseAuth? auth, UserService? userService})
    : _auth = auth ?? FirebaseAuth.instance,
      _userService = userService ?? UserService();

  final FirebaseAuth _auth;

  final UserService _userService;

  // ------------------------------------------------------------
  // CURRENT USER
  // ------------------------------------------------------------

  User? get currentUser {
    return _auth.currentUser;
  }

  Stream<User?> get authStateChanges {
    return _auth.authStateChanges();
  }

  // ------------------------------------------------------------
  // SIGN UP
  // ------------------------------------------------------------

  Future<User?> signUp({
    required String email,
    required String password,
    required UserRole role,
    String? displayName,
  }) async {
    if (email.trim().isEmpty) {
      throw Exception('Email is required.');
    }

    if (password.trim().isEmpty) {
      throw Exception('Password is required.');
    }

    if (password.length < 6) {
      throw Exception('Password must be at least 6 characters.');
    }

    final credential = await _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password.trim(),
    );

    final user = credential.user;

    if (user == null) {
      throw Exception('Unable to create user account.');
    }

    try {
      // The profile is the authoritative signup event. Create it only after
      // Firebase accepts the verification-email request so a failed signup
      // cannot leave a profile that queues welcome/operations email.
      await user.sendEmailVerification();
      await _userService.createUserProfile(
        user: user,
        role: role,
        displayName: displayName,
      );
      return user;
    } catch (_) {
      await user.delete();
      rethrow;
    }
  }

  Future<User> signUpForEarlyAccess({
    required String email,
    required String password,
    required UserRole role,
    required String displayName,
    required String postalCode,
    String contactNumber = '',
    String companyName = '',
    required String discoverySource,
    String referrerName = '',
    String? affiliateReferralCode,
    int? affiliateCapturedAtMillis,
  }) async {
    if (role != UserRole.business && role != UserRole.scaler) {
      throw ArgumentError('Choose Business or Scaler.');
    }
    if (email.trim().isEmpty) throw Exception('Email is required.');
    if (password.length < 8) {
      throw Exception('Password must be at least 8 characters.');
    }

    User? user = _auth.currentUser;
    if (user == null || user.email?.toLowerCase() != email.trim().toLowerCase()) {
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      user = credential.user;
    }
    if (user == null) throw Exception('Unable to create user account.');

    try {
      await user.updateDisplayName(displayName.trim());
      await TransactionalEmailService().finalizePublicSignup(
        role: UserProfile.roleValue(role),
        displayName: displayName,
        postalCode: postalCode,
        contactNumber: contactNumber,
        companyName: companyName,
        discoverySource: discoverySource,
        referrerName: referrerName,
      );
      if (role == UserRole.business &&
          affiliateReferralCode != null &&
          affiliateCapturedAtMillis != null) {
        try {
          await AffiliateService().recordBusinessAttribution(
            referralCode: affiliateReferralCode,
            capturedAtMillis: affiliateCapturedAtMillis,
          );
        } catch (_) {
          // Account creation and normal pricing never depend on referral
          // attribution. Invalid/expired codes fail closed without changing
          // the Business signup experience.
        }
      }
      return user;
    } catch (_) {
      // The authenticated identity is deliberately retained so an idempotent
      // finalization can be retried after a transient network failure.
      rethrow;
    }
  }

  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------

  Future<User?> login({required String email, required String password}) async {
    if (email.trim().isEmpty) {
      throw Exception('Email is required.');
    }

    if (password.trim().isEmpty) {
      throw Exception('Password is required.');
    }

    final credential = await _auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password.trim(),
    );

    return credential.user;
  }

  // ------------------------------------------------------------
  // LOGOUT
  // ------------------------------------------------------------

  Future<void> logout() async {
    await _auth.signOut();
  }

  // ------------------------------------------------------------
  // PASSWORD RESET
  // ------------------------------------------------------------

  Future<void> sendPasswordReset({required String email}) async {
    if (email.trim().isEmpty) {
      throw Exception('Email is required.');
    }

    await _auth.sendPasswordResetEmail(email: email.trim());
  }

  // ------------------------------------------------------------
  // DELETE ACCOUNT
  // ------------------------------------------------------------

  Future<void> deleteAccount() async {
    final user = _auth.currentUser;

    if (user == null) {
      throw Exception('No authenticated user.');
    }

    await user.delete();
  }
}
