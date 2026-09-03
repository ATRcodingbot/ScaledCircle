import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/campaign/zone_display_identity.dart';
import 'package:flutter_app/widgets/smart_zone_geometry_map.dart';
import 'package:latlong2/latlong.dart';

void main() {
  test(
    'Smart Zone planning is the preferred flow and manual mapping is advanced',
    () {
      final source = File(
        'lib/screens/business/campaign_zones_screen.dart',
      ).readAsStringSync();

      expect(source, contains('Recommend Workable Zones'));
      expect(source, contains('Use Recommended Zones'));
      expect(source, contains('Advanced Edit'));
      expect(source, contains('estimated total hours'));
      expect(source, contains('Scaler compensation recommendation'));
      expect(source, contains('Recommended base payout'));
      expect(source, contains('Estimated effective compensation'));
      expect(source, contains('Optional completion incentive'));
      expect(source, contains('Optional quality incentive'));
      expect(source, contains('Potential recommended payout'));
      expect(source, contains('Below ScaledCircle recommended compensation'));
      expect(source, contains('Use Recommended Pay'));
      expect(source, contains("'useRecommendedPay': useRecommendedPay"));
      expect(source, contains('Campaign compensation remains fixed-price'));
      expect(source, contains('not an employment'));
      expect(source, contains('not guaranteed completion times'));
      expect(source, contains('six-hour single-Scaler'));
      expect(source, contains('limit and validated again before funding'));
      expect(source, contains('Automatically split into workable Zones'));
      expect(source, contains('Auto-Fix'));
      expect(source, contains('Search neighborhood, address or ZIP'));
      expect(source, contains('No saved Service Area is required.'));
      expect(source, contains("'areaSelection':"));
      expect(source, contains("'resultId': selectedArea.id"));
      expect(source, contains('Large campaigns are split into Zones'));
      expect(source, contains('Use \${widget.savedAreaName}'));
      expect(source, contains('Finding future opportunities is separate'));
      expect(source, isNot(contains('AI neighborhood')));
      expect(
        source,
        isNot(contains("label: const Text('Draw Custom Target')")),
      );
    },
  );

  test('Smart Zone UI has clear analysis recovery language', () {
    final source = File(
      'lib/screens/business/campaign_zones_screen.dart',
    ).readAsStringSync();
    expect(source, contains("We couldn't analyze this area yet."));
    expect(source, contains('Try a smaller area or use Advanced Edit'));
  });

  test(
    'authoritative Zone geometry is parsed without frontend approximation',
    () {
      final points = smartZonePoints(const [
        {'latitude': 38.97, 'longitude': -76.50},
        {'lat': 38.98, 'lng': -76.49},
        {'latitude': 38.96, 'longitude': -76.48},
      ]);
      expect(points, hasLength(3));
      expect(points.first.latitude, 38.97);
      expect(points.first.longitude, -76.50);
      expect(
        smartZonePoints(const [
          {'lat': 'invalid'},
        ]),
        isEmpty,
      );
    },
  );

  test('Zone visual identity scales from one to large multi-Zone plans', () {
    expect(smartZoneLabelStrategy(1), 'numbered_polygon_labels');
    expect(smartZoneLabelStrategy(2), 'numbered_polygon_labels');
    expect(smartZoneLabelStrategy(5), 'numbered_polygon_labels');
    expect(smartZoneLabelStrategy(10), 'numbered_polygon_labels');
    expect(
      smartZoneLabelStrategy(17),
      'numbered_centroid_markers_and_selectable_list',
    );
    expect(smartZoneColor(0), smartZoneColor(6));
    expect(smartZoneColor(0), isNot(smartZoneColor(1)));
  });

  test('canonical identity follows authoritative names, not list position', () {
    final identities = resolveZoneDisplayIdentities(const [
      {'zoneId': 'zone-b', 'zoneName': 'Zone 2'},
      {'zoneId': 'zone-a', 'zoneName': 'Zone 1'},
    ]);
    expect(identities[0].ordinal, 2);
    expect(identities[0].label, 'Zone 2');
    expect(identities[0].styleKey, 2);
    expect(identities[1].ordinal, 1);
    expect(identities[1].label, 'Zone 1');
    expect(identities[1].styleKey, 1);
  });

  test('explicit plan order overrides a contradictory legacy numeric name', () {
    final identity = resolveZoneDisplayIdentities(const [
      {'zoneId': 'zone-a', 'zoneNumber': 1, 'zoneName': 'Zone 2'},
    ]).single;
    expect(identity.ordinal, 1);
    expect(identity.label, 'Zone 1');
  });

  test('legacy fallback is deterministic across query order changes', () {
    const firstLoad = <Map<String, dynamic>>[
      {'zoneId': 'zone-b'},
      {'zoneId': 'zone-a'},
    ];
    const secondLoad = <Map<String, dynamic>>[
      {'zoneId': 'zone-a'},
      {'zoneId': 'zone-b'},
    ];
    Map<String, int> byId(
      List<Map<String, dynamic>> zones,
      List<ZoneDisplayIdentity> identities,
    ) => {
      for (var index = 0; index < zones.length; index++)
        zones[index]['zoneId']! as String: identities[index].ordinal,
    };
    expect(
      byId(firstLoad, resolveZoneDisplayIdentities(firstLoad)),
      byId(secondLoad, resolveZoneDisplayIdentities(secondLoad)),
    );
  });

  test('Scaler keeps an assigned persisted Zone ordinal', () {
    final identity = resolveSingleZoneDisplayIdentity(const {
      'zoneId': 'assigned-zone',
      'zoneName': 'Zone 7',
    });
    expect(identity.ordinal, 7);
    expect(identity.label, 'Zone 7');
  });

  test('legacy custom names remain visible with a deterministic ordinal', () {
    final identities = resolveZoneDisplayIdentities(const [
      {'zoneId': 'south', 'zoneName': 'South Waterfront'},
      {'zoneId': 'north'},
    ]);
    final byId = {
      for (final identity in identities) identity.authoritativeId: identity,
    };
    expect(byId['south']!.label, 'South Waterfront');
    expect(byId['north']!.label, startsWith('Zone '));
    expect(
      identities.map((identity) => identity.ordinal).toSet(),
      hasLength(2),
    );
  });

  test('colliding Zone centroids receive distinct visual offsets', () {
    final geometry = <LatLng>[
      const LatLng(38.970, -76.510),
      const LatLng(38.975, -76.500),
      const LatLng(38.965, -76.500),
    ];
    final offsets = smartZoneMarkerOffsets([geometry, geometry]);
    expect(offsets, hasLength(2));
    expect(offsets.first, isNot(Offset.zero));
    expect(offsets.last, isNot(offsets.first));
  });

  test('well-separated Zone centroids remain centered', () {
    final offsets = smartZoneMarkerOffsets([
      const [
        LatLng(38.970, -76.540),
        LatLng(38.975, -76.530),
        LatLng(38.965, -76.530),
      ],
      const [
        LatLng(38.970, -76.480),
        LatLng(38.975, -76.470),
        LatLng(38.965, -76.470),
      ],
    ]);
    expect(offsets, everyElement(Offset.zero));
  });

  for (final viewport in <({String name, Size size})>[
    (name: 'desktop', size: Size(1200, 900)),
    (name: 'mobile', size: Size(390, 844)),
  ]) {
    testWidgets('two authoritative Zones render at ${viewport.name} size', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(viewport.size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final zones = <Map<String, dynamic>>[
        {
          'zoneName': 'Zone 1',
          'geometry': const [
            {'lat': 38.970, 'lng': -76.510},
            {'lat': 38.975, 'lng': -76.500},
            {'lat': 38.965, 'lng': -76.500},
          ],
        },
        {
          'zoneName': 'Zone 2',
          'geometry': const [
            {'lat': 38.975, 'lng': -76.500},
            {'lat': 38.980, 'lng': -76.490},
            {'lat': 38.970, 'lng': -76.490},
          ],
        },
      ];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SmartZoneGeometryMap(
              zones: zones,
              selectedTerritory: smartZonePoints(const [
                {'lat': 38.960, 'lng': -76.515},
                {'lat': 38.985, 'lng': -76.515},
                {'lat': 38.985, 'lng': -76.485},
                {'lat': 38.960, 'lng': -76.485},
              ]),
              mapKey: const Key('responsive-zone-map'),
              showZoneSelector: true,
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.byKey(const Key('responsive-zone-map')), findsOneWidget);
      expect(find.text('1'), findsNWidgets(2));
      expect(find.text('2'), findsNWidgets(2));
      expect(find.byKey(const Key('smart-zone-card-0')), findsOneWidget);
      expect(find.byKey(const Key('smart-zone-card-1')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  for (final zoneCount in [1, 2, 5, 10, 17]) {
    testWidgets('$zoneCount authoritative Zones render and fit together', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(1200, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final zones = List<Map<String, dynamic>>.generate(zoneCount, (index) {
        final longitude = -76.52 + (index * 0.004);
        return {
          'zoneId': 'zone-${index + 1}',
          'zoneNumber': index + 1,
          'zoneName': 'Zone ${index + 1}',
          'geometry': [
            {'lat': 38.970, 'lng': longitude},
            {'lat': 38.974, 'lng': longitude + 0.003},
            {'lat': 38.966, 'lng': longitude + 0.003},
          ],
        };
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SmartZoneGeometryMap(
              zones: zones,
              mapKey: Key('zone-count-map-$zoneCount'),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.byKey(Key('zone-count-map-$zoneCount')), findsOneWidget);
      for (var index = 0; index < zoneCount; index++) {
        expect(find.byKey(Key('smart-zone-marker-$index')), findsOneWidget);
      }
      final identities = resolveZoneDisplayIdentities(zones);
      expect(
        identities.map((identity) => identity.ordinal).toSet(),
        hasLength(zoneCount),
      );
      expect(identities.map((identity) => identity.label), [
        for (var ordinal = 1; ordinal <= zoneCount; ordinal++) 'Zone $ordinal',
      ]);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('reordered two-Zone fixture never renders crossed identities', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SmartZoneGeometryMap(
            zones: const [
              {
                'zoneId': 'zone-b',
                'zoneName': 'Zone 2',
                'serviceArea': [
                  {'lat': 38.975, 'lng': -76.500},
                  {'lat': 38.980, 'lng': -76.490},
                  {'lat': 38.970, 'lng': -76.490},
                ],
              },
              {
                'zoneId': 'zone-a',
                'zoneName': 'Zone 1',
                'serviceArea': [
                  {'lat': 38.970, 'lng': -76.510},
                  {'lat': 38.975, 'lng': -76.500},
                  {'lat': 38.965, 'lng': -76.500},
                ],
              },
            ],
            showZoneSelector: true,
          ),
        ),
      ),
    );
    await tester.pump();
    final zoneTwoChip = tester.widget<ChoiceChip>(
      find.byKey(const Key('smart-zone-card-0')),
    );
    final zoneOneChip = tester.widget<ChoiceChip>(
      find.byKey(const Key('smart-zone-card-1')),
    );
    expect(((zoneTwoChip.avatar! as CircleAvatar).child! as Text).data, '2');
    expect((zoneTwoChip.label as Text).data, 'Zone 2');
    expect(((zoneOneChip.avatar! as CircleAvatar).child! as Text).data, '1');
    expect((zoneOneChip.label as Text).data, 'Zone 1');
    expect(find.text('1'), findsNWidgets(2));
    expect(find.text('2'), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('map Zone selection reports the authoritative Zone index', (
    tester,
  ) async {
    int? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SmartZoneGeometryMap(
            zones: const [
              {
                'geometry': [
                  {'lat': 38.970, 'lng': -76.510},
                  {'lat': 38.975, 'lng': -76.500},
                  {'lat': 38.965, 'lng': -76.500},
                ],
              },
              {
                'geometry': [
                  {'lat': 38.975, 'lng': -76.500},
                  {'lat': 38.980, 'lng': -76.490},
                  {'lat': 38.970, 'lng': -76.490},
                ],
              },
            ],
            onZoneSelected: (index) => selected = index,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('smart-zone-marker-1')));
    await tester.pump();
    expect(selected, 1);
  });

  testWidgets('Zone selector card reports and highlights its Zone', (
    tester,
  ) async {
    int? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SmartZoneGeometryMap(
            zones: const [
              {
                'zoneName': 'Zone 1',
                'geometry': [
                  {'lat': 38.970, 'lng': -76.510},
                  {'lat': 38.975, 'lng': -76.500},
                  {'lat': 38.965, 'lng': -76.500},
                ],
              },
              {
                'zoneName': 'Zone 2',
                'geometry': [
                  {'lat': 38.975, 'lng': -76.500},
                  {'lat': 38.980, 'lng': -76.490},
                  {'lat': 38.970, 'lng': -76.490},
                ],
              },
            ],
            showZoneSelector: true,
            onZoneSelected: (index) => selected = index,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('smart-zone-card-1')));
    await tester.pump();
    expect(selected, 1);
    final chip = tester.widget<ChoiceChip>(
      find.byKey(const Key('smart-zone-card-1')),
    );
    expect(chip.selected, isTrue);
  });

  test('recommendation and persisted screens use the same canonical map', () {
    final source = File(
      'lib/screens/business/campaign_zones_screen.dart',
    ).readAsStringSync();
    final mapSource = File(
      'lib/widgets/smart_zone_geometry_map.dart',
    ).readAsStringSync();
    expect(source, contains("Key('recommended-smart-zone-map')"));
    expect(source, contains("Key('applied-smart-zone-map')"));
    expect(mapSource, contains("zone['geometry'] ?? zone['serviceArea']"));
    expect(source, contains('onZoneSelected'));
    expect(source, contains('selectedZoneIndex'));
    expect(source, contains('Dashed outline: selected campaign territory'));
    expect(mapSource, contains('CameraFit.bounds'));
    expect(mapSource, contains('LatLngBounds.fromPoints(operationalPoints)'));
    expect(mapSource, isNot(contains('LatLngBounds.fromPoints(allPoints)')));
    expect(mapSource, contains('cameraPadding'));
    expect(mapSource, contains('smartZoneMarkerOffsets'));
    expect(source, contains('showZoneSelector: true'));
    expect(mapSource, contains('© OpenStreetMap contributors'));
    expect(mapSource, contains('Dashed: selected territory'));
    expect(mapSource, contains('constraints.maxWidth < 520 ? 300.0 : 360.0'));
    expect(mapSource, contains('InteractiveFlag.all'));
  });

  test('Scaler map remains scoped to the assigned Zone', () {
    final source = File(
      'lib/screens/scaler/campaigns/scaler_campaign_details_screen.dart',
    ).readAsStringSync();
    expect(source, contains('_buildCampaignMap'));
    expect(source, contains('zone["serviceArea"]'));
    expect(source, isNot(contains('selectedTerritory')));
  });

  test('campaign publishing removes raw Exception prefixes', () {
    for (final path in [
      'lib/screens/business/create_campaign_screen.dart',
      'lib/screens/campaigns/campaign_details_screen.dart',
    ]) {
      final source = File(path).readAsStringSync();
      expect(source, contains("replaceFirst('Exception: ', '')"));
      expect(
        source,
        isNot(contains("Text('Unable to publish campaign: \$e')")),
      );
    }
  });
}
