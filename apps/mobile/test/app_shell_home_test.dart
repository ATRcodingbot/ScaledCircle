import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/navigation/app_shell_identity.dart';
import 'package:flutter_app/navigation/authenticated_app_bar.dart';

void main() {
  for (final guarded in [false, true]) {
    testWidgets('Home from an imperative preview honors guard=$guarded', (
      tester,
    ) async {
      late AppRouterDelegate delegate;
      delegate = AppRouterDelegate(
        (settings) => MaterialPageRoute(
          settings: settings,
          builder: (context) => Scaffold(
            appBar: const AuthenticatedAppBar(title: Text('Workflow')),
            body: Column(
              children: [
                Text('Route ${settings.name}'),
                TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PopScope(
                        canPop: !guarded,
                        child: Scaffold(
                          appBar: const AuthenticatedAppBar(
                            title: Text('Preview'),
                          ),
                          body: const Text('Exact preview'),
                        ),
                      ),
                    ),
                  ),
                  child: const Text('Open preview'),
                ),
              ],
            ),
          ),
        ),
      );

      await tester.pumpWidget(
        AppShellIdentity(
          uid: 'owner',
          profile: const {'role': 'business'},
          child: MaterialApp.router(
            routerDelegate: delegate,
            routeInformationParser: const AppRouteInformationParser(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await delegate.setNewRoutePath(Uri.parse('/business/social-operations'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open preview'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('ScaledCircle Home'));
      await tester.pumpAndSettle();
      expect(
        delegate.currentConfiguration.path,
        guarded ? '/business/social-operations' : '/business',
      );
      expect(
        find.text('Exact preview'),
        guarded ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
