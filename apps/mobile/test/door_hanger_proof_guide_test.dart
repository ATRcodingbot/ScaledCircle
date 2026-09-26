import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/widgets/door_hanger_proof_guide.dart';

void main() {
  testWidgets('door hanger guide is visible and uses selected safe line', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 261,
            height: 621,
            child: DoorHangerProofGuide(
              geometry: {
                'trim': {'width': 3.5, 'height': 8.5},
                'bleed': 0.0625,
                'contentTop': 2.15,
              },
              child: ColoredBox(color: Colors.white),
            ),
          ),
        ),
      ),
    );
    expect(
      find.text('Keep important content out of this area'),
      findsOneWidget,
    );
    final zone = tester.widget<FractionallySizedBox>(
      find.byType(FractionallySizedBox),
    );
    expect(zone.heightFactor, closeTo(2.2125 / 8.625, 0.000001));
    expect(tester.takeException(), isNull);
  });
  testWidgets('other materials have no overlay', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: DoorHangerProofGuide(
          geometry: null,
          child: Text('Landscape postcard'),
        ),
      ),
    );
    expect(find.text('Landscape postcard'), findsOneWidget);
    expect(find.text('Keep important content out of this area'), findsNothing);
  });
}
