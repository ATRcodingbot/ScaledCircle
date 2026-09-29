import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/business_profile_completion.dart';
import 'package:flutter_app/widgets/mapped_address_field.dart';
import 'package:flutter_app/services/address_search_service.dart';

Map<String, dynamic> status({
  bool complete = false,
  bool edit = true,
  String business = 'business',
}) => {
  'actorUid': 'owner',
  'businessId': business,
  'profileCompletion': {
    'businessId': business,
    'complete': complete,
    'canEdit': edit,
    'missingFields': ['serviceAreas'],
  },
};
Widget app(Widget child) => MaterialApp(
  home: Scaffold(body: SingleChildScrollView(child: child)),
);
void main() {
  testWidgets(
    'confirmed incomplete, owner edit, save refresh, explicit continuation preserves child',
    (t) async {
      var complete = false;
      var edits = 0;
      await t.pumpWidget(
        app(
          BusinessProfileCompletion(
            actorUid: 'owner',
            businessId: 'business',
            load: () async => status(complete: complete),
            edit: () async {
              edits++;
              complete = true;
            },
            child: const Text('Original campaign destination'),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Complete your business profile'), findsOneWidget);
      expect(find.textContaining('Service locations'), findsOneWidget);
      await t.tap(find.text('Complete profile'));
      await t.pumpAndSettle();
      expect(edits, 1);
      expect(find.text('Complete your business profile'), findsNothing);
      expect(find.text('Original campaign destination'), findsNothing);
      await t.tap(find.text('Continue to campaign'));
      await t.pumpAndSettle();
      expect(find.text('Original campaign destination'), findsOneWidget);
    },
  );
  testWidgets('complete profile hides banner; member lacks edit action', (
    t,
  ) async {
    await t.pumpWidget(
      app(
        BusinessProfileCompletion(
          actorUid: 'owner',
          businessId: 'business',
          load: () async => status(complete: true),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Complete your business profile'), findsNothing);
    await t.pumpWidget(
      app(
        BusinessProfileCompletion(
          key: const Key('member'),
          actorUid: 'owner',
          businessId: 'business',
          load: () async => status(edit: false),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Complete profile'), findsNothing);
    expect(
      find.text('Ask your Business owner to complete the profile.'),
      findsOneWidget,
    );
  });
  testWidgets('pending/error/wrong workspace are neutral, retry recovers', (
    t,
  ) async {
    final pending = Completer<Map<String, dynamic>>();
    var calls = 0;
    await t.pumpWidget(
      app(
        BusinessProfileCompletion(
          actorUid: 'owner',
          businessId: 'business',
          load: () {
            calls++;
            return calls == 1 ? pending.future : Future.value(status());
          },
        ),
      ),
    );
    expect(find.text('Checking business profile…'), findsOneWidget);
    expect(find.text('Complete profile'), findsNothing);
    pending.complete(status(business: 'other'));
    await t.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Complete profile'), findsNothing);
    await t.tap(find.text('Retry'));
    await t.pumpAndSettle();
    expect(find.text('Complete profile'), findsOneWidget);
  });
  testWidgets('late response from prior workspace cannot restore banner', (
    t,
  ) async {
    final pending = Completer<Map<String, dynamic>>();
    await t.pumpWidget(
      app(
        BusinessProfileCompletion(
          actorUid: 'owner',
          businessId: 'business',
          load: () => pending.future,
        ),
      ),
    );
    await t.pumpWidget(
      app(
        BusinessProfileCompletion(
          actorUid: 'owner',
          businessId: 'new',
          load: () async => status(complete: true, business: 'new'),
        ),
      ),
    );
    await t.pumpAndSettle();
    pending.complete(status());
    await t.pumpAndSettle();
    expect(find.text('Complete your business profile'), findsNothing);
  });
  testWidgets('narrow 2x text keeps edit reachable without overflow', (
    t,
  ) async {
    await t.binding.setSurfaceSize(const Size(320, 800));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: BusinessProfileCompletion(
                actorUid: 'owner',
                businessId: 'business',
                load: () async => status(),
              ),
            ),
          ),
        ),
      ),
    );
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Complete profile'));
    expect(t.takeException(), isNull);
  });
  testWidgets(
    'location edits invalidate pending results; Enter and icon distinguish unavailable from empty',
    (t) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);
      final pending = Completer<List<AddressSuggestion>>();
      var calls = 0;
      AddressSuggestion? selected;
      await t.pumpWidget(
        app(
          MappedAddressField(
            controller: controller,
            labelText: 'Business base',
            locationOnly: true,
            onSelected: (v) => selected = v,
            searchAddresses: (q) {
              calls++;
              if (calls == 1) return pending.future;
              if (calls == 2) throw StateError('provider');
              return Future.value([]);
            },
          ),
        ),
      );
      await t.enterText(find.byType(TextFormField), ' 21061 ');
      await t.testTextInput.receiveAction(TextInputAction.search);
      await t.pump();
      expect(find.text('Looking up this location…'), findsOneWidget);
      await t.enterText(find.byType(TextFormField), '02108');
      pending.complete([
        AddressSearchService.parseSuggestion({
          'id': 'census-zcta-21061',
          'fullAddress': '21061, Maryland',
          'latitude': 39.1,
          'longitude': -76.6,
          'geometry': [
            {'latitude': 39.0, 'longitude': -76.6},
            {'latitude': 39.1, 'longitude': -76.6},
            {'latitude': 39.1, 'longitude': -76.5},
          ],
        })!,
      ]);
      await t.pumpAndSettle();
      expect(selected, isNull);
      expect(controller.text, '02108');
      await t.tap(find.byTooltip('Search map'));
      await t.pumpAndSettle();
      expect(
        find.text(
          'We couldn’t look up this location right now. Please try again.',
        ),
        findsOneWidget,
      );
      expect(controller.text, '02108');
      await t.tap(find.text('Try Again'));
      await t.pumpAndSettle();
      expect(
        find.text(
          'We couldn’t find that city or ZIP. Check the location and try again.',
        ),
        findsOneWidget,
      );
      expect(controller.text, '02108');
    },
  );

  testWidgets(
    'campaign prerequisite scrolls at narrow 2x text with keyboard space',
    (t) async {
      await t.binding.setSurfaceSize(const Size(320, 400));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: BusinessProfileCompletion(
                actorUid: 'owner',
                businessId: 'business',
                load: () async => status(),
                child: const Text('Campaign types'),
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('Complete profile'));
      expect(t.takeException(), isNull);
    },
  );
}
