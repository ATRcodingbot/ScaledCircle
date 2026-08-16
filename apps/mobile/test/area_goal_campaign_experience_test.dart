import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign/campaign.dart';
import 'package:flutter_app/screens/business/create/create_campaign_screen.dart';
import 'package:flutter_app/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart';
import 'package:flutter_app/services/address_search_service.dart';
import 'package:flutter_app/services/opportunity_goal_service.dart';
import 'package:flutter_app/services/service_area_resolution_service.dart';

void main() {
  Map<String, dynamic> place({
    required String type,
    String city = '',
    String county = '',
    String postcode = '',
    bool withGeometry = true,
  }) => {
    'osm_type': 'relation',
    'osm_id': 123,
    'name': county.isNotEmpty
        ? county
        : city.isNotEmpty
        ? city
        : postcode,
    'type': type,
    'lat': '39.0',
    'lon': '-76.6',
    'display_name': [
      county,
      city,
      postcode,
      'Maryland',
    ].where((value) => value.isNotEmpty).join(', '),
    'address': {
      if (city.isNotEmpty) 'city': city,
      if (county.isNotEmpty) 'county': county,
      if (postcode.isNotEmpty) 'postcode': postcode,
      'state': 'Maryland',
    },
    'boundingbox': ['38.8', '39.2', '-76.8', '-76.4'],
    if (withGeometry)
      'geojson': {
        'type': 'Polygon',
        'coordinates': [
          [
            [-76.8, 38.8],
            [-76.4, 38.8],
            [-76.4, 39.2],
            [-76.8, 39.2],
          ],
        ],
      },
  };

  test('county, city, and ZIP results retain normalized boundaries', () {
    for (final raw in [
      place(type: 'administrative', county: 'Anne Arundel County'),
      place(type: 'city', city: 'Annapolis'),
      place(type: 'postcode', postcode: '21401'),
    ]) {
      final suggestion = AddressSearchService.parseSuggestion(raw)!;
      final resolution = const ServiceAreaResolutionService().fromKnownPlace(
        suggestion: suggestion,
        areaType: suggestion.placeType == 'postcode' ? 'postal_codes' : 'place',
      );
      expect(resolution.resolved, isTrue);
      expect(resolution.data['geometry'], hasLength(4));
      expect(resolution.data['resolutionSource'], 'openstreetmap_nominatim');
      expect(resolution.data['resolutionVersion'], 'ServiceAreaResolutionV1');
    }
  });

  test('unresolved place fails honestly without fabricated geometry', () {
    final suggestion = AddressSearchService.parseSuggestion(
      place(
        type: 'administrative',
        county: 'Unknown County',
        withGeometry: false,
      ),
    )!;
    final resolution = const ServiceAreaResolutionService().fromKnownPlace(
      suggestion: suggestion,
      areaType: 'place',
    );
    expect(resolution.resolved, isFalse);
    expect(resolution.data['geometry'], isEmpty);
  });

  test('radius choice automatically creates a normalized circle', () {
    final suggestion = AddressSearchService.parseSuggestion(
      place(type: 'city', city: 'Annapolis'),
    )!;
    final resolution = const ServiceAreaResolutionService().radius(
      center: suggestion,
      radiusMiles: 30,
    );
    expect(resolution.resolved, isTrue);
    expect(resolution.data['radiusMiles'], 30);
    expect(resolution.data['geometry'], hasLength(48));
  });

  test(
    'place resolution uses an explicit backend search with no client autocomplete',
    () {
      final service = File(
        'lib/services/address_search_service.dart',
      ).readAsStringSync();
      final field = File(
        'lib/widgets/mapped_address_field.dart',
      ).readAsStringSync();
      expect(service, contains("httpsCallable('resolveServiceAreaPlace')"));
      expect(service, isNot(contains('nominatim.openstreetmap.org')));
      expect(field, contains('onFieldSubmitted: (_) => _search()'));
      expect(field, contains('onPressed: widget.enabled ? _search : null'));
      expect(field, isNot(contains('Timer(')));
      expect(field, contains('© OpenStreetMap contributors • Nominatim'));
    },
  );

  test('Growth Profile services create relevant plain-language goals', () {
    final goals = OpportunityGoalService.suggestForServices([
      'Decks',
      'Fences',
      'HVAC system replacement',
      'Kitchen remodeling',
    ]);
    expect(goals.map((goal) => goal.label), contains('Get more deck jobs'));
    expect(goals.map((goal) => goal.label), contains('Get more fence jobs'));
    expect(
      goals.map((goal) => goal.label),
      contains('Get more hvac system replacement inquiries'),
    );
    expect(
      goals.map((goal) => goal.label),
      contains('Promote Kitchen remodeling'),
    );
  });

  testWidgets('real campaign catalog route opens the maintained flyer wizard', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: CreateCampaignScreen()));
    await tester.tap(find.text('Flyer Distribution'));
    await tester.pumpAndSettle();
    expect(find.byType(FlyerCampaignScreen), findsOneWidget);
    expect(find.text('Create Flyer Distribution'), findsOneWidget);
    await tester.drag(find.byType(ListView).last, const Offset(0, -5000));
    await tester.pumpAndSettle();
    expect(find.text('Create & Define Zones'), findsOneWidget);
    await tester.tap(find.text('Create & Define Zones'));
    await tester.pumpAndSettle();
    expect(find.text('Enter how many flyers you have.'), findsOneWidget);
  });

  testWidgets('actual catalog CTA opens the zone map exactly once', (
    tester,
  ) async {
    var draftCalls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: CreateCampaignScreen(
          flyerDraftAndAreaFlowOverride: (context) async {
            draftCalls += 1;
            await Navigator.push<void>(
              context,
              MaterialPageRoute(
                builder: (_) => const Scaffold(
                  body: SizedBox.expand(
                    key: Key('campaign-zone-map-workspace'),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
    await tester.tap(find.text('Flyer Distribution'));
    await tester.pumpAndSettle();

    Future<void> enter(String label, String value) async {
      await tester.scrollUntilVisible(
        find.text(label),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      final field = find.ancestor(
        of: find.text(label),
        matching: find.byType(TextFormField),
      );
      await tester.ensureVisible(field);
      await tester.enterText(field, value);
    }

    final fulfillment = find.text('Scaler picks up from my Business');
    await tester.scrollUntilVisible(
      fulfillment,
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(fulfillment);
    await tester.pumpAndSettle();
    await tester.tap(find.text('No physical materials required').last);
    await tester.pumpAndSettle();

    await enter('Campaign Name', 'Deck estimate flyers');
    await enter(
      'Description',
      'Distribute estimate flyers in the selected area.',
    );

    for (final label in [
      'Campaign Date',
      'Start Time',
      'Completion Deadline',
    ]) {
      final control = find.text(label);
      await tester.ensureVisible(control);
      await tester.tap(control);
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
    }

    await enter('Base Pay per Scaler (\$)', '125');

    final cta = find.text('Create & Define Zones');
    await tester.scrollUntilVisible(
      cta,
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -120));
    await tester.pumpAndSettle();
    await tester.tap(
      find.ancestor(of: cta, matching: find.byType(ElevatedButton)),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const Key('campaign-zone-map-workspace')),
      findsOneWidget,
    );
    expect(draftCalls, 1);
  });

  testWidgets('campaign handoff visibly reuses selected area and goal', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: FlyerCampaignScreen(
          campaignType: CampaignType.flyerDistribution.name,
          initialServiceAreaName: 'Main Service Area',
          initialGoal: 'Get more deck jobs',
          initialService: 'Decks',
          loadPreferences: () async => null,
          initialServiceArea: const [
            {'latitude': 39.0, 'longitude': -76.7},
            {'latitude': 39.1, 'longitude': -76.6},
            {'latitude': 39.0, 'longitude': -76.5},
          ],
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Starting with: Main Service Area'), findsOneWidget);
    final wizard = tester.widget<FlyerCampaignScreen>(
      find.byType(FlyerCampaignScreen),
    );
    expect(wizard.initialGoal, 'Get more deck jobs');
    expect(wizard.initialService, 'Decks');
    expect(
      find.textContaining('saved Service Area will not change'),
      findsOneWidget,
    );
  });
}
