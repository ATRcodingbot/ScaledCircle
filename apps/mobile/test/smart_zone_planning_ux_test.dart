import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

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
      expect(source, contains('not guaranteed completion times'));
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
}
