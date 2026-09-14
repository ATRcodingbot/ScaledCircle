import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

/// Identity presentation only; route gates and server permissions remain authority.
class AppShellIdentity extends InheritedWidget {
  const AppShellIdentity({
    super.key,
    required this.uid,
    required this.profile,
    this.workspace,
    required super.child,
  });
  final String uid;
  final Map<String, dynamic> profile;
  final Map<String, dynamic>? workspace;
  static AppShellIdentity? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppShellIdentity>();
  @override
  bool updateShouldNotify(AppShellIdentity old) =>
      uid != old.uid || profile != old.profile || workspace != old.workspace;
}

class AppShellSession extends StatelessWidget {
  const AppShellSession({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => StreamBuilder<User?>(
    stream: FirebaseAuth.instance.authStateChanges(),
    initialData: FirebaseAuth.instance.currentUser,
    builder: (context, auth) {
      final user = auth.data;
      if (user == null) return child;
      return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        key: ValueKey(user.uid),
        stream: FirebaseFirestore.instance.doc('users/${user.uid}').snapshots(),
        builder: (context, snapshot) => snapshot.data?.data() == null
            ? child
            : AppShellIdentity(
                uid: user.uid,
                profile: snapshot.data!.data()!,
                child: child,
              ),
      );
    },
  );
}
