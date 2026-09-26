import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign_planner.dart';
import 'package:flutter_app/models/campaign_card_compensation.dart';
import 'package:flutter_app/screens/business/campaign_planner_screen.dart';
import 'package:flutter_app/widgets/campaign_marketing_history.dart';

const area = [
  {'latitude': 39.0, 'longitude': -76.0},
  {'latitude': 39.01, 'longitude': -76.0},
  {'latitude': 39.01, 'longitude': -76.01},
];

class PlannerFixture {
  PlannerFixture({
    this.mode = 'own_team',
    this.hasArea = true,
    this.status = 'draft',
    this.warn = false,
    this.historyFails = false,
  });
  String mode, status;
  bool hasArea, warn, historyFails;
  int version = 1;
  final calls = <(String, Map<String, dynamic>)>[];
  Map<String, dynamic> get context => {
    'campaign': {
      'id': 'campaign1',
      'campaignName': 'Neighborhood outreach',
      'description': 'Distribute approved materials',
      'executionMode': mode,
      'campaignType': 'flyer_distribution',
      'status': status,
      'materialQuantity': 100,
      'basePay': 80,
      'bonus': 0,
      'startAt': DateTime.now()
          .add(const Duration(days: 2))
          .millisecondsSinceEpoch,
      'deadlineAt': DateTime.now()
          .add(const Duration(days: 2, hours: 4))
          .millisecondsSinceEpoch,
      if (hasArea) 'serviceArea': area,
    },
    'planningVersion': version,
    'editable': status == 'draft',
    'areaDigest': hasArea ? 'saved-area-digest' : null,
    'zones': hasArea
        ? [
            {'id': 'zoneA', 'zoneName': 'Zone A', 'serviceArea': area},
            {'id': 'zoneB', 'zoneName': 'Zone B', 'serviceArea': area},
          ]
        : [],
    'areaIntelligence': {
      'housingEstimate': 620,
      'housingEstimateLabel': 'Regional housing estimate',
      'eligibleDistributionPoints': null,
      'suggestedQuantity': null,
      'limitations': ['Includes housing outside this territory.'],
    },
  };
  Map<String, dynamic> get history => {
    'state': warn ? 'marketed_recently' : 'never_marketed',
    'warning': warn,
    'mostRecentCompletedAtMs': DateTime(2026, 3, 18).millisecondsSinceEpoch,
    'overlapPercent': null,
    'recent': warn
        ? [
            {
              'campaignId': 'prior',
              'campaignName': 'Spring door hangers',
              'campaignType': 'door_hanger_distribution',
              'completedAtMs': DateTime(2026, 3, 18).millisecondsSinceEpoch,
            },
          ]
        : [],
    'historical': [],
  };
  Future<Map<String, dynamic>> call(
    String operation,
    Map<String, dynamic> input,
  ) async {
    calls.add((operation, Map.of(input)));
    switch (operation) {
      case 'createCampaignPlan':
        mode = input['executionMode'].toString();
        return {'campaignId': 'campaign1', 'campaign': context['campaign']};
      case 'campaignPlanningContext':
        return context;
      case 'marketingAreaHistory':
        if (historyFails) throw StateError('unavailable');
        return history;
      case 'saveCampaignMaterials':
        version++;
        return context;
      case 'scheduleOwnTeamCampaign':
        status = 'own_team_scheduled';
        return context;
      case 'markMarketingComplete':
        return {'recorded': true, 'allComplete': false};
      default:
        throw StateError('Unexpected operation: $operation');
    }
  }
}

Future<void> load(WidgetTester tester, Widget widget) async {
  tester.view.physicalSize = const Size(1200, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: widget));
  await tester.pumpAndSettle();
}

Future<void> press(WidgetTester tester, String label) async {
  final target = find.text(label).last;
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pump(const Duration(milliseconds: 400));
  if (find.byType(LinearProgressIndicator).evaluate().isEmpty) {
    await tester.pumpAndSettle();
  }
}

