import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/platform_billing_service.dart';
import 'package:flutter_app/services/secure_function_service.dart';
import 'package:flutter_app/widgets/zone_intelligence_card.dart';

void main() {
  testWidgets('saved target remains visible while analysis is pending', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ZoneIntelligenceCard(
            zoneName: 'Zone 1',
            data: {
              'serviceAreaPointCount': 12,
              'analysisStatus': 'waiting',
              'homeCountStatus': 'pending',
              'status': 'unassigned',
            },
          ),
        ),
      ),
    );

    expect(find.text('Target saved ✓'), findsOneWidget);
    expect(find.text('Analyzing...'), findsOneWidget);
    expect(find.text('Not yet verified'), findsOneWidget);
    expect(find.text('Not assigned'), findsOneWidget);
    expect(find.textContaining('Walking Distance'), findsNothing);
    expect(find.textContaining('Recommended Pay'), findsNothing);
  });

  testWidgets('unavailable home analysis does not invalidate target', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: ZoneIntelligenceCard(
            zoneName: 'Zone 1',
            data: {
              'analysisStatus': 'geometry_complete',
              'homeCountStatus': 'unavailable',
              'estimatedWalkingMiles': 943.0,
              'estimatedMinutes': 20236,
              'suggestedBasePay': 8430.0,
            },
          ),
        ),
      ),
    );

    expect(find.text('Target saved ✓'), findsOneWidget);
    expect(find.text('Unavailable'), findsNWidgets(2));
    expect(find.textContaining('943'), findsNothing);
    expect(find.textContaining('8430'), findsNothing);
  });

  test('secure callable error preserves safe code and operation', () {
    const error = SecureFunctionError(
      code: 'failed-precondition',
      message: 'Campaign funding is unavailable.',
      operation: 'publishFundedCampaign',
    );
    expect(error.code, 'failed-precondition');
    expect(error.operation, 'publishFundedCampaign');
    expect(error.toString(), 'Campaign funding is unavailable.');
  });

  test('funding action is enabled only for the reviewed isolated boundary', () {
    expect(
      PlatformBillingService.authoritativeCampaignFundingAvailable,
      isTrue,
    );
  });

  test(
    'persistence returns before optional analysis and fake formulas are gone',
    () {
      final source = File(
        'lib/screens/business/campaign_area_screen.dart',
      ).readAsStringSync();
      final write = source.indexOf(
        'await widget.campaignReference.set(createData)',
      );
      final backgroundAnalysis = source.indexOf(
        'unawaited(_analyzeSavedZone())',
      );
      final leaveMap = source.indexOf(
        'Navigator.pop(context, true)',
        backgroundAnalysis,
      );

      expect(write, greaterThan(-1));
      expect(backgroundAnalysis, greaterThan(write));
      expect(leaveMap, greaterThan(backgroundAnalysis));
      expect(source, isNot(contains('_estimatedSweepSpacingMeters')));
      expect(source, isNot(contains('_walkingMetersPerMinute')));
      expect(source, isNot(contains('_preliminaryHourlyRate')));
      expect(source, isNot(contains('preliminary pay')));
      expect(
        source,
        contains('This target looks much larger than your flyer quantity.'),
      );
      expect(
        source,
        contains("'zoneAreaSquareMeters': metrics.areaSquareMeters"),
      );
      expect(source, contains("'zoneAreaAcres': metrics.areaAcres"));
    },
  );
}
