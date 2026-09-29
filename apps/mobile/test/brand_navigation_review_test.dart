import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_shell_identity.dart';
import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import 'package:flutter_app/theme/app_theme.dart';

// Real maintained header with synthetic identity presentation only. These are
// component proofs, not authenticated production sessions or listing images.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final fontDir = Platform.environment['BRAND_PROOF_FONT_DIR'];
    if (fontDir == null) return;
    for (final entry in {
      'Roboto': 'roboto-regular.ttf',
      'Ahem': 'roboto-regular.ttf',
      'MaterialIcons': 'materialicons-regular.otf',
    }.entries) {
      final loader = FontLoader(entry.key)
        ..addFont(
          Future.value(
            ByteData.sublistView(
              File('$fontDir/${entry.value}').readAsBytesSync(),
            ),
          ),
        );
      await loader.load();
    }
  });
  for (final role in ['business', 'scaler']) {
    for (final width in [390.0, 1100.0]) {
      testWidgets('$role brand and menu at width $width', (tester) async {
        tester.view.physicalSize = Size(width, 650);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final key = GlobalKey();
        await tester.pumpWidget(
          RepaintBoundary(
            key: key,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: AppTheme.darkTheme.copyWith(
                appBarTheme: AppTheme.darkTheme.appBarTheme.copyWith(
                  titleTextStyle: AppTheme.darkTheme.appBarTheme.titleTextStyle!
                      .copyWith(fontFamily: 'Roboto'),
                ),
              ),
              initialRoute: '/$role',
              routes: {
                '/$role': (_) => AppShellIdentity(
                  uid: 'brand-review-fixture',
                  profile: {
                    'role': role,
                    'businessName': 'Review fixture',
                    'displayName': 'Review fixture',
                  },
                  child: Scaffold(
                    appBar: AuthenticatedAppBar(
                      title: Text(
                        role == 'business' ? 'Business Home' : 'Scaler Home',
                      ),
                    ),
                    body: const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'Component review fixture\nNo production account or customer data',
                      ),
                    ),
                  ),
                ),
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.runAsync(() async {
          await precacheImage(
            const AssetImage(
              'assets/brand/wordmark-20260928/scaledcircle-lockup-dark-surface.png',
            ),
            tester.element(find.byType(Scaffold)),
          );
        });
        await tester.pumpAndSettle();
        expect(find.byTooltip('Scaled Circle Home'), findsOneWidget);
        final images = tester.widgetList<Image>(find.byType(Image));
        expect(
          images.any(
            (image) =>
                image.image is AssetImage &&
                (image.image as AssetImage).assetName.contains(
                  'wordmark-20260928/',
                ),
          ),
          isTrue,
        );
        expect(tester.takeException(), isNull);
        await tester.tap(find.byTooltip('Workspace and account'));
        await tester.pumpAndSettle();
        expect(find.text('Account / Profile'), findsOneWidget);
        expect(tester.takeException(), isNull);
        final output = Platform.environment['BRAND_PROOF_OUTPUT'];
        if (output != null) {
          final boundary =
              key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
          await tester.runAsync(() async {
            final image = await boundary.toImage(pixelRatio: 1);
            final data = await image.toByteData(format: ui.ImageByteFormat.png);
            await File(
              '$output/$role-navigation-${width.toInt()}.png',
            ).writeAsBytes(data!.buffer.asUint8List());
            image.dispose();
          });
        }
      });
    }
  }
}
