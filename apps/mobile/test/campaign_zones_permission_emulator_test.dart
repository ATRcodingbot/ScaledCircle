// Run against Auth + Firestore emulators with maintained production Rules.
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_app/config/firebase_options_local.dart';
import 'package:flutter_app/screens/business/campaign_area_screen.dart';
import 'package:flutter_app/screens/business/campaign_zones_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';

import 'support/firebase_web_emulator_bootstrap.dart';

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
  final response = await http
      .patch(
        Uri.parse(
          'http://$_host:8080/v1/projects/$_project/databases/(default)/documents/$path',
        ),
        headers: const {
          'Authorization': 'Bearer owner',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'fields': data.map(
            (key, value) => MapEntry(key, _firestoreValue(value)),
          ),
        }),
      )
      .timeout(const Duration(seconds: 10));
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw StateError('Fixture write failed (${response.statusCode}).');
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    if (!_run) return;
    registerWebPluginsForIntegrationTest();
    configureWebAuthEmulator(appName: '[DEFAULT]', host: _host, port: 9099);
    debugPrint('campaign-zone-emulator: initializing Firebase');
    final app = await Firebase.initializeApp(
      options: LocalFirebaseOptions.currentPlatform,
    ).timeout(const Duration(seconds: 20));
    debugPrint('campaign-zone-emulator: Firebase initialized');
    expect(app.options.projectId, _project);
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
    'tenant-bound draft map loads, preserves analyzed area and safely denies revoked access',
    (tester) async {
      final suffix = DateTime.now().microsecondsSinceEpoch;
      final user = (await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: 'map-owner-$suffix@example.test',
        password: 'LocalTest123!',
      )).user!;
      final uid = user.uid;
      await _adminSeed('users/$uid', {'role': 'business', 'active': true});
      const boundary = [
        {'latitude': 39.0, 'longitude': -76.0},
        {'latitude': 39.001, 'longitude': -76.0},
        {'latitude': 39.0, 'longitude': -75.999},
      ];
      final campaignId = 'map-$suffix';
      await _adminSeed('campaigns/$campaignId', {
        'businessId': uid,
        'status': 'draft',
        'campaignName': 'Analyzed target',
        'serviceArea': boundary,
        'propertyIntelligenceAnalysisId': 'analysis-$suffix',
      });
      final campaign = await FirebaseFirestore.instance
          .collection('campaigns')
          .doc(campaignId)
          .get();
      await tester.pumpWidget(
        MaterialApp(home: CampaignZonesScreen(campaign: campaign)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Use Analyzed Area'), findsOneWidget);
      expect(find.textContaining('permission-denied'), findsNothing);
      final continueButton = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'Continue to Review & Launch'),
      );
      expect(continueButton.onPressed, isNull);
      await tester.ensureVisible(find.text('Use Analyzed Area'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use Analyzed Area'));
      await tester.pumpAndSettle();
      final area = tester.widget<CampaignAreaScreen>(
        find.byType(CampaignAreaScreen),
      );
      expect(area.searchBoundary, boundary);
      expect(area.initialArea, boundary);
      expect(find.text('Polygon • 3 verification points'), findsOneWidget);
      expect(find.textContaining('The saved area could not be loaded'), findsNothing);
      expect(area.pendingZoneData?['businessId'], uid);
      expect(area.pendingZoneData?['campaignId'], campaignId);
      expect(
        (await FirebaseFirestore.instance
                .collection('campaignZones')
                .where('businessId', isEqualTo: uid)
                .where('campaignId', isEqualTo: campaignId)
                .get())
            .docs,
        isEmpty,
      );
      // Manual drawing is distinct: it starts empty inside the same boundary.
      await tester.ensureVisible(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Advanced Edit'));
      await tester.tap(find.text('Advanced Edit'));
      await tester.pumpAndSettle();
      final manual = tester.widget<CampaignAreaScreen>(
        find.byType(CampaignAreaScreen),
      );
      expect(manual.initialArea, isEmpty);
      expect(manual.searchBoundary, boundary);
      expect(find.text('Polygon • 0 verification points'), findsOneWidget);
      // A retained route must lose access when the account is no longer approved.
      await tester.pumpWidget(const SizedBox.shrink());
      await _adminSeed('users/$uid', {'role': 'business', 'active': false});
      await tester.pumpWidget(
        MaterialApp(home: CampaignZonesScreen(campaign: campaign)),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining("We couldn't load this campaign's areas."),
        findsOneWidget,
      );
      expect(find.textContaining('permission-denied'), findsNothing);
      expect(tester.takeException(), isNull);
    },
    skip: !_run,
  );
}
