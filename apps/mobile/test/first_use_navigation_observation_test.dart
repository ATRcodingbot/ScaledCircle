// Investigation-only observations of the current behavior; not acceptance of
// the proposed routing correction. No account, profile or checkout is submitted.
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/screens/auth/login_screen.dart';
import 'package:flutter_app/screens/auth/register_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setupFirebaseCoreMocks();
  setUpAll(() async => Firebase.initializeApp());

  Future<AppRouterDelegate> mount(WidgetTester tester) async {
    final router = AppRouterDelegate(
      (settings) => MaterialPageRoute(
        settings: settings,
        builder: (_) => settings.name == '/create-account'
            ? const RegisterScreen()
            : const LoginScreen(),
      ),
    );
    await tester.binding.setSurfaceSize(const Size(1200, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp.router(
        routerDelegate: router,
        routeInformationParser: const AppRouteInformationParser(),
        routeInformationProvider: PlatformRouteInformationProvider(
          initialRouteInformation: RouteInformation(uri: Uri.parse('/login')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('current Create Account displays form but keeps login route', (
    t,
  ) async {
    final router = await mount(t);
    final action = find.text('Create Account');
    await t.ensureVisible(action);
    await t.tap(action);
    await t.pumpAndSettle();
    expect(find.byType(RegisterScreen), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Full name'), findsOneWidget);
    expect(router.currentConfiguration.path, '/login');
    expect(
      ModalRoute.of(t.element(find.byType(RegisterScreen)))!.settings.name,
      isNull,
    );
    expect(t.takeException(), isNull);
  });

  testWidgets(
    'existing named registration route distinguishes form entry and back',
    (t) async {
      final router = await mount(t);
      AppNavigation.push(
        t.element(find.byType(LoginScreen)),
        '/create-account',
      );
      await t.pumpAndSettle();
      expect(find.byType(RegisterScreen), findsOneWidget);
      expect(router.currentConfiguration.path, '/create-account');
      expect(
        ModalRoute.of(t.element(find.byType(RegisterScreen)))!.settings.name,
        '/create-account',
      );
      expect(
        router.popPreviousRoute(t.element(find.byType(RegisterScreen))),
        isTrue,
      );
      await t.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(router.currentConfiguration.path, '/login');
      expect(t.takeException(), isNull);
    },
  );
}
