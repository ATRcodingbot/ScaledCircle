import 'package:firebase_auth/firebase_auth.dart';

/// Reload verification from Auth, then refresh claims used by Firestore and
/// callable requests. Reload alone may leave email_verified in the old token.
Future<User?> refreshIdentity({FirebaseAuth? auth}) async {
  final current = auth ?? FirebaseAuth.instance;
  final before = current.currentUser;
  if (before == null) return null;
  await before.reload().timeout(const Duration(seconds: 15));
  final user = current.currentUser;
  if (user == null || user.uid != before.uid) {
    throw StateError('Session changed');
  }
  await user.getIdToken(true).timeout(const Duration(seconds: 15));
  return user;
}
