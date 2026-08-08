import 'package:cloud_firestore/cloud_firestore.dart';

enum UserRole { business, scaler, admin }

class UserProfile {
  final String id;

  final String email;

  final String displayName;

  final UserRole role;

  final bool active;

  final DateTime? createdAt;

  final DateTime? updatedAt;

  const UserProfile({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    required this.active,
    this.createdAt,
    this.updatedAt,
  });

  factory UserProfile.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data() ?? {};

    return UserProfile(
      id: document.id,
      email: data['email']?.toString() ?? '',
      displayName: data['displayName']?.toString() ?? '',
      role: _roleFromString(data['role']?.toString()),
      active: data['active'] == true,
      createdAt: _dateTimeFromValue(data['createdAt']),
      updatedAt: _dateTimeFromValue(data['updatedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'displayName': displayName,
      'role': roleValue(role),
      'active': active,
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
    };
  }

  UserProfile copyWith({
    String? id,
    String? email,
    String? displayName,
    UserRole? role,
    bool? active,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return UserProfile(
      id: id ?? this.id,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      role: role ?? this.role,
      active: active ?? this.active,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  static UserRole _roleFromString(String? value) {
    switch (value) {
      case 'admin':
        return UserRole.admin;

      case 'scaler':
        return UserRole.scaler;

      case 'business':
      default:
        return UserRole.business;
    }
  }

  static String roleValue(UserRole role) {
    switch (role) {
      case UserRole.business:
        return 'business';

      case UserRole.scaler:
        return 'scaler';

      case UserRole.admin:
        return 'admin';
    }
  }

  static DateTime? _dateTimeFromValue(dynamic value) {
    if (value is Timestamp) {
      return value.toDate();
    }

    if (value is DateTime) {
      return value;
    }

    return null;
  }
}
