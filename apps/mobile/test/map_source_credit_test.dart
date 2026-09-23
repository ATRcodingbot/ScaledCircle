// Uses the existing locked url_launcher platform interface only as a test fake.
// ignore_for_file: depend_on_referenced_packages
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/map_source_credit.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';
import 'package:url_launcher_platform_interface/link.dart';

class _Launcher extends UrlLauncherPlatform {
  @override
  LinkDelegate? get linkDelegate => null;
  bool succeeds = true;
  bool throws = false;
  String? url;
  PreferredLaunchMode? mode;
  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    this.url = url;
    mode = options.mode;
    if (throws) throw StateError('unavailable');
    return succeeds;
  }
}

void main() {
  late _Launcher launcher;
  late UrlLauncherPlatform previous;
  setUp(() {
    previous = UrlLauncherPlatform.instance;
    launcher = _Launcher();
    UrlLauncherPlatform.instance = launcher;
  });
  tearDown(() => UrlLauncherPlatform.instance = previous);

  Widget fixture({double scale = 1}) => MaterialApp(
    home: Scaffold(
      body: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(scale)),
        child: MapAttributionFrame(
          additionalCredit: 'Boundaries: Nominatim / U.S. Census',
          child: TextField(
            controller: TextEditingController(text: 'Saved map selection'),
          ),
        ),
      ),
    ),
  );

  testWidgets('external licence launch preserves workflow through resume', (
    tester,
  ) async {
    await tester.pumpWidget(fixture());
    final field = tester.state(find.byType(TextField));
    await tester.tap(find.text('© OpenStreetMap contributors'));
    await tester.pumpAndSettle();
    expect(launcher.url, 'https://www.openstreetmap.org/copyright');
    expect(launcher.mode, PreferredLaunchMode.externalApplication);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(tester.state(find.byType(TextField)), same(field));
    expect(find.text('Saved map selection'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
  });

  for (final throws in [false, true]) {
    testWidgets('failed launch is visible (exception=$throws)', (tester) async {
      launcher.succeeds = false;
      launcher.throws = throws;
      await tester.pumpWidget(fixture());
      await tester.tap(find.text('© OpenStreetMap contributors'));
      await tester.pumpAndSettle();
      expect(
        find.text('Could not open the map licence. Please try again.'),
        findsOneWidget,
      );
      expect(find.text('Saved map selection'), findsOneWidget);
    });
  }
  for (final size in [const Size(320, 568), const Size(1024, 768)]) {
    for (final scale in [1.0, 3.0]) {
      testWidgets('readable accessible footer $size scale $scale', (
        tester,
      ) async {
        tester.view.reset();
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(fixture(scale: scale));
        expect(tester.takeException(), isNull);
        expect(find.text('© OpenStreetMap contributors'), findsOneWidget);
        expect(
          find.text('Boundaries: Nominatim / U.S. Census'),
          findsOneWidget,
        );
        expect(
          tester
              .getSemantics(find.byKey(const Key('osm-copyright-link')))
              .flagsCollection
              .isLink,
          isTrue,
        );
        expect(
          tester.getRect(find.byType(TextButton)).bottom,
          lessThanOrEqualTo(size.height),
        );
        await tester.tap(find.byType(TextButton));
        await tester.pumpAndSettle();
        expect(launcher.url, osmCopyrightUrl);
        semantics.dispose();
      });
    }
  }
  test('every existing OSM map uses the shared visible attribution frame', () {
    final maps = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        .where((f) => f.readAsStringSync().contains('tile.openstreetmap.org'));
    expect(maps.length, 11);
    for (final file in maps) {
      final source = file.readAsStringSync();
      expect(source, contains('MapAttributionFrame('), reason: file.path);
      expect(
        source,
        isNot(contains('RichAttributionWidget(')),
        reason: file.path,
      );
    }
    expect(
      File('lib/widgets/mapped_address_field.dart').readAsStringSync(),
      contains('MapSourceCredit('),
    );
  });
}
