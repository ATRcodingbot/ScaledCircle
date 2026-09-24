import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_app/navigation/campaign_route_content.dart';
import 'package:flutter_test/flutter_test.dart';

// A read-only snapshot fake keeps this route regression independent of Firebase.
// ignore: subtype_of_sealed_class
class _Campaign extends Fake implements DocumentSnapshot<Map<String, dynamic>> {
  _Campaign(this.owner, {this.exists = true});
  final String owner;
  @override
  final bool exists;
  @override
  Map<String, dynamic> data() => {'businessId': owner};
}

void main() {
  testWidgets('unchanged 30-second access refresh preserves campaign editor', (
    tester,
  ) async {
    final refresh = ValueNotifier(0);
    var reads = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: ValueListenableBuilder<int>(
          valueListenable: refresh,
          builder: (_, value, child) => CampaignRouteContent(
            campaignId: 'saved-48-point-draft',
            actorUid: 'owner',
            isAdmin: false,
            fallbackRoute: '/business',
            // The actual workspace poll creates a new callback/widget each time.
            load: () async {
              reads++;
              return _Campaign('owner');
            },
            builder: (_) => const Scaffold(body: TextField()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Unsubmitted draft choice');
    for (var visit = 0; visit < 3; visit++) {
      refresh.value++;
      await tester.pump(const Duration(seconds: 30));
      await tester.pumpAndSettle();
      expect(find.text('Unsubmitted draft choice'), findsOneWidget);
    }
    expect(reads, 1);
    await tester.pumpWidget(const SizedBox());
    refresh.dispose();
  });

  testWidgets(
    'account/campaign changes reload and never expose previous data',
    (tester) async {
      var reads = 0;
      Future<DocumentSnapshot<Map<String, dynamic>>>? pending;
      Widget page(String actor, String campaign) => MaterialApp(
        home: CampaignRouteContent(
          campaignId: campaign,
          actorUid: actor,
          isAdmin: false,
          fallbackRoute: '/business',
          load: () {
            reads++;
            return pending ?? Future.value(_Campaign('owner'));
          },
          builder: (_) => const Scaffold(body: Text('Private campaign')),
        ),
      );
      await tester.pumpWidget(page('owner', 'first'));
      await tester.pumpAndSettle();
      expect(find.text('Private campaign'), findsOneWidget);
      final changed = Completer<DocumentSnapshot<Map<String, dynamic>>>();
      pending = changed.future;
      await tester.pumpWidget(page('other', 'first'));
      expect(find.text('Private campaign'), findsNothing);
      changed.complete(_Campaign('owner'));
      await tester.pumpAndSettle();
      expect(
        find.text("You don't have access to this campaign."),
        findsOneWidget,
      );
      expect(find.text('Private campaign'), findsNothing);
      pending = Future.value(_Campaign('other'));
      await tester.pumpWidget(page('other', 'second'));
      await tester.pumpAndSettle();
      expect(find.text('Private campaign'), findsOneWidget);
      expect(reads, 3);
    },
  );

  testWidgets('failed or missing campaign stays unavailable', (tester) async {
    for (final failed in [false, true]) {
      await tester.pumpWidget(
        MaterialApp(
          home: CampaignRouteContent(
            campaignId: '$failed',
            actorUid: 'owner',
            isAdmin: false,
            fallbackRoute: '/business',
            load: () async {
              if (failed) throw StateError('read unavailable');
              return _Campaign('owner', exists: false);
            },
            builder: (_) => const Text('Private campaign'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Campaign not available.'), findsOneWidget);
      expect(find.text('Private campaign'), findsNothing);
    }
  });
}
