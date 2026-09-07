import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/campaign_card_header.dart';
import 'package:flutter_app/widgets/checkpoint_action.dart';

void main() {
  for (final platform in [TargetPlatform.iOS, TargetPlatform.android]) {
    for (final width in [320.0, 390.0]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          '$platform width $width text $scale keeps title and status readable',
          (tester) async {
            tester.view.physicalSize = Size(width, 850);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            const title = 'Neighborhood Summer Welcome Campaign';
            await tester.pumpWidget(
              MaterialApp(
                theme: ThemeData(platform: platform),
                home: MediaQuery(
                  data: MediaQueryData(
                    size: Size(width, 850),
                    textScaler: TextScaler.linear(scale),
                  ),
                  child: Scaffold(
                    bottomNavigationBar: const SizedBox(height: 64),
                    body: SafeArea(
                      child: SingleChildScrollView(
                        child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: CampaignCardHeader(
                            title: title,
                            icon: Icons.map,
                            businessName:
                                'A Long Business Name With Several Readable Words',
                            status: const Chip(label: Text('Business Review Pending')),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
            final titleRect = tester.getRect(find.text(title));
            final statusRect = tester.getRect(find.byType(Chip));
            expect(titleRect.width, greaterThan(width * .65));
            expect(statusRect.top, greaterThanOrEqualTo(titleRect.bottom));
            expect(titleRect.height, lessThan(200 * scale));
            expect(tester.takeException(), isNull);
            await tester.drag(
              find.byType(SingleChildScrollView),
              const Offset(0, -600),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  testWidgets('QA display alias leaves customer-authored names unchanged', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CampaignCardHeader(
            title: 'ANDROID_PHYSICAL_CERTIFICATION',
            icon: Icons.map,
          ),
        ),
      ),
    );
    expect(find.text('Android Physical Certification'), findsOneWidget);
    expect(find.text('ANDROID_PHYSICAL_CERTIFICATION'), findsNothing);
    expect(campaignDisplayName('ACME_Summer Special'), 'ACME_Summer Special');
  });

  for (final type in [
    'neighborhoodCanvassing',
    'flyer_distribution',
    'doorHangerDistribution',
    'cleanup',
    null,
  ]) {
    testWidgets('checkpoint presentation and action for $type', (tester) async {
      var calls = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CheckpointAction(jobType: type, onPressed: () => calls++),
          ),
        ),
      );
      final photos = type == 'cleanup';
      expect(
        find.byIcon(Icons.add_a_photo),
        photos ? findsOneWidget : findsNothing,
      );
      if (type != null && !photos) {
        expect(find.text('Add GPS Checkpoint'), findsOneWidget);
      }
      await tester.tap(find.byType(FilledButton));
      expect(calls, type == null ? 0 : 1);
      expect(tester.takeException(), isNull);
    });
  }
}
