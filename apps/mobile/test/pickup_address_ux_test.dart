import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/material_logistics.dart';
import 'package:flutter_app/widgets/mapped_address_field.dart';
import 'package:flutter_app/widgets/material_fulfillment_form.dart';

void main() {
  testWidgets('partial pickup input does not show a premature map error', (
    tester,
  ) async {
    final controller = TextEditingController();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MappedAddressField(
            controller: controller,
            labelText: 'Business pickup location',
            allowManualAddress: true,
            searchAddresses: (_) async => const [],
          ),
        ),
      ),
    );
    await tester.enterText(find.byType(TextFormField), '466 Longtowne');
    expect(find.textContaining("couldn't confirm"), findsNothing);
  });

  testWidgets('no-match pickup can be saved manually and clears on edit', (
    tester,
  ) async {
    final controller = TextEditingController();
    String? accepted;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MappedAddressField(
            controller: controller,
            labelText: 'Business pickup location',
            allowManualAddress: true,
            onManualAccepted: (value) => accepted = value,
            searchAddresses: (_) async => const [],
          ),
        ),
      ),
    );
    await tester.enterText(
      find.byType(TextFormField),
      '123 Example Court, Annapolis, MD 21401',
    );
    await tester.tap(find.byTooltip('Search map'));
    await tester.pump();
    expect(
      find.text("We couldn't confirm this address on the map."),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('use-address-anyway')));
    await tester.pump();
    expect(accepted, controller.text);
    expect(find.textContaining('map not confirmed'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), '${controller.text} ');
    await tester.pump();
    expect(find.textContaining('map not confirmed'), findsNothing);
  });

  testWidgets('stored Business address populates with existing coordinates', (
    tester,
  ) async {
    var value = const MaterialLogisticsDraft(
      fulfillmentType: MaterialLogisticsDraft.scalerPickupBusiness,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) => Scaffold(
            body: SingleChildScrollView(
              child: MaterialFulfillmentForm(
                value: value,
                businessAddress: '123 Main St, Annapolis, MD 21401',
                businessLatitude: 38.98,
                businessLongitude: -76.49,
                onChanged: (next) => setState(() => value = next),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('use-my-business-address')));
    await tester.pump();
    expect(value.location, '123 Main St, Annapolis, MD 21401');
    expect(value.latitude, 38.98);
    expect(value.longitude, -76.49);
  });
}
