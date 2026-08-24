import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('canonical brand assets and product naming are wired', () {
    const assets = [
      'assets/brand/source/scaledcircle-approved-artwork.png',
      'assets/brand/scaledcircle-symbol.png',
      'assets/brand/scaledcircle-lockup-dark-surface.png',
      'assets/brand/scaledcircle-lockup-light-surface.png',
      'assets/brand/scaledcircle-secondary-marketing-lockup.png',
      'web/favicon.png',
      'web/icons/Icon-192.png',
      'web/icons/Icon-512.png',
    ];
    for (final path in assets) {
      final bytes = File(path).readAsBytesSync();
      expect(bytes.length, greaterThan(8), reason: path);
      expect(bytes.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10]);
    }

    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('- assets/brand/'));
    final index = File('web/index.html').readAsStringSync();
    expect(index, isNot(contains('scaled-circle-mark.svg')));
    expect(index, contains('ScaledCircle'));
  });

  test('maintained brand widgets use approved assets, not drawn substitutes', () {
    final shared = File(
      'lib/widgets/scaled_circle_brand.dart',
    ).readAsStringSync();
    final public = File(
      'lib/screens/public/public_funnel_components.dart',
    ).readAsStringSync();
    final publicBrand = public.split('class PublicTopNavigation').first;
    for (final source in [shared, publicBrand]) {
      expect(source, contains('assets/brand/scaledcircle-'));
      expect(source, isNot(contains('BoxShape.circle')));
    }
  });
}
