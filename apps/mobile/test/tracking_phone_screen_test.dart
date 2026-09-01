import 'package:flutter/material.dart';
import 'package:flutter_app/screens/business/tracking_phone_screen.dart';
import 'package:flutter_app/services/tracking_phone_service.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeTrackingPhone implements TrackingPhoneGateway {
  _FakeTrackingPhone(this.value);
  final Map<String, dynamic> value;
  @override
  Future<Map<String, dynamic>> workspace() async => value;
}

Map<String, dynamic> workspace({bool populated = false}) => {
  'featureStatus': 'BETA',
  'provider': 'twilio',
  'providerConfigured': false,
  'setupAvailable': false,
  'message': 'Tracking Numbers are in Beta. Setup is not available yet.',
  'usage': {
    'activeNumbers': populated ? 1 : 0,
    'minutes': populated ? 27 : 0,
    'allowance': {
      'planId': 'managed_growth',
      'activeNumbers': 12,
      'includedMinutes': 1500,
    },
    'overageBillingEnabled': false,
  },
  'numbers': populated
      ? [
          {
            'trackingPhoneAssetId': 'phone-a',
            'displayNumber': '(410) 555-0199',
            'destinationMaskedDisplay': '(667) ***-0074',
            'campaignName': 'Howard County Deck Campaign',
            'status': 'ACTIVE',
          },
        ]
      : [],
  'recentCalls': populated
      ? [
          {'caller': '(410) ***-0101', 'state': 'COMPLETED', 'qualifiedLead': false},
          {'caller': '(443) ***-0102', 'state': 'NO_ANSWER', 'qualifiedLead': false},
        ]
      : [],
};

Widget subject(Map<String, dynamic> value) => MaterialApp(
  home: TrackingPhoneScreen(service: _FakeTrackingPhone(value)),
);

void main() {
  testWidgets('provider-free Business surface is truthful and cannot provision', (tester) async {
    await tester.pumpWidget(subject(workspace()));
    await tester.pumpAndSettle();
    expect(find.text('Tracking Numbers — Beta'), findsOneWidget);
    expect(find.text('Tracking Numbers are in Beta. Setup is not available yet.'), findsOneWidget);
    expect(find.text('Set up Tracking Number — Coming Soon'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton).first).onPressed, isNull);
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.text('No tracking numbers yet'), findsOneWidget);
    expect(find.textContaining('not automatically a lead or conversion'), findsOneWidget);
  });

  testWidgets('desktop explains number, forwarding, campaign, calls, answered and missed', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(subject(workspace(populated: true)));
    await tester.pumpAndSettle();
    expect(find.text('Howard County Deck Campaign'), findsOneWidget);
    expect(find.textContaining('Forwards to (667) ***-0074'), findsOneWidget);
    expect(find.text('1 / 12'), findsOneWidget);
    expect(find.text('27 / 1500'), findsOneWidget);
    expect(find.text('Answered'), findsOneWidget);
    expect(find.text('Missed'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('390 by 844 remains usable without overflow', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(subject(workspace(populated: true)));
    await tester.pumpAndSettle();
    expect(find.text('Tracking Numbers — Beta'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(find.text('Recent calls'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
