import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/preferences/areas_preferences_screen.dart';
import 'package:flutter_app/services/discovery_preferences_service.dart';

const _workTypes = [
  MarketplaceWorkType(
    id: 'flyer_distribution',
    customerLabel: 'Flyer Distribution',
    description: 'Distribute flyers locally.',
    scalerSelectable: true,
    requiresVehicle: false,
    requiresOutreachConsent: false,
  ),
];

Map<String, dynamic> _preferences() => {
  'areas': const <Map<String, dynamic>>[],
  'jobTypes': const ['flyer_distribution'],
  'travelMode': 'nearby',
  'maxTravelMiles': 20,
  'outreachOptIn': false,
  'crewOptIn': false,
  'notifications': <String, bool>{},
  'alertDelivery': <String, bool>{'inApp': true, 'email': false},
};

Future<void> _pumpAtSize(
  WidgetTester tester,
  Size size, {
  Future<Map<String, dynamic>> Function(Map<String, dynamic>)?
  completePreferences,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  await tester.pumpWidget(
    MaterialApp(
      home: AreasPreferencesScreen(
        role: 'scaler',
        onboarding: true,
        loadPreferences: () async => _preferences(),
        loadWorkTypes: () async => _workTypes,
        completePreferences: completePreferences ?? (payload) async => payload,
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(
    find.byKey(const ValueKey('other-work-interests-block')),
    400,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

void _expectSeparatedFormElements(WidgetTester tester) {
  final helper = tester.getRect(
    find.byKey(const ValueKey('other-work-interests-helper')),
  );
  final counter = tester.getRect(
    find.byKey(const ValueKey('other-work-interests-counter')),
  );
  final travel = tester.getRect(
    find.byKey(const ValueKey('travel-preference-block')),
  );

  expect(helper.bottom, lessThanOrEqualTo(counter.top));
  expect(counter.bottom + 20, lessThanOrEqualTo(travel.top));
  expect(tester.takeException(), isNull);
}

void main() {
  testWidgets('other-interest helper and counter are separated on desktop', (
    tester,
  ) async {
    Map<String, dynamic>? saved;
    await _pumpAtSize(
      tester,
      const Size(1280, 900),
      completePreferences: (payload) async {
        saved = payload;
        return payload;
      },
    );
    _expectSeparatedFormElements(tester);

    await tester.tap(find.byKey(const ValueKey('travel-preference-field')));
    await tester.pumpAndSettle();
    expect(find.text('Nearby only'), findsWidgets);
    await tester.tap(find.text('Nearby only').last);
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Save & Continue'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Save & Continue'));
    await tester.pumpAndSettle();
    expect(saved, isNotNull);
  });

  testWidgets('other-interest block remains overflow-free at 390px', (
    tester,
  ) async {
    await _pumpAtSize(tester, const Size(390, 844));
    _expectSeparatedFormElements(tester);

    expect(
      find.text(
        "Tell us about other work you'd be interested in as we add more job categories.",
      ),
      findsOneWidget,
    );
    expect(find.text('0 / 500'), findsOneWidget);
    expect(find.text('Nearby only'), findsOneWidget);
  });

  testWidgets('other-interest transition remains clean at tablet width', (
    tester,
  ) async {
    await _pumpAtSize(tester, const Size(768, 1024));
    _expectSeparatedFormElements(tester);
    expect(find.text('Nearby only'), findsOneWidget);
  });
}
