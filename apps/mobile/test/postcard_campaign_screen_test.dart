import 'package:flutter/material.dart';
import 'package:flutter_app/screens/business/postcard_campaign_screen.dart';
import 'package:flutter_app/services/postcard_fulfillment_service.dart';
import 'package:flutter_app/config/app_environment.dart';
import 'package:flutter_test/flutter_test.dart';

class Gateway implements PostcardGateway {
  Gateway(this.orders);
  final List<Map<String, dynamic>> orders;
  final calls = <String>[];
  final payloads = <Map<String, dynamic>>[];
  bool fail = false;
  bool failCreate = false;
  @override
  Future<Map<String, dynamic>> call(
    String action,
    Map<String, dynamic> data,
  ) async {
    calls.add(action);
    payloads.add({...data});
    if (fail) throw StateError('read unavailable');
    if (failCreate && action == 'create') {
      throw StateError('Create unavailable. Please retry.');
    }
    return {
      'orders': orders,
      'physical': {'materials': []},
    };
  }
}

Map<String, dynamic> order(String status) => {
  'orderId': 'order-one',
  'name': 'Autumn neighborhood mail',
  'customerStatus': status == 'QUOTED' ? 'Your quote is ready' : 'Printing',
  'status': status,
  'targetArea': 'Glen Burnie',
  'zip': '21061',
  'simulation': true,
  'quote': {
    'quantity': 200,
    'estimate': 'Simulation only',
    'routes': [],
    'printingCents': 9000,
    'postageCents': 5200,
    'fulfillmentCents': 2500,
    'taxCents': 0,
    'totalCents': 16700,
    'cancellationPolicy': 'Full refund before printing is ordered.',
  },
};
Future<void> screen(
  WidgetTester tester,
  Gateway gateway, {
  bool admin = false,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: PostcardCampaignScreen(service: gateway, admin: admin),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'Business sees clear quote, no vendor operations, and payment requires explicit acceptance',
    (tester) async {
      final gateway = Gateway([order('QUOTED')]);
      await screen(tester, gateway);
      expect(find.text('Fulfilled by ScaledCircle'), findsOneWidget);
      expect(find.text('Total \$167.00'), findsOneWidget);
      expect(find.text('Attach private receipt'), findsNothing);
      await tester.ensureVisible(find.text('Review quote & pay'));
      await tester.tap(find.text('Review quote & pay'));
      await tester.pumpAndSettle();
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Pay ScaledCircle — TEST'),
      );
      expect(button.onPressed, isNull);
      expect(
        tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
        false,
      );
      expect(gateway.calls.where((a) => a == 'checkout'), isEmpty);
    },
  );
  testWidgets('load failure exits loader with Retry', (tester) async {
    final gateway = Gateway([])..fail = true;
    await screen(tester, gateway);
    expect(find.textContaining('could not load'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    gateway.fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Create Postcard Campaign'), findsOneWidget);
  });
  testWidgets(
    'Admin sees receipt and actual cost controls, while steps stay payment bound',
    (tester) async {
      final paid = order('PRINT_READY')..['paidCents'] = 16700;
      await screen(tester, Gateway([paid]), admin: true);
      expect(find.text('Mark ordered for print'), findsOneWidget);
      expect(find.text('Attach private receipt'), findsOneWidget);
      expect(find.text('Record actual costs'), findsOneWidget);
      expect(find.text('Create Postcard Campaign'), findsNothing);
    },
  );
  testWidgets('narrow mobile quote and customer controls remain readable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await screen(tester, Gateway([order('QUOTED')]));
    await tester.ensureVisible(find.text('Review quote & pay'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'unreleased production UI offers no dead-end order or payment button',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: PostcardCampaignScreen()),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Customer payments'), findsNothing);
      expect(
        find.textContaining('customer payments are not available yet'),
        findsOneWidget,
      );
      expect(find.byType(FilledButton), findsNothing);
    },
    skip: AppEnvironmentConfig.isStaging,
  );
}
