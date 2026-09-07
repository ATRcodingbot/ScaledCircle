import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/active_route_guidance.dart';
import 'package:latlong2/latlong.dart';

void main() {
  test('corridor guidance distinguishes outside position', () {
    const p=[LatLng(0,0),LatLng(0,1),LatLng(1,1),LatLng(1,0)];
    expect(positionInsideCorridor(const LatLng(.5,.5),p),true);
    expect(positionInsideCorridor(const LatLng(2,2),p),false);
  });
  testWidgets('unknown coverage is not displayed as zero', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: ActiveRouteGuidance(
      zone:{},location:null,progress:null,tilesEnabled:false))));
    expect(find.text('Route coverage: CALCULATING'),findsOneWidget);
    expect(find.textContaining('0.0%'),findsNothing);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: ActiveRouteGuidance(
      zone:{},location:null,progress:{'state':'available','coveragePercentage':25},tilesEnabled:false))));
    expect(find.text('25.0% route coverage · server-calculated, provisional'),findsOneWidget);
  });
}
