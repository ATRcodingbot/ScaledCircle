import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class AdminRoleGate extends StatelessWidget {
  const AdminRoleGate({
    required this.builder,
    this.allowOperationsRead = false,
    super.key,
  });

  final WidgetBuilder builder;
  final bool allowOperationsRead;

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('Administrator authentication required.')),
      );
    }
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final profile = snapshot.data?.data();
        final access = profile?['adminOperationsAccess'];
        final operations =
            allowOperationsRead &&
            user.emailVerified &&
            profile?['disabled'] != true &&
            access is Map &&
            access['mode'] == 'read_only' &&
            access['expiresAtMs'] is num &&
            (access['expiresAtMs'] as num) >
                DateTime.now().millisecondsSinceEpoch;
        if (profile?['role'] != 'admin' && !operations) {
          return const Scaffold(
            body: Center(child: Text('Administrator authority is required.')),
          );
        }
        return builder(context);
      },
    );
  }
}
