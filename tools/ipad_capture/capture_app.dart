import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_driver/driver_extension.dart';
import 'package:flutter_app/main.dart' as app;
import 'package:flutter_app/navigation/app_router.dart';

// Copied ONLY into a disposable simulator worktree. Never a release entrypoint.
Future<void> main() async {
  var authorized = false;
  enableFlutterDriverExtension(
    silenceErrors: true,
    handler: (message) async {
      try {
        final request = jsonDecode(message!) as Map;
        if (request['action'] == 'login') {
          for (var i = 0; Firebase.apps.isEmpty && i < 60; i++) {
            await Future<void>.delayed(const Duration(seconds: 1));
          }
          final result = await FirebaseAuth.instance.signInWithEmailAndPassword(
            email: request['email'] as String,
            password: request['password'] as String,
          );
          authorized =
              result.user?.uid == request['expectedUid'] &&
              result.user?.emailVerified == true;
          if (!authorized) await FirebaseAuth.instance.signOut();
          return authorized ? 'authenticated' : 'refused';
        }
        if (!authorized) return 'refused';
        if (request['action'] == 'logout') {
          authorized = false;
          await FirebaseAuth.instance.signOut();
          return 'signed_out';
        }
        final route = request['route'];
        if (!const [
          '/business',
          '/business/schedule',
          '/business/campaigns',
        ].contains(route))
          return 'refused';
        Element? navigator;
        void visit(Element element) {
          if (navigator == null && element.widget is Navigator)
            navigator = element;
          element.visitChildren(visit);
        }

        WidgetsBinding.instance.rootElement?.visitChildren(visit);
        if (navigator == null) return 'not_ready';
        // Maintained router and authenticated/workspace/native policy gates run normally.
        AppNavigation.push(navigator!, route as String);
        return 'opened';
      } catch (_) {
        // Never serialize Firebase exceptions, requests, credentials, or user records.
        return 'capture_action_failed';
      }
    },
  );
  await app.main();
}
