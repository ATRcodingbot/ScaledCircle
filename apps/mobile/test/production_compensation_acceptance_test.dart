import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/production_compensation_acceptance.dart';

void main() {
  testWidgets('pay requirements need explicit acceptance and never prorate base', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body:
      CompensationAcceptanceDialog(offer: {'baseAmountCents': 15000, 'bonusAmountCents': 2500}))));
    expect(find.textContaining('Full base: \$150.00 at 80%'), findsOneWidget);
    expect(find.textContaining('Coverage bonus: \$25.00 at 95%'), findsOneWidget);
    expect(find.textContaining('Base pay is not prorated.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNotNull);
  });
  testWidgets('zero accepted bonus is truthful', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body:
      CompensationAcceptanceDialog(offer: {'baseAmountCents': 15000, 'bonusAmountCents': 0}))));
    expect(find.textContaining('No coverage bonus is offered.'), findsOneWidget);
  });
}
