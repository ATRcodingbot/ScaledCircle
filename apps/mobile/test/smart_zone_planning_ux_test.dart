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
      expect(source, contains('six-hour single-Scaler'));
      expect(source, contains('limit and validated again before funding'));
      expect(source, contains('Automatically split into workable Zones'));
      expect(source, contains('Auto-Fix'));
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
}
