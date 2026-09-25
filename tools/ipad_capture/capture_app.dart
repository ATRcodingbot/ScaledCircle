import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_driver/driver_extension.dart';
import 'package:flutter_app/main.dart' as app;
import 'package:flutter_app/navigation/app_router.dart';

// Exact failure presentations in the pinned application's three capture routes.
// Text values are inspected locally only; they are never returned to the driver.
const captureScreenFailureText = {
  'We could not load your campaigns. Pull down to retry, or use Retry below.',
  "We couldn't load your campaigns. Try again.",
  "We couldn't load your campaign results. Try again.",
  'Your account changed. Reopen Schedule after signing in.',
  'Your schedule access has changed. Return to your workspace.',
  "We couldn't load your schedule right now. Please retry.",
};

// Copied ONLY into a disposable simulator worktree. Never a release entrypoint.
Future<void> main() async {
  String? authorizedUid;
  var mainReturned = false;
  var mainFailed = false;
  String response(String outcome, [String category = 'none']) =>
      jsonEncode({'protocol': 2, 'outcome': outcome, 'category': category});
  bool applicationMounted() {
    var mounted = false;
    void visit(Element element) {
      if (element.widget is app.ScaledCircleApp) mounted = true;
      element.visitChildren(visit);
    }

    WidgetsBinding.instance.rootElement?.visitChildren(visit);
    return mounted;
  }

  enableFlutterDriverExtension(
    silenceErrors: true,
    handler: (message) async {
      try {
        final request = jsonDecode(message!) as Map;
        if (request['action'] == 'status') {
          return response(
            mainFailed
                ? 'startup_failed'
                : mainReturned &&
                      Firebase.apps.isNotEmpty &&
                      applicationMounted()
                ? 'startup_ready'
                : 'startup_pending',
          );
        }
        if (request['action'] == 'logout') {
          authorizedUid = null;
          if (Firebase.apps.isNotEmpty) {
            await FirebaseAuth.instance.signOut().timeout(
              const Duration(seconds: 7),
            );
          }
          return response('signed_out');
        }
        if (request['action'] == 'verify-login') {
          authorizedUid = null;
          final auth = FirebaseAuth.instance;
          final options = auth.app.options;
          if (auth.app.name != '[DEFAULT]' ||
              options.projectId != 'scaled-circle' ||
              options.appId != '1:1010956217112:ios:91c890b1ca2018a4e70c6d' ||
              auth.tenantId != null) {
            return response('refused', 'auth_runtime_mismatch');
          }
          if (request['expectedUid'] is! String ||
              (request['expectedUid'] as String).isEmpty) {
            return response('refused', 'invalid_input');
          }
          final user = auth.currentUser;
          if (user == null) return response('auth_pending');
          if (user.uid != request['expectedUid'] || !user.emailVerified) {
            await auth.signOut().timeout(const Duration(seconds: 7));
            return response(
              'refused',
              user.uid != request['expectedUid']
                  ? 'auth_identity_mismatch'
                  : 'auth_unverified',
            );
          }
          authorizedUid = user.uid;
          return response('authenticated');
        }
        final user = FirebaseAuth.instance.currentUser;
        if (authorizedUid == null ||
            user?.uid != authorizedUid ||
            user?.emailVerified != true) {
          authorizedUid = null;
          return response('refused', 'auth_refused');
        }
        const screens = {
          'BusinessDashboard': '/business',
          'BusinessScheduleScreen': '/business/schedule',
          'BusinessCampaignsScreen': '/business/campaigns',
        };
        if (request['action'] == 'screen-status') {
          final wanted = request['screen'];
          if (!screens.containsKey(wanted)) {
            return response('refused', 'invalid_input');
          }
          Element? target;
          var blocked = false;
          var failed = false;
          void inspect(Element element) {
            final widget = element.widget;
            final current = ModalRoute.of(element)?.isCurrent != false;
            if (current && widget.runtimeType.toString() == wanted) {
              target = element;
            }
            if (current &&
                widget is Text &&
                captureScreenFailureText.contains(widget.data)) {
              failed = true;
            }
            if (current &&
                (widget is CircularProgressIndicator ||
                    widget is LinearProgressIndicator ||
                    widget is ErrorWidget ||
                    widget is Dialog ||
                    widget is ModalBarrier ||
                    widget.runtimeType.toString() == 'CupertinoAlertDialog')) {
              blocked = true;
            }
            element.visitChildren(inspect);
          }

          WidgetsBinding.instance.rootElement?.visitChildren(inspect);
          if (failed) return response('screen_failed', 'screen_not_ready');
          final route = target == null
              ? null
              : AppRouterScope.maybeOf(target!)?.currentConfiguration.path;
          return response(
            target != null && !blocked && route == screens[wanted]
                ? 'screen_ready'
                : 'screen_not_ready',
          );
        }
        final route = request['route'];
        if (!screens.values.contains(route)) {
          return response('refused', 'route_unavailable');
        }
        Element? navigator;
        void visit(Element element) {
          if (navigator == null && element.widget is Navigator) {
            navigator = element;
          }
          element.visitChildren(visit);
        }

        WidgetsBinding.instance.rootElement?.visitChildren(visit);
        if (navigator == null) {
          return response('not_ready', 'route_unavailable');
        }
        // Maintained router and authenticated/workspace/native policy gates run normally.
        AppNavigation.push(navigator!, route as String);
        return response('opened');
      } on TimeoutException {
        return response('capture_action_failed', 'auth_timeout');
      } on FirebaseAuthException catch (error) {
        final category = switch (error.code) {
          'network-request-failed' => 'auth_network_unavailable',
          'invalid-credential' ||
          'wrong-password' ||
          'user-not-found' ||
          'invalid-email' => 'auth_invalid_credentials',
          'user-disabled' => 'auth_refused',
          _ => 'auth_failed',
        };
        return response('capture_action_failed', category);
      } catch (_) {
        return response('capture_action_failed', 'auth_failed');
      }
    },
  );
  try {
    await app.main();
    mainReturned = true;
  } catch (_) {
    mainFailed = true;
  }
}
