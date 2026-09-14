import 'dart:ui' show SemanticsAction;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import 'package:flutter_app/navigation/app_shell_identity.dart';

Widget fixture({
  String route = '/business/growth-agents',
  bool owner = true,
  String actor = 'u',
  double scale = 1,
  List<Widget>? actions,
}) => AppShellIdentity(
  uid: 'u',
  profile: const {'role': 'business'},
  workspace: {
    'actorUid': actor,
    'isOwner': owner,
    'businessName': 'Attractive Remodel',
    'permissions': owner ? [] : ['scheduleView'],
  },
  child: MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    onGenerateInitialRoutes: (_) => [
      MaterialPageRoute(
        settings: RouteSettings(name: route),
        builder: (_) => Scaffold(
          appBar: AuthenticatedAppBar(
            title: const Text('Lead Generator · Private Beta'),
            actions: actions,
          ),
          body: const Text('Page content'),
        ),
      ),
    ],
    onGenerateRoute: (settings) => MaterialPageRoute(
      settings: settings,
      builder: (_) => Scaffold(body: Text('Destination ${settings.name}')),
    ),
  ),
);
void main() {
  testWidgets('logo returns owner to Home, not the workflow parent', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(fixture());
    await tester.pumpAndSettle();
    expect(
      tester
          .getSemantics(find.byTooltip('ScaledCircle Home'))
          .getSemanticsData()
          .label,
      'ScaledCircle Home',
    );
    expect(
      tester
          .getSemantics(find.byTooltip('ScaledCircle Home'))
          .getSemanticsData()
          .hasAction(SemanticsAction.tap),
      isTrue,
    );
    semantics.dispose();
    await tester.tap(find.byTooltip('ScaledCircle Home'));
    await tester.pumpAndSettle();
    expect(find.text('Destination /business'), findsOneWidget);
  });
  testWidgets('logo returns Schedule-only member to authorized root', (
    tester,
  ) async {
    await tester.pumpWidget(fixture(owner: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('ScaledCircle Home'));
    await tester.pumpAndSettle();
    expect(find.text('Destination /business/schedule'), findsOneWidget);
  });

  test('contextual parents stay inside product', () {
    expect(
      appShellParent('/business/growth-agents', '/business'),
      '/business/growth',
    );
    expect(
      appShellParent('/complete-business-profile', '/business'),
      '/business/account',
    );
    expect(appShellParent('/job-room/z', '/scaler'), '/scaler/work');
  });
  for (final width in [320.0, 390.0, 768.0, 1280.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('shared header fits $width at text scale $scale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          fixture(
            scale: scale,
            actions: [
              IconButton(onPressed: () {}, icon: const Icon(Icons.refresh)),
            ],
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byTooltip('Notifications'), findsOneWidget);
        expect(find.byTooltip('Workspace and account'), findsOneWidget);
        expect(find.text('Private Beta'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets(
    'root has no self Back loop and member menu excludes unrelated responsibilities',
    (tester) async {
      await tester.pumpWidget(fixture(route: '/business', owner: false));
      await tester.pumpAndSettle();
      expect(find.byType(BackButton), findsNothing);
      await tester.tap(find.byTooltip('Workspace and account'));
      await tester.pumpAndSettle();
      expect(find.text('Schedule'), findsOneWidget);
      for (final text in ['Growth', 'Billing / Plan', 'Campaigns', 'Team']) {
        expect(find.text(text), findsNothing);
      }
      expect(find.text('Sign Out'), findsOneWidget);
    },
  );
  testWidgets('stale workspace metadata from another actor is not presented', (
    tester,
  ) async {
    await tester.pumpWidget(fixture(actor: 'other'));
    await tester.tap(find.byTooltip('Workspace and account'));
    await tester.pumpAndSettle();
    expect(find.text('Attractive Remodel'), findsNothing);
    expect(find.text('Growth'), findsNothing);
  });
  testWidgets('direct link Back opens its meaningful parent', (tester) async {
    await tester.pumpWidget(fixture());
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Destination /business/growth'), findsOneWidget);
  });
  testWidgets('direct Schedule-only root has no self-return Back', (
    tester,
  ) async {
    await tester.pumpWidget(fixture(route: '/business/schedule', owner: false));
    expect(find.byType(BackButton), findsNothing);
  });
  testWidgets('anonymous preview returns to exact parent', (tester) async {
    await tester.pumpWidget(fixture());
    final context = tester.element(find.text('Page content'));
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const Scaffold(
          appBar: AuthenticatedAppBar(title: Text('Post Preview')),
          body: Text('Preview content'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('Page content'), findsOneWidget);
  });
}
