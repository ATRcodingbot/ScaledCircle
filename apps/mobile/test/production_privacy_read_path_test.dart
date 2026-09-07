import 'dart:io';
import 'package:flutter_app/services/staging_qa_discovery.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Scaler campaign collection always uses the coarse projection', () {
    expect(scalerCampaignCollection, 'campaignDiscovery');
  });
  test(
    'assigned locations use authenticated server IDs and Rules listeners',
    () {
      final source = File(
        'lib/services/assigned_locations.dart',
      ).readAsStringSync();
      expect(source, contains("'listAssignedLocationIdsV1'"));
      expect(source, isNot(contains(".where('assignedScalerId'")));
      expect(source, contains('records.remove(id)'));
      expect(source, contains("error.code == 'permission-denied'"));
    },
  );
}
