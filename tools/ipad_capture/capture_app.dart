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
  print('SC_CAPTURE_MILESTONE:app-entry');
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
        if (request['action'] == 'login-state') {
          var route = 'unknown';
          var email = false, password = false, obscured = false, button = false;
          var dialog = false, loading = false;
          var error = 'none';
          const errors = {
            'No account found.': 'auth_user_not_found',
            'Incorrect password.': 'auth_wrong_password',
            'Invalid email or password.': 'auth_invalid_credentials',
            'Invalid email address.': 'auth_invalid_email',
            'Too many login attempts. Please try again later.':
                'auth_rate_limited',
            'Network error. Check your internet connection.':
                'auth_network_unavailable',
            'Sign-in did not finish. Check your connection and try again. Contact support if this continues.':
                'auth_failed',
            'We could not verify your session. Please retry.':
                'workspace_failed',
            "You don't have access to this page.": 'workspace_denied',
          };
          void inspect(Element element) {
            final widget = element.widget;
            if (ModalRoute.of(element)?.isCurrent != false) {
              final type = widget.runtimeType.toString();
              if (type == 'PublicLandingScreen') route = 'public';
              if (type == 'LoginScreen') route = 'login';
              if (type == 'BusinessDashboard') route = 'business';
              if (widget is TextField) {
                if (widget.decoration?.labelText == 'Email') email = true;
                if (widget.decoration?.labelText == 'Password') {
                  password = true;
                  obscured = widget.obscureText;
                }
              }
              if (widget is ElevatedButton &&
                  widget.child is Text &&
                  (widget.child as Text).data == 'Login') {
                button = widget.onPressed != null;
              }
              if (widget is Dialog || widget is ModalBarrier) dialog = true;
              if (widget is CircularProgressIndicator) loading = true;
              if (widget is Text && errors.containsKey(widget.data)) {
                error = errors[widget.data]!;
              }
              // Never expose arbitrary SDK messages or widget text.
              if (widget is SnackBar && error == 'none') {
                error = 'ui_message_present';
              }
            }
            element.visitChildren(inspect);
          }

          WidgetsBinding.instance.rootElement?.visitChildren(inspect);
          return jsonEncode({
            'protocol': 2,
            'outcome': 'observed',
            'route': route,
            'emailPresent': email,
            'passwordPresent': password,
            'passwordObscured': obscured,
            'loginEnabled': button,
            'dialog': dialog,
            'loading': loading,
            'error': error,
            'signedIn': FirebaseAuth.instance.currentUser != null,
          });
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
  print('SC_CAPTURE_MILESTONE:extension-ready');
  WidgetsBinding.instance.addPostFrameCallback((_) {
    print('SC_CAPTURE_MILESTONE:first-frame');
  });
  try {
    await app.main();
    print('SC_CAPTURE_MILESTONE:app-main-returned');
    mainReturned = true;
  } catch (_) {
    mainFailed = true;
    print('SC_CAPTURE_MILESTONE:app-main-failed');
  }
}