void main() {
  test('regional housing counts cannot become material recommendations', () {
    const intel = CampaignMaterialIntelligence({
      'housingEstimate': 620,
      'suggestedQuantity': 650,
    });
    expect(intel.distributionPoints, isNull);
    expect(intel.suggestedQuantity, isNull);
    expect(intel.difference(600), isNull);
  });

  test(
    'server validated distribution points support a separate suggestion and shortage',
    () {
      const intel = CampaignMaterialIntelligence({
        'eligibleDistributionPoints': 620,
        'suggestedQuantity': 650,
      });
      expect(intel.distributionPoints, 620);
      expect(intel.suggestedQuantity, 650);
      expect(intel.difference(600), -50);
      expect(intel.difference(700), 50);
    },
  );

  test('own-team cards never imply worker pay', () {
    final presentation = CampaignCardCompensation.fromCampaign({
      'executionMode': 'own_team',
    });
    expect(presentation.primaryText, 'My Own Team');
    expect(presentation.isGroupCampaign, false);
  });

  testWidgets('new campaign captures intent before area and before materials', (
    tester,
  ) async {
    final fixture = PlannerFixture(hasArea: false);
    await load(tester, CampaignPlannerScreen(operation: fixture.call));
    expect(find.text('1  Campaign'), findsOneWidget);
    expect(find.text('2  Area'), findsOneWidget);
    expect(find.text('3  Materials'), findsOneWidget);
    expect(find.text('Your material quantity'), findsNothing);
    await tester.enterText(find.byType(TextField).at(0), 'New area campaign');
    await tester.enterText(find.byType(TextField).at(1), 'Promote our service');
    await press(tester, 'My Own Team');
    await press(tester, 'Continue to Area');
    final create = fixture.calls
        .firstWhere((v) => v.$1 == 'createCampaignPlan')
        .$2;
    expect(create['executionMode'], 'own_team');
    expect(create.containsKey('materialQuantity'), false);
    expect(create.containsKey('basePay'), false);
    expect(find.text('Choose your campaign area'), findsOneWidget);
    expect(find.text('4  Review & Schedule'), findsOneWidget);
    final continueButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Continue to Materials'),
    );
    expect(continueButton.onPressed, isNull);
  });

  testWidgets(
    'saved area feeds Materials and own-team scheduling without marketplace state',
    (tester) async {
      final fixture = PlannerFixture();
      await load(
        tester,
        CampaignPlannerScreen(campaignId: 'campaign1', operation: fixture.call),
      );
      await press(tester, 'Continue to Materials');
      expect(find.text('Regional housing estimate: 620'), findsOneWidget);
      expect(
        find.text('Eligible distribution points: not available'),
        findsOneWidget,
      );
      expect(find.text('Use suggested quantity'), findsNothing);
      expect(find.text('Scaler base pay (USD)'), findsNothing);
      expect(
        find.text('How will your team receive campaign materials?'),
        findsOneWidget,
      );
      await press(tester, 'Continue to Review & Schedule');
      final materials = fixture.calls
          .firstWhere((v) => v.$1 == 'saveCampaignMaterials')
          .$2;
      expect(materials['areaDigest'], 'saved-area-digest');
      expect(materials['expectedPlanningVersion'], 1);
      expect(materials['materialQuantity'], 100);
      expect(materials.containsKey('basePay'), false);
      await press(tester, 'Schedule My Own Team');
      final schedule = fixture.calls
          .firstWhere((v) => v.$1 == 'scheduleOwnTeamCampaign')
          .$2;
      expect(schedule['expectedPlanningVersion'], 2);
      expect(schedule['areaDigest'], 'saved-area-digest');
      expect(find.text('Mark Marketing Complete'), findsOneWidget);
      expect(
        fixture.calls.where((v) => v.$1 == 'markMarketingComplete'),
        isEmpty,
      );
      expect(find.text('Download / Print Map'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'marketplace follows saved materials into existing funding review',
    (tester) async {
      final fixture = PlannerFixture(mode: 'marketplace');
      String? reviewed;
      await load(
        tester,
        CampaignPlannerScreen(
          campaignId: 'campaign1',
          operation: fixture.call,
          openMarketplaceReview: (id) async {
            reviewed = id;
          },
        ),
      );
      await press(tester, 'Continue to Materials');
      expect(find.text('Scaler base pay (USD)'), findsOneWidget);
      await press(tester, 'Continue to Review & Fund');
      await press(tester, 'Review Marketplace Funding');
      expect(reviewed, 'campaign1');
      final materials = fixture.calls
          .firstWhere((v) => v.$1 == 'saveCampaignMaterials')
          .$2;
      expect(materials['basePay'], 80);
      expect(
        fixture.calls.where((v) => v.$1 == 'scheduleOwnTeamCampaign'),
        isEmpty,
      );
      expect(find.text('Mark Marketing Complete'), findsNothing);
    },
  );

  testWidgets(
    'recent overlap warns before materials but permits intentional repeat',
    (tester) async {
      final fixture = PlannerFixture(warn: true);
      await load(
        tester,
        CampaignPlannerScreen(campaignId: 'campaign1', operation: fixture.call),
      );
      expect(find.text("You've marketed this area recently"), findsOneWidget);
      expect(find.text('Last marketed: March 18, 2026'), findsOneWidget);
      expect(find.textContaining('% of this area'), findsNothing);
      await press(tester, 'Continue Anyway');
      expect(find.text('Materials and logistics'), findsOneWidget);
      expect(
        fixture.calls.where((v) => v.$1 == 'markMarketingComplete'),
        isEmpty,
      );
    },
  );

  testWidgets(
    'history failure stays truthful and does not prohibit repeat marketing',
    (tester) async {
      final fixture = PlannerFixture(historyFails: true);
      await load(
        tester,
        CampaignPlannerScreen(campaignId: 'campaign1', operation: fixture.call),
      );
      expect(
        find.textContaining('Marketing history is currently unavailable'),
        findsOneWidget,
      );
      expect(
        find.text('No completed marketing found for this area'),
        findsNothing,
      );
      await press(tester, 'Continue Anyway');
      expect(find.text('Materials and logistics'), findsOneWidget);
    },
  );

  testWidgets(
    'own-team partial completion requires explicit selected zones and confirmation',
    (tester) async {
      final fixture = PlannerFixture(status: 'own_team_scheduled');
      await load(
        tester,
        CampaignPlannerScreen(campaignId: 'campaign1', operation: fixture.call),
      );
      await press(tester, 'Mark Marketing Complete');
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Record Completion'),
      );
      expect(button.onPressed, isNull);
      await press(tester, 'Zone A');
      await press(
        tester,
        'I confirm our team completed marketing in the selected territory.',
      );
      await press(tester, 'Record Completion');
      final completion = fixture.calls
          .singleWhere((v) => v.$1 == 'markMarketingComplete')
          .$2;
      expect(completion['confirmed'], true);
      expect(completion['wholeTerritory'], false);
      expect(completion['zoneIds'], ['zoneA']);
      expect(completion.keys, isNot(contains('serviceArea')));
      expect(completion.keys, isNot(contains('fundingStatus')));
    },
  );

  testWidgets(
    'history shows computed percentage and multiple dated campaign records',
    (tester) async {
      final fixture = PlannerFixture(warn: true);
      final history = fixture.history;
      history['overlapPercent'] = 62.34;
      (history['recent'] as List).add({
        'campaignId': 'older',
        'campaignName': 'Older campaign',
        'completedAtMs': DateTime(2026, 2, 2).millisecondsSinceEpoch,
      });
      String? viewed;
      await load(
        tester,
        Scaffold(
          body: CampaignMarketingHistory(
            history: history,
            onViewCampaign: (id) => viewed = id,
            onChooseArea: () {},
            onContinue: () {},
          ),
        ),
      );
      expect(
        find.text(
          'Approximately 62.3% of this area was marketed within the last 12 months.',
        ),
        findsOneWidget,
      );
      await press(tester, 'View marketing history');
      expect(find.text('Spring door hangers'), findsOneWidget);
      expect(find.text('Older campaign'), findsOneWidget);
      await press(tester, 'View Previous Campaign');
      expect(viewed, 'prior');
    },
  );
}
