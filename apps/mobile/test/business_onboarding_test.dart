import 'dart:io';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/startup_session_gate.dart';
import 'package:flutter_app/screens/auth/register_screen.dart';
import 'package:flutter_app/screens/auth/complete_business_profile_screen.dart';
import 'package:flutter_app/services/auth/refresh_identity.dart';

class TestAuth implements FirebaseAuth {
  TestUser? user;
  @override
  User? get currentUser => user;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestUser implements User {
  TestUser(this.auth);
  final TestAuth auth;
  final calls = <String>[];
  @override
  String get uid => 'test-user';
  @override
  bool get emailVerified => true;
  @override
  Future<void> reload() async {
    calls.add('reload');
  }

  @override
  Future<String?> getIdToken([bool forceRefresh = false]) async {
    calls.add('token:$forceRefresh');
    return 'local-test';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Map<String, dynamic> business({
  bool verified = true,
  bool complete = false,
  bool approved = false,
  List<String> missing = const [],
}) => {
  'signedIn': true,
  'emailVerified': verified,
  'profile': {
    'role': 'business',
    'active': approved,
    'betaAccess': approved ? 'approved' : 'pending',
  },
  'businessProfileComplete': complete,
  'missingAgreements': missing,
};
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setupFirebaseCoreMocks();
  setUpAll(() async {
    await Firebase.initializeApp();
  });
  test(
    'verification is refreshed before callable claims, no role mutation',
    () async {
      final a = TestAuth();
      final u = TestUser(a);
      a.user = u;
      expect(await refreshIdentity(auth: a), u);
      expect(u.calls, ['reload', 'token:true']);
    },
  );
  test(
    'Business onboarding order is deterministic and never sends verified Business to Scaler/verification',
    () {
      expect(
        resolveStartupDestination(business(verified: false)),
        StartupDestination.verifyEmail,
      );
      expect(
        resolveStartupDestination(business()),
        StartupDestination.businessProfile,
      );
      expect(
        resolveStartupDestination(business(missing: ['privacy'])),
        StartupDestination.businessProfile,
      );
      expect(
        resolveStartupDestination(
          business(complete: true, missing: ['privacy']),
        ),
        StartupDestination.consent,
      );
      expect(
        resolveStartupDestination(business(complete: true)),
        StartupDestination.pending,
      );
      expect(
        resolveStartupDestination(business(complete: true, approved: true)),
        StartupDestination.business,
      );
      expect(
        resolveStartupDestination({'signedIn': false}),
        StartupDestination.signedOut,
      );
      expect(
        resolveStartupDestination({
          'signedIn': true,
          'emailVerified': true,
          'profile': {'role': 'business', 'active': true},
        }),
        StartupDestination.business,
      );
      expect(
        resolveStartupDestination({
          'signedIn': true,
          'emailVerified': true,
          'profile': {'role': 'admin'},
        }),
        StartupDestination.admin,
      );
    },
  );
  test(
    'verification CTA resumes shared role resolver, not hard-coded Scaler route',
    () {
      final s = File(
        'lib/screens/auth/verify_email_screen.dart',
      ).readAsStringSync();
      expect(s, contains("AppNavigation.replace(context, '/')"));
      expect(s, contains('refreshIdentity'));
      expect(s, isNot(contains('AppRoutes.completeScalerProfile')));
    },
  );
  for (final width in [390.0, 1100.0]) {
    testWidgets(
      'read legal links independently, restore signup text and checkbox at width $width',
      (t) async {
        await t.binding.setSurfaceSize(Size(width, 900));
        addTearDown(() => t.binding.setSurfaceSize(null));
        await t.pumpWidget(const MaterialApp(home: RegisterScreen()));
        await t.pumpAndSettle();
        await t.enterText(
          find.widgetWithText(TextFormField, 'Full name'),
          'Remember Me',
        );
        for (final pair in [
          ('Read Terms', 'Terms of Service'),
          ('Read Privacy Policy', 'Privacy Policy'),
        ]) {
          await t.scrollUntilVisible(find.text(pair.$1), 400,
              scrollable: find.byType(Scrollable).first);
          await t.pumpAndSettle();
          await t.tap(find.text(pair.$1));
          await t.pumpAndSettle();
          expect(find.text(pair.$2), findsWidgets);
          expect(find.byTooltip('Back'), findsOneWidget);
          await t.tap(find.byTooltip('Back'));
          await t.pumpAndSettle();
          expect(
            t
                .widget<CheckboxListTile>(
                  find.byKey(const Key('signup-legal-acceptance')),
                )
                .value,
            false,
          );
          await t.scrollUntilVisible(find.text('Remember Me'), -400,
              scrollable: find.byType(Scrollable).first);
          expect(find.text('Remember Me'), findsOneWidget);
        }
        expect(t.takeException(), isNull);
      },
    );
  }
  Map<String, dynamic> profile() => {
    'email': 'owner@example.test',
    'profile': {
      'businessName': 'Existing',
      'contactName': 'Owner',
      'businessDescription': 'Repairs',
      'servicesOffered': ['Repair'],
      'serviceAreas': ['Maryland'],
    },
  };
  testWidgets('first-time empty profile resolves to a blank editable form', (t) async {
    await t.pumpWidget(MaterialApp(home: CompleteBusinessProfileScreen(
      load: () async => {'email':'owner@example.test', 'profile':<String,dynamic>{}},
    )));
    await t.pumpAndSettle();
    expect(find.text('Complete your Business profile'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(t.widget<TextFormField>(find.byKey(const Key('business-profile-businessName'))).controller!.text, isEmpty);
  });
  testWidgets(
    'pending owner sees existing form and saved server result controls completion',
    (t) async {
      var calls = 0, completed = false;
      await t.pumpWidget(
        MaterialApp(
          home: CompleteBusinessProfileScreen(
            load: () async => profile(),
            save: (p) async {
              calls++;
              expect(p['businessName'], 'Existing');
              return {'profileComplete': true};
            },
            onCompleted: () => completed = true,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Existing'), findsOneWidget);
      expect(find.text('✓ Email verified'), findsOneWidget);
      await t.scrollUntilVisible(find.text('Save and continue'), 400,
          scrollable: find.byType(Scrollable).first);
      await t.tap(find.text('Save and continue'));
      await t.pumpAndSettle();
      expect(calls, 1);
      expect(completed, true);
    },
  );
  testWidgets(
    'missing first profile displays form; load and save failures visibly recover without false completion',
    (t) async {
      var fail = true, done = false;
      await t.pumpWidget(
        MaterialApp(
          home: CompleteBusinessProfileScreen(
            load: () async {
              if (fail) throw Exception();
              return profile();
            },
            save: (_) async => throw Exception(),
            onCompleted: () => done = true,
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      fail = false;
      await t.tap(find.text('Retry'));
      await t.pumpAndSettle();
      await t.scrollUntilVisible(find.text('Save and continue'), 400,
          scrollable: find.byType(Scrollable).first);
      await t.tap(find.text('Save and continue'));
      await t.pumpAndSettle();
      expect(find.textContaining('not confirmed saved'), findsOneWidget);
      expect(done, false);
    },
  );
}
