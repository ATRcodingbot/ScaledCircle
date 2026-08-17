// Permanent release regression for the production campaign-zone dead end.
//
// This deliberately crosses the actual catalog and Firebase boundary because
// an earlier isolated widget test passed while the real catalog route failed.
// Run through Firebase emulators with:
//   flutter test --platform chrome --dart-define=APP_ENV=local
//     --dart-define=RUN_FIREBASE_EMULATOR_INTEGRATION=true

import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_app/config/firebase_options_local.dart';
import 'package:flutter_app/screens/business/campaign_area_screen.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';
import 'package:flutter_app/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart';
import 'package:flutter_app/screens/business/create/create_campaign_screen.dart';
import 'package:flutter_app/screens/campaigns/campaign_details_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';

const _run = bool.fromEnvironment('RUN_FIREBASE_EMULATOR_INTEGRATION');
const _project = 'demo-scaledcircle';
const _host = '127.0.0.1';

Map<String, dynamic> _firestoreValue(Object? value) {
  if (value == null) return {'nullValue': null};
  if (value is bool) return {'booleanValue': value};
  if (value is int) return {'integerValue': value.toString()};
  if (value is double) return {'doubleValue': value};
  if (value is String) return {'stringValue': value};
  if (value is List) {
    return {
      'arrayValue': {
        'values': value.map(_firestoreValue).toList(growable: false),
      },
    };
  }
  if (value is Map) {
    return {
      'mapValue': {
        'fields': value.map(
          (key, item) => MapEntry(key.toString(), _firestoreValue(item)),
        ),
      },
    };
  }
  throw ArgumentError('Unsupported emulator fixture value: $value');
}

Future<void> _adminSeed(String path, Map<String, dynamic> data) async {
  final response = await http.patch(
    Uri.parse(
      'http://$_host:8080/v1/projects/$_project/databases/(default)/documents/$path',
    ),
    headers: const {
      'Authorization': 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'fields': data.map((key, value) => MapEntry(key, _firestoreValue(value))),
    }),
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw StateError('Fixture write failed (${response.statusCode}).');
  }
}

Future<void> _checkpoint(String value) => _adminSeed(
  'testDiagnostics/campaign-zone-flow',
  {'checkpoint': value, 'updatedAt': DateTime.now().toIso8601String()},
);

Future<void> _scrollTo(WidgetTester tester, Finder target) async {
  final flyerForm = find.byKey(const Key('flyer-campaign-form-scroll'));
  final campaignArea = find.byKey(const Key('campaign-area-scroll'));
  final scrollable = flyerForm.evaluate().isNotEmpty
      ? flyerForm
      : campaignArea.evaluate().isNotEmpty
      ? campaignArea
      : find.byType(Scrollable).first;
  for (final drag in const [Offset(0, -400), Offset(0, 400)]) {
    for (var attempt = 0; attempt < 20; attempt += 1) {
      if (target.evaluate().isNotEmpty) {
        await tester.ensureVisible(target);
        await tester.pump();
        return;
      }
      await tester.drag(scrollable, drag);
      await tester.pump();
    }
  }
  fail('Could not reveal the requested widget.');
}

Future<void> _pumpUi(
  WidgetTester tester, [
  Duration duration = const Duration(milliseconds: 500),
]) async {
  await tester.pump();
  await tester.pump(duration);
}

Future<void> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (finder.evaluate().isNotEmpty) return;
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  final visibleText = tester
      .widgetList<Text>(find.byType(Text))
      .map((text) => text.data)
      .whereType<String>()
      .where((text) => text.trim().isNotEmpty)
      .join('|');
  await _checkpoint('wait-timeout:$visibleText');
  fail('Timed out waiting for the expected route widget.');
}

Future<void> _enterLabeled(
  WidgetTester tester,
  String label,
  String value,
) async {
  try {
    final field = find.byWidgetPredicate(
      (widget) => widget is TextField && widget.decoration?.labelText == label,
      description: 'TextField labeled $label',
    );
    await _scrollTo(tester, field);
    expect(field, findsOneWidget);
    final editable = find.descendant(
      of: field,
      matching: find.byType(EditableText),
    );
    expect(editable, findsOneWidget);
    tester.testTextInput.register();
    await tester.tap(editable);
    await tester.showKeyboard(editable);
    tester.testTextInput.enterText(value);
    await tester.pump();
    expect(tester.widget<TextField>(field).controller?.text, value);
  } catch (error) {
    await _checkpoint('field-error:$label:$error');
    rethrow;
  }
}

