// Registration/navigation acceptance with the real router and auth forms.
// Firebase is mocked; no account, profile, email or checkout is submitted.
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/user/user_profile.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/navigation/public_auth_navigation.dart';
import 'package:flutter_app/screens/auth/login_screen.dart';
import 'package:flutter_app/screens/auth/register_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setupFirebaseCoreMocks();
  setUpAll(() async => Firebase.initializeApp());

  Future<AppRouterDelegate> mount(
    WidgetTester tester, {
    String location = '/login',
    Size size = const Size(1200, 1600),
    double textScale = 1,
  }) async {
    // Only route construction is a fixture. Form rendering, CTA callbacks,
    // named navigation and history use the maintained application classes.
    final router = AppRouterDelegate((settings) {
      final route = Uri.parse(settings.name ?? '/');
      final args = settings.arguments;
      final returnRoute = args is PublicAuthArguments ? args.returnRoute : null;
      return MaterialPageRoute(
        settings: settings,
        builder: (context) => switch (route.path) {
          '/create-account' => RegisterScreen(
            initialRole: publicAuthRole(route),
            referralCode: publicAuthReferral(route),
            returnRoute: returnRoute,
          ),
          '/login' => LoginScreen(
            registrationRole: publicAuthRole(route),
            referralCode: publicAuthReferral(route),
            returnRoute: returnRoute,
          ),
          _ => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => openNamedRegistration(
                  context,
                  UserRole.business,
                  returnRoute: '/business/email-connection',
                ),
                child: const Text('Fixture Business registration entry'),
              ),
            ),
          ),
        },
      );
    });
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp.router(
        key: UniqueKey(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        routerDelegate: router,
        routeInformationParser: const AppRouteInformationParser(),
        routeInformationProvider: PlatformRouteInformationProvider(
          initialRouteInformation: RouteInformation(uri: Uri.parse(location)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  void expectNamedRegistration(WidgetTester tester, AppRouterDelegate router) {
    expect(find.byType(RegisterScreen), findsOneWidget);
    expect(router.currentConfiguration.path, '/create-account');
    final name = ModalRoute.of(
      tester.element(find.byType(RegisterScreen)),
    )!.settings.name;
    expect(name, isNotNull);
    expect(Uri.parse(name!).path, '/create-account');
  }

  test('public auth inputs retain only a supported role and referral code', () {
    expect(publicAuthRole(Uri.parse('/create-account')), UserRole.business);
    expect(
      publicAuthRole(Uri.parse('/create-account?role=admin')),
      UserRole.business,
    );
    expect(
      publicAuthRole(Uri.parse('/create-account?role=scaler')),
      UserRole.scaler,
    );
    expect(
      publicAuthReferral(Uri.parse('/create-account?ref=abcd2345')),
      'ABCD2345',
    );
    expect(
      publicAuthReferral(
        Uri.parse('/create-account?ref=fixture%40example.invalid'),
      ),
      isNull,
    );
    expect(
      publicAuthReferral(Uri.parse('/create-account?ref=INVALID0')),
      isNull,
    );
    expect(
      publicAuthReferral(
        Uri.parse('/create-account'),
        browserLocation: Uri.parse(
          'https://scaledcircle.com/?ref=ABCD2345#/create-account',
        ),
      ),
      'ABCD2345',
    );
    final location = publicAuthLocation(
      '/create-account',
      UserRole.business,
      referralCode: 'fixture@example.invalid',
    );
    expect(Uri.parse(location).queryParameters, {'role': 'business'});
  });

  testWidgets(
    'Login Create Account opens the named Business form and Back returns to login',
    (t) async {
      final router = await mount(t);
      await tapVisible(t, find.text('Create Account'));
      expectNamedRegistration(t, router);
      expect(
        t.widget<RegisterScreen>(find.byType(RegisterScreen)).initialRole,
        UserRole.business,
      );
      expect(
        find.widgetWithText(TextFormField, 'Business name'),
        findsOneWidget,
      );
      await t.tap(find.byType(BackButton));
      await t.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(router.currentConfiguration.path, '/login');
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'direct Business registration stays named after rebuild and reload',
    (t) async {
      const location = '/create-account?role=business&ref=ABCD2345';
      var router = await mount(t, location: location);
      expectNamedRegistration(t, router);
      expect(
        t.widget<RegisterScreen>(find.byType(RegisterScreen)).referralCode,
        'ABCD2345',
      );
      // A normal form edit/rebuild does not introduce an unnamed route.
      await t.enterText(
        find.widgetWithText(TextFormField, 'Full name'),
        'Local fixture',
      );
      await t.pump();
      expect(router.currentConfiguration.toString(), location);
      final reloadLocation = router.currentConfiguration.toString();
      router = await mount(t, location: reloadLocation);
      expectNamedRegistration(t, router);
      expect(
        t.widget<RegisterScreen>(find.byType(RegisterScreen)).initialRole,
        UserRole.business,
      );
      expect(
        t.widget<RegisterScreen>(find.byType(RegisterScreen)).referralCode,
        'ABCD2345',
      );
      expect(find.text('Local fixture'), findsNothing);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'direct Scaler referral remains Scaler through login and account switching',
    (t) async {
      final router = await mount(
        t,
        location: '/create-account?role=scaler&ref=abcd2345',
      );
      expectNamedRegistration(t, router);
      expect(
        t
            .widget<SegmentedButton<UserRole>>(
              find.byType(SegmentedButton<UserRole>),
            )
            .selected,
        {UserRole.scaler},
      );
      expect(find.widgetWithText(TextFormField, 'Business name'), findsNothing);
      await tapVisible(t, find.text('Already have an account? Log In'));
      expect(router.currentConfiguration.path, '/login');
      final login = t.widget<LoginScreen>(find.byType(LoginScreen));
      expect(login.registrationRole, UserRole.scaler);
      expect(login.referralCode, 'ABCD2345');
      await tapVisible(t, find.text('Create Account'));
      expectNamedRegistration(t, router);
      expect(
        t.widget<RegisterScreen>(find.byType(RegisterScreen)).initialRole,
        UserRole.scaler,
      );
      expect(
        t.widget<RegisterScreen>(find.byType(RegisterScreen)).referralCode,
        'ABCD2345',
      );
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'trusted return destination survives form/login switching without entering the URL',
    (t) async {
      final router = await mount(t, location: '/businesses?ref=ABCD2345');
      await tapVisible(t, find.text('Fixture Business registration entry'));
      expectNamedRegistration(t, router);
      var register = t.widget<RegisterScreen>(find.byType(RegisterScreen));
      expect(register.returnRoute, '/business/email-connection');
      expect(register.referralCode, 'ABCD2345');
      expect(router.currentConfiguration.queryParameters, {
        'role': 'business',
        'ref': 'ABCD2345',
      });
      await tapVisible(t, find.text('Already have an account? Log In'));
      expect(
        t.widget<LoginScreen>(find.byType(LoginScreen)).returnRoute,
        '/business/email-connection',
      );
      expect(
        router.currentConfiguration.toString(),
        isNot(contains('email-connection')),
      );
      await tapVisible(t, find.text('Create Account'));
      register = t.widget<RegisterScreen>(find.byType(RegisterScreen));
      expect(register.returnRoute, '/business/email-connection');
      expect(register.referralCode, 'ABCD2345');
      expectNamedRegistration(t, router);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('untrusted return query cannot become a login destination', (
    t,
  ) async {
    final router = await mount(
      t,
      location:
          '/create-account?role=business&returnTo=https%3A%2F%2Fexample.invalid&next=%2Fadmin',
    );
    expect(
      t.widget<RegisterScreen>(find.byType(RegisterScreen)).returnRoute,
      isNull,
    );
    await tapVisible(t, find.text('Already have an account? Log In'));
    expect(t.widget<LoginScreen>(find.byType(LoginScreen)).returnRoute, isNull);
    expect(router.currentConfiguration.queryParameters, {'role': 'business'});
    expect(t.takeException(), isNull);
  });

  testWidgets(
    'direct registration Back without prior history safely returns home',
    (t) async {
      final router = await mount(t, location: '/create-account?role=business');
      await t.tap(find.byType(BackButton));
      await t.pumpAndSettle();
      expect(router.currentConfiguration.path, '/');
      expect(find.text('Fixture Business registration entry'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'narrow registration remains usable at 2x text with keyboard traversal',
    (t) async {
      final router = await mount(
        t,
        location: '/create-account?role=business',
        size: const Size(360, 800),
        textScale: 2,
      );
      expectNamedRegistration(t, router);
      expect(t.takeException(), isNull);
      final formScroll = find
          .byWidgetPredicate(
            (widget) =>
                widget is Scrollable &&
                widget.axisDirection == AxisDirection.down,
          )
          .first;
      final name = find.widgetWithText(TextFormField, 'Full name');
      await t.scrollUntilVisible(name, 300, scrollable: formScroll);
      await t.pumpAndSettle();
      await t.enterText(name, 'Local fixture');
      await t.testTextInput.receiveAction(TextInputAction.next);
      await t.pumpAndSettle();
      final company = find.widgetWithText(TextFormField, 'Business name');
      final companyEditable = t.widget<EditableText>(
        find.descendant(of: company, matching: find.byType(EditableText)),
      );
      expect(companyEditable.focusNode.hasFocus, isTrue);
      await t.enterText(company, 'Local fixture business');
      await t.testTextInput.receiveAction(TextInputAction.next);
      await t.pumpAndSettle();
      final email = find.widgetWithText(TextFormField, 'Email');
      expect(
        t
            .widget<EditableText>(
              find.descendant(of: email, matching: find.byType(EditableText)),
            )
            .focusNode
            .hasFocus,
        isTrue,
      );
      // No submit: inspect the required consent and action, then leave safely.
      final submit = find.widgetWithText(
        FilledButton,
        'Create Business Account',
      );
      await t.scrollUntilVisible(
        find.byKey(const Key('signup-legal-acceptance')),
        300,
        scrollable: formScroll,
      );
      await t.pumpAndSettle();
      expect(
        t
            .widget<CheckboxListTile>(
              find.byKey(const Key('signup-legal-acceptance')),
            )
            .value,
        isFalse,
      );
      await t.scrollUntilVisible(submit, 300, scrollable: formScroll);
      await t.pumpAndSettle();
      expect(submit.hitTestable(), findsOneWidget);
      expect(t.takeException(), isNull);
      await t.scrollUntilVisible(
        find.text('Already have an account? Log In'),
        -300,
        scrollable: formScroll,
      );
      await tapVisible(t, find.text('Already have an account? Log In'));
      final create = find.text('Create Account');
      await t.scrollUntilVisible(create, 300, scrollable: formScroll);
      await t.pumpAndSettle();
      Focus.of(t.element(create)).requestFocus();
      await t.pump();
      await t.sendKeyEvent(LogicalKeyboardKey.enter);
      await t.pumpAndSettle();
      expectNamedRegistration(t, router);
      expect(t.takeException(), isNull);
    },
  );
}
