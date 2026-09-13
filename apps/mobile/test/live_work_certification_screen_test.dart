import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/jobs/live_work_certification_screen.dart';

void main() {
  testWidgets('private task shows actual evidence and exact earning before approval at narrow large text', (tester) async {
    tester.view.physicalSize = const Size(375, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final calls = <Map<String, dynamic>>[];
    await tester.pumpWidget(MaterialApp(builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.6)), child: child!),
      home: LiveWorkCertificationScreen(call: (input) async {
        calls.add(input);
        return {'title':'Yard Cleanup Check','task':'Real yard work with before and after photos.','duration':'5–10 minutes','status':'submitted','fundingStatus':'funded','notes':'Founder supplied work observations.','photos':[], 'quote':{'platformFeeCents':60,'totalChargeCents':360},'actions':['approve']};
      })));
    await tester.pumpAndSettle();
    expect(find.textContaining('Fixed Scaler compensation: \$3.00'), findsOneWidget);
    expect(find.textContaining('Founder supplied work observations.'), findsOneWidget);
    expect(find.textContaining('Total Business cost: \$3.60'), findsOneWidget);
    expect(find.text('Start Job'), findsNothing);
    expect(calls, [{}]);
    expect(tester.takeException(), isNull);
  });
}