Future<void> _acceptPicker(WidgetTester tester, String label) async {
  await _scrollTo(tester, find.text(label));
  await tester.tap(find.text(label));
  await _pumpUi(tester);
  await tester.tap(find.text('OK').last);
  await _pumpUi(tester);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    if (!_run) return;
    debugPrint('campaign-zone-emulator: initializing Firebase');
    final app = await Firebase.initializeApp(
      options: LocalFirebaseOptions.currentPlatform,
    ).timeout(const Duration(seconds: 20));
    debugPrint('campaign-zone-emulator: Firebase initialized');
    expect(app.options.projectId, _project);
    await FirebaseAuth.instance.useAuthEmulator(_host, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(_host, 8080);
    FirebaseFirestore.instance.settings = const Settings(
      persistenceEnabled: false,
    );
    debugPrint('campaign-zone-emulator: emulator delegates configured');
  });

  tearDownAll(() async {
    if (!_run) return;
    await FirebaseAuth.instance.signOut();
  });

  testWidgets(
    'catalog flyer campaign persists a zone and unlocks review through emulators',
    (tester) async {
      final suffix = DateTime.now().microsecondsSinceEpoch;
      final credential = await FirebaseAuth.instance
          .createUserWithEmailAndPassword(
            email: 'zone-business-$suffix@example.test',
            password: 'LocalTest123!',
          );
      final uid = credential.user!.uid;
      await _adminSeed('users/$uid', {
        'role': 'business',
        'accountType': 'business',
        'active': true,
        'betaAccess': 'approved',
      });
      const boundary = [
        {'latitude': 39.00, 'longitude': -76.62},
        {'latitude': 39.12, 'longitude': -76.50},
        {'latitude': 39.00, 'longitude': -76.38},
      ];
      await _adminSeed('discoveryPreferences/$uid', {
        'role': 'business',
        'geometryEncoding': 'map-parts-v1',
        'areas': [
          {
            'id': 'main-service-area',
            'name': 'Main Service Area',
            'type': 'county',
            'enabled': true,
            'primary': true,
            'geometryEncoding': 'map-parts-v1',
            'geometry': {'points': boundary},
            'geometryParts': [
              {'points': boundary},
            ],
          },
        ],
      });
      await _checkpoint('fixtures-seeded');

      await tester.pumpWidget(const MaterialApp(home: CreateCampaignScreen()));
      await _pumpUi(tester);
      await _checkpoint('catalog-visible');

      await tester.tap(find.text('Flyer Distribution'));
      await _pumpUi(tester);
      expect(find.byType(FlyerCampaignScreen), findsOneWidget);
      await _checkpoint('flyer-screen-visible');

      await tester.tap(find.text('Use a Service Area'));
      await _pumpUi(tester);
      await tester.tap(find.text('Main Service Area').last);
      await _pumpUi(tester);
      expect(find.text('Starting with: Main Service Area'), findsOneWidget);
      await _checkpoint('service-area-selected');

      await _enterLabeled(tester, 'Material Quantity', '500');
      await _checkpoint('quantity-entered');
      final fulfillment = find.text('Scaler picks up from my Business');
      await _scrollTo(tester, fulfillment);
      await tester.tap(fulfillment);
      await _pumpUi(tester);
      await tester.tap(find.text('No physical materials required').last);
      await _pumpUi(tester);
      await _checkpoint('materials-selected');
      await _enterLabeled(tester, 'Campaign Name', 'Emulator Flyer Campaign');
      await _checkpoint('name-entered');
      await _enterLabeled(
        tester,
        'Description',
        'Distribute test flyers inside the selected target.',
      );
      await _checkpoint('description-entered');
      await _acceptPicker(tester, 'Campaign Date');
      await _checkpoint('campaign-date-entered');
      await _acceptPicker(tester, 'Start Time');
      await _checkpoint('start-time-entered');
      await _acceptPicker(tester, 'Completion Deadline');
      await _checkpoint('deadline-entered');
      await _enterLabeled(tester, 'Base Pay per Scaler (\$)', '50');
      await _checkpoint('flyer-form-complete');

      await _scrollTo(tester, find.text('Create & Define Zones'));
      await _checkpoint('cta-visible');
      await tester.tap(find.text('Create & Define Zones'));
      await _checkpoint('cta-tapped');
      await _pumpUntil(tester, find.byType(CampaignZonesScreen));
      final routeTexts = tester
          .widgetList<Text>(find.byType(Text))
          .map((text) => text.data)
          .whereType<String>()
          .where((text) => text.trim().isNotEmpty)
          .join('|');
      await _checkpoint('after-cta:$routeTexts');

      expect(find.byType(CampaignZonesScreen), findsOneWidget);
      final campaigns = await FirebaseFirestore.instance
          .collection('campaigns')
          .where('businessId', isEqualTo: uid)
          .get();
      expect(campaigns.docs, hasLength(1));
      final campaignId = campaigns.docs.single.id;
      expect(find.text('Choose where this campaign will run'), findsOneWidget);
      final continueButton = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'Continue to Review & Launch'),
      );
      expect(continueButton.onPressed, isNull);

      await tester.tap(find.text('Choose Target Area'));
      await _pumpUntil(tester, find.byType(CampaignAreaScreen));
      await _checkpoint('map-route-visible');
      expect(find.byType(CampaignAreaScreen), findsOneWidget);
      final map = find.byKey(const Key('campaign-zone-map-workspace'));
      expect(map, findsOneWidget);
      final mapRect = tester.getRect(map);
      for (final fraction in const [
        Offset(0.35, 0.25),
        Offset(0.65, 0.25),
        Offset(0.50, 0.40),
      ]) {
        await tester.tapAt(
          Offset(
            mapRect.left + mapRect.width * fraction.dx,
            mapRect.top + mapRect.height * fraction.dy,
          ),
        );
        await _pumpUi(tester, const Duration(milliseconds: 250));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      await _checkpoint('map-points-entered');
      final saveZoneButton = find.widgetWithText(
        ElevatedButton,
        'Save Campaign Zone',
      );
      await _scrollTo(tester, saveZoneButton);
      await _checkpoint('zone-save-visible');
      final saveAction = tester
          .widget<ElevatedButton>(saveZoneButton)
          .onPressed;
      expect(saveAction, isNotNull);
      saveAction!();
      await tester.pump();
      await _checkpoint('zone-save-tapped');
      await _pumpUntil(
        tester,
        find.byType(CampaignZonesScreen),
        timeout: const Duration(seconds: 15),
      );
      await _checkpoint('zone-save-returned');

      expect(find.byType(CampaignZonesScreen), findsOneWidget);
      final zones = await FirebaseFirestore.instance
          .collection('campaignZones')
          .where('campaignId', isEqualTo: campaignId)
          .get();
      expect(zones.docs, hasLength(1));
      final zone = zones.docs.single.data();
      expect(zone['businessId'], uid);
      expect(zone['status'], 'unassigned');
      expect(zone['assignedScalerId'], isNull);
      expect((zone['serviceArea'] as List).length, greaterThanOrEqualTo(3));
      expect(zone['workerPoolCents'], isNull);
      expect(zone['assignedScalerEmail'], isNull);
      expect(zone['paymentStatus'], isNull);
      expect(zone['settlementStatus'], isNull);

      await _pumpUi(tester);
      expect(find.text('1'), findsWidgets);
      expect(find.text('Zones'), findsOneWidget);
      expect(find.text('Mapped'), findsOneWidget);
      expect(find.text('Assigned'), findsOneWidget);
      expect(find.text('Zone 1'), findsWidgets);
      final enabledContinue = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'Continue to Review & Launch'),
      );
      expect(enabledContinue.onPressed, isNotNull);
      await _checkpoint('stream-refreshed');

      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Continue to Review & Launch'),
      );
      await _pumpUntil(tester, find.byType(CampaignDetailsScreen));
      expect(find.byType(CampaignDetailsScreen), findsOneWidget);
      await _checkpoint('review-route-visible');
      expect(
        (await FirebaseFirestore.instance
                .collection('campaigns')
                .where('businessId', isEqualTo: uid)
                .get())
            .docs,
        hasLength(1),
      );
      expect(
        (await FirebaseFirestore.instance
                .collection('campaignZones')
                .where('campaignId', isEqualTo: campaignId)
                .get())
            .docs,
        hasLength(1),
      );

      final alternateApp = await Firebase.initializeApp(
        name: 'alternate-$suffix',
        options: LocalFirebaseOptions.currentPlatform,
      );
      final alternateAuth = FirebaseAuth.instanceFor(app: alternateApp);
      await alternateAuth.useAuthEmulator(_host, 9099);
      final alternateCredential = await alternateAuth
          .createUserWithEmailAndPassword(
            email: 'zone-other-$suffix@example.test',
            password: 'LocalTest123!',
          );
      final alternateUid = alternateCredential.user!.uid;
      await _adminSeed('users/$alternateUid', {
        'role': 'business',
        'accountType': 'business',
        'active': true,
        'betaAccess': 'approved',
      });
      final alternateStore = FirebaseFirestore.instanceFor(app: alternateApp);
      alternateStore.useFirestoreEmulator(_host, 8080);
      await expectLater(
        alternateStore.collection('campaignZones').add({
          ...zone,
          'businessId': alternateUid,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
          'serviceAreaUpdatedAt': FieldValue.serverTimestamp(),
        }),
        throwsA(isA<FirebaseException>()),
      );
      await _checkpoint('ownership-denial-proven');
      await alternateApp.delete();
    },
    skip: !_run,
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
