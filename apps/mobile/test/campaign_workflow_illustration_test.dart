import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/public/campaign_workflow_illustration.dart';

void main() {
  for (final width in [320.0, 390.0, 550.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets(
        'Business illustration agrees at $width px and ${scale}x text',
        (tester) async {
          await tester.binding.setSurfaceSize(Size(width, 900));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await tester.pumpWidget(
            MaterialApp(
              home: MediaQuery(
                data: MediaQueryData(textScaler: TextScaler.linear(scale)),
                child: const Scaffold(
                  body: SingleChildScrollView(
                    child: CampaignWorkflowIllustration(),
                  ),
                ),
              ),
            ),
          );
          expect(tester.takeException(), isNull);
          // Read the independently served Business-page copy, so a future edit
          // on either page cannot quietly create contradictory descriptions.
          final business = File(
            'web/marketing/businesses.html',
          ).readAsStringSync();
          final rows = RegExp(
            r'<div class="proof-row"><span>(.*?)</span><strong>(.*?)</strong></div>',
          ).allMatches(business).toList();
          expect(rows.length, 3);
          double previous = -1;
          for (final row in rows) {
            expect(find.text(row[1]!), findsOneWidget);
            expect(find.text(row[2]!), findsOneWidget);
            final top = tester.getTopLeft(find.text(row[1]!)).dy;
            expect(top, greaterThan(previous));
            previous = top;
          }
          final caption = RegExp(
            r'<figcaption>(.*?)</figcaption>',
          ).firstMatch(business)![1]!;
          expect(find.text(caption), findsOneWidget);
          expect(find.text('One connected campaign'), findsOneWidget);
          expect(find.byType(Image), findsNothing);
          // The authored diagram retains the SVG's proportions without a map
          // dependency, tile download or apparent evidence for a real location.
          final art = tester.getSize(find.byType(AspectRatio));
          expect(art.width / art.height, closeTo(360 / 160, .001));
          await tester.drag(
            find.byType(SingleChildScrollView),
            const Offset(0, -800),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
