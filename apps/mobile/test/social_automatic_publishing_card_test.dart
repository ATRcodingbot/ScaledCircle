import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/social_automatic_publishing_card.dart';

void main() {
  testWidgets(
    'automatic publishing requires explicit reviewed confirmation and fits narrow large text',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final calls = <Map<String, dynamic>>[];
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: SocialAutomaticPublishingCard(
                  policy: null,
                  planId: 'plan',
                  invoke: (input) async {
                    calls.add(input);
                    return {
                      'businessName': 'Example Business',
                      'providers': ['facebook', 'instagram'],
                      'services': ['Decks'],
                      'voice': 'Helpful',
                      'destinations': ['https://example.com'],
                      'maxPerWeek': input['maxPerWeek'],
                      'timeZone': 'America/New_York',
                      'endsAt': 1900000000000,
                      'reviewDigest': 'exact',
                    };
                  },
                  onChanged: () async {},
                ),
              ),
            ),
          ),
        ),
      );
      expect(tester.widget<TextFormField>(find.byType(TextFormField)).initialValue, '5');
      await tester.enterText(find.byType(TextFormField), '14');
      await tester.ensureVisible(find.text('Review & Authorize Strategy'));
      await tester.tap(find.text('Review & Authorize Strategy'));
      await tester.pumpAndSettle();
      expect(calls.length, 1);
      expect(calls.single['action'], 'preview');
      expect(calls.single['maxPerWeek'], 14);
      expect((calls.single['cadenceSettings'] as Map)['mode'], 'fixed');
      expect(
        find.textContaining('you do not need', findRichText: true),
        findsNothing,
      );
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Authorize automatic publishing'),
      );
      await tester.tap(
        find.widgetWithText(FilledButton, 'Authorize automatic publishing'),
      );
      await tester.pumpAndSettle();
      expect(calls.last['action'], 'enable');
      expect(calls.last['reviewDigest'], 'exact');
      expect(calls.last['confirmAutomaticPublishing'], true);
      expect(tester.takeException(), isNull);
    },
  );
}
