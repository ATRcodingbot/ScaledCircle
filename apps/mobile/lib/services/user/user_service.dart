import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/user/user_profile.dart';

class UserService {
  UserService({FirebaseFirestore? firestore, FirebaseAuth? auth})
    : _firestore = firestore ?? FirebaseFirestore.instance,
      _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('users');

  Future<void> updateUserRole({
    required UserRole role,
    required String accountType,
  }) async {
    final user = _auth.currentUser;

    if (user == null) {
      throw Exception('No authenticated user.');
    }

    await _users.doc(user.uid).set({
      'role': role.name,
      'accountType': accountType,
      'email': user.email ?? '',
      'active': true,
      'updatedAt': FieldValue.serverTimestamp(),
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  // ------------------------------------------------------------
  // CREATE USER PROFILE
  // ------------------------------------------------------------

  Future<void> createUserProfile({
    required User user,
    required UserRole role,
    String? displayName,
  }) async {
    final existingUser = await _users.doc(user.uid).get();

    if (existingUser.exists) {
      return;
    }

    final profile = UserProfile(
      id: user.uid,
      email: user.email ?? '',
      displayName: displayName ?? user.displayName ?? '',
      role: role,
      active: true,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await _users.doc(user.uid).set(profile.toMap());
  }

  Future<void> createEarlyAccessProfile({
    required User user,
    required UserRole role,
    required String displayName,
    required String postalCode,
    String contactNumber = '',
    String companyName = '',
    required String discoverySource,
    String referrerName = '',
  }) async {
    if (role != UserRole.business && role != UserRole.scaler) {
      throw ArgumentError('Early-access accounts must be Business or Scaler.');
    }
    const allowedDiscoverySources = {
      'personal_referral',
      'search_engine',
      'social_media',
      'online_ad',
      'event_or_group',
      'other',
    };
    final normalizedDiscoverySource = discoverySource.trim();
    final normalizedReferrerName = referrerName.trim();
    if (!allowedDiscoverySources.contains(normalizedDiscoverySource)) {
      throw ArgumentError('Tell us how you heard about Scaled Circle.');
    }
    if (normalizedDiscoverySource == 'personal_referral' &&
        normalizedReferrerName.isEmpty) {
      throw ArgumentError('Enter the name of the person who referred you.');
    }

    final existingUser = await _users.doc(user.uid).get();
    if (existingUser.exists) return;

    final roleValue = UserProfile.roleValue(role);
    await _users.doc(user.uid).set({
      'email': user.email ?? '',
      'displayName': displayName.trim(),
      'companyName': companyName.trim(),
      'postalCode': postalCode.trim(),
      'contactNumber': contactNumber.trim(),
      'role': roleValue,
      'accountType': roleValue,
      'activeView': roleValue,
      'active': false,
      'betaAccess': 'pending',
      'earlyAccessSource': 'public_account_creation',
      'discoverySource': normalizedDiscoverySource,
      'referrerName': normalizedReferrerName,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // ------------------------------------------------------------
  // GET USER PROFILE
  // ------------------------------------------------------------

  Future<UserProfile?> getUserProfile(String userId) async {
    if (userId.trim().isEmpty) {
      return null;
    }

    final snapshot = await _users.doc(userId).get();

    if (!snapshot.exists) {
      return null;
    }

    return UserProfile.fromDocument(snapshot);
  }

  // ------------------------------------------------------------
  // WATCH USER PROFILE
  // ------------------------------------------------------------

  Stream<UserProfile?> watchUserProfile(String userId) {
    if (userId.trim().isEmpty) {
      return const Stream.empty();
    }

    return _users.doc(userId).snapshots().map((snapshot) {
      if (!snapshot.exists) {
        return null;
      }

      return UserProfile.fromDocument(snapshot);
    });
  }

  // ------------------------------------------------------------
  // UPDATE USER PROFILE
  // ------------------------------------------------------------

  Future<void> updateUserProfile({
    required String userId,
    required Map<String, dynamic> updates,
  }) async {
    if (userId.trim().isEmpty) {
      throw Exception('User ID is required.');
    }

    final data = Map<String, dynamic>.from(updates);

    data['updatedAt'] = FieldValue.serverTimestamp();

    await _users.doc(userId).set(data, SetOptions(merge: true));
  }

  // ------------------------------------------------------------
  // ROLE CHECKS
  // ------------------------------------------------------------

  Future<bool> isAdmin(String userId) async {
    final profile = await getUserProfile(userId);

    return profile?.role == UserRole.admin;
  }

  Future<bool> isBusiness(String userId) async {
    final profile = await getUserProfile(userId);

    return profile?.role == UserRole.business;
  }

  Future<bool> isScaler(String userId) async {
    final profile = await getUserProfile(userId);

    return profile?.role == UserRole.scaler;
  }

  // ------------------------------------------------------------
  // ACTIVE STATUS
  // ------------------------------------------------------------

  Future<bool> isActive(String userId) async {
    final profile = await getUserProfile(userId);

    return profile?.active ?? false;
  }

  Future<void> deactivateUser(String userId) async {
    await updateUserProfile(userId: userId, updates: {'active': false});
  }

  Future<void> activateUser(String userId) async {
    await updateUserProfile(userId: userId, updates: {'active': true});
  }

  // ------------------------------------------------------------
  // CURRENT USER HELPER
  // ------------------------------------------------------------

  Future<UserProfile?> getCurrentUserProfile() async {
    final user = _auth.currentUser;

    if (user == null) {
      return null;
    }

    return getUserProfile(user.uid);
  }
}
