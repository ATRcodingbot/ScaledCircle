import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';

void main() {
  final areaSource = File(
    'lib/screens/business/campaign_area_screen.dart',
  ).readAsStringSync();
  final zonesSource = File(
    'lib/screens/business/campaign_zones_screen.dart',
  ).readAsStringSync();

  test('production campaign permits bounded independent Scaler Zones', () {
    expect(campaignCanAddZone(0), isTrue);
    expect(campaignCanAddZone(1), isTrue);
    expect(campaignCanAddZone(12), isFalse);
    expect(productionMaximumZonesPerCampaign, 12);
  });

  test(
    'future reviewed rollout can expose distinct additional Zone records',
    () {
      expect(campaignCanAddZone(1, maximumZones: 3), isTrue);
      expect(campaignCanAddZone(3, maximumZones: 3), isFalse);
      expect(zonesSource, contains("zoneReference = _zonesCollection.doc()"));
    },
  );

  test('existing Zone never silently changes on a map tap or shape switch', () {
    expect(areaSource, contains("'\$_zoneName already has an area'"));
    expect(areaSource, contains("'Replace \$_zoneName'"));
    expect(areaSource, contains('_confirmReplaceExistingArea'));
    expect(areaSource, contains('unawaited(_changeShape(selection.first))'));
    expect(
      areaSource,
      contains('unawaited(_handleMapTap(tapPosition, point))'),
    );
  });

  test('one Zone document stores one customer polygon, not geometryParts', () {
    expect(areaSource, contains("'serviceArea': polygonPoints"));
    expect(areaSource, isNot(contains("'geometryParts':")));
    expect(
      areaSource,
      contains("await widget.campaignReference.set(createData)"),
    );
    expect(
      areaSource,
      contains("await widget.campaignReference.update(updateData)"),
    );
  });

  test('map and Campaign Zones communicate the one-assignment model', () {
    expect(areaSource, contains('Save Zone'));
    expect(areaSource, contains('Replace Area'));
    expect(areaSource, contains("const Text('Clear')"));
    expect(areaSource, contains("const Text('Cancel')"));
    expect(areaSource, isNot(contains("'\${entry.key + 1}'")));
    expect(
      zonesSource,
      contains('One Zone is one practical Scaler assignment area.'),
    );
    expect(
      zonesSource,
      contains('Scaler Crew and additional worker Zones are currently'),
    );
    expect(zonesSource, contains("const Text('Edit Zone')"));
    expect(zonesSource, contains("const Text('Remove')"));
  });
}
