import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/social_connection_card.dart';

void main() {
  Map<String, dynamic> connection(String state) => {
    'provider': 'facebook',
    'status': state,
    'accountDisplayName': 'My Business',
    'providerAccountId': 'private_provider_123',
    'grantedScopes': ['pages_manage_posts'],
    'capabilities': {'analytics': true, 'publishText': true},
  };
  Future<void> card(
    WidgetTester tester,
    Map<String, dynamic> data, {
    bool enabled = false,
  }) => tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SocialConnectionCard(
          connection: data,
          publishingEnabled: enabled,
          onConnect: () {},
          onContinue: () {},
          onChoose: () {},
          onCancel: () {},
          onManage: () {},
        ),
      ),
    ),
  );

  test(
    'Meta permission readiness stays separate from existing non-Meta authority',
    () {
      final granted = {
        ...connection('connected_write'),
        'writeScopesGranted': true,
      };
      expect(socialPublishingEnabled(granted, true), isFalse);
      expect(
        socialPublishingEnabled({
          ...granted,
          'managedPublishingPermissionGranted': true,
        }, false),
        isTrue,
      );
      expect(
        socialPublishingEnabled({...granted, 'provider': 'x'}, true),
        isTrue,
      );
      expect(
        socialPublishingEnabled({...granted, 'provider': 'x'}, false),
        isFalse,
      );
      expect(
        socialPublishingEnabled({
          ...granted,
          'provider': 'x',
          'requiresReconnect': true,
        }, true),
        isFalse,
      );
    },
  );

  testWidgets(
    'read access does not imply publishing; infrastructure is hidden',
    (tester) async {
      await card(tester, connection('connected_read_only'), enabled: true);
      expect(find.text('Connected'), findsOneWidget);
      expect(find.text('Analytics: On'), findsOneWidget);
      expect(find.text('Managed Publishing: Off'), findsOneWidget);
      expect(find.text('Manage Connection'), findsOneWidget);
      expect(find.textContaining('private_provider'), findsNothing);
      expect(find.textContaining('pages_manage_posts'), findsNothing);
      expect(find.textContaining('Read only'), findsNothing);
    },
  );
  testWidgets('failed connection is recoverable without raw diagnostics', (
    tester,
  ) async {
    await card(tester, {
      ...connection('not_connected'),
      'customerMessage': 'sensitive error [400]',
    });
    expect(find.text('Not connected'), findsOneWidget);
    expect(find.text('Try Again'), findsOneWidget);
    expect(find.textContaining('[400]'), findsNothing);
    expect(find.textContaining('Authorizing'), findsNothing);
  });
  testWidgets(
    'Page chooser lists all returned Pages with linked identities; no preselection',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => const SocialAccountPicker(
                    isMeta: true,
                    candidates: [
                      {
                        'candidateId': 'secret_1',
                        'accountDisplayName': 'First Business',
                        'linkedHandle': 'first',
                      },
                      {
                        'candidateId': 'secret_2',
                        'accountDisplayName': 'Second Business',
                      },
                    ],
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('Connect First Business'), findsOneWidget);
      expect(find.text('Connect Second Business'), findsOneWidget);
      expect(find.text('Linked Instagram: @first'), findsOneWidget);
      expect(find.text("Instagram isn't connected yet."), findsOneWidget);
      expect(find.textContaining('secret_'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('small screen and large text keep actions accessible', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.8)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: SocialConnectionCard(
                connection: connection('identity_pending'),
                publishingEnabled: false,
                onConnect: () {},
                onContinue: () {},
                onChoose: () {},
                onCancel: () {},
                onManage: () {},
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.text('Choose Business Page'), findsOneWidget);
    expect(find.text('Cancel connection'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
