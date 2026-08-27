import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final source = File(
    'lib/screens/business/landing_page_builder_screen.dart',
  ).readAsStringSync();

  test(
    'desktop preview uses the full funnel width and responsive composition',
    () {
      expect(source, contains('maxWidth: _mobile ? 390 : 1120'));
      expect(source, contains('constraints.maxWidth < 720'));
      expect(source, contains('_PreviewHero'));
      expect(source, contains('_PreviewValueSection'));
      expect(source, contains('_PreviewProcess'));
      expect(source, contains('_PreviewFaq'));
      expect(source, contains('_PreviewConversion'));
    },
  );

  test(
    'preview includes conversion fields, repeated CTA, and safe disclosure',
    () {
      for (final field in ['Name', 'Email or phone', 'How can we help?']) {
        expect(source, contains("'$field'"));
      }
      expect(
        source,
        contains('No obligation is created by sending a request.'),
      );
      expect(source, contains('Your details go to this Business.'));
      expect(source, contains('Submitting does not create a purchase'));
    },
  );

  test('four presets have distinct fallback palettes', () {
    for (final style in ['bold', 'friendly', 'premium']) {
      expect(source, contains("'$style' => const _LandingPreviewStyle"));
    }
    expect(RegExp(r'_LandingPreviewStyle\(').allMatches(source).length, 5);
  });

  test('preview retains a semantic identity without remote assets', () {
    expect(source, contains("label: 'Landing page preview'"));
    expect(source, isNot(contains('Image.network')));
    expect(source, isNot(contains('CachedNetworkImage')));
  });

  test('published page exposes an exact environment-safe share URL', () {
    expect(source, contains('AppEnvironmentConfig.publicBaseUrl.replace'));
    expect(source, contains("path: '/p/\$_slug'"));
    expect(source, contains("label: const Text('Copy exact link')"));
    expect(source, contains("label: const Text('Open public page')"));
    expect(source, contains("ClipboardData(text: url.toString())"));
    expect(source, contains("webOnlyWindowName: '_blank'"));
  });
}
