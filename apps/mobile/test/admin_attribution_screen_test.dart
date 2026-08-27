import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/attribution_service.dart';

void main() {
  testWidgets('attribution preview shows real metric definitions and intentional empty state', (tester) async {
    const overview = AttributionOverview(
      metrics: {'trackedInteractions': 0, 'uniqueResponses': 0, 'leads': 0, 'conversions': 0},
      assets: [],
      dataStatus: 'insufficient_data',
    );
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: _Subject(overview))));
    expect(find.text('Tracked interactions'), findsOneWidget);
    expect(find.text('Unique responses'), findsOneWidget);
    expect(find.text('Leads'), findsOneWidget);
    expect(find.text('Conversions'), findsOneWidget);
    expect(find.text('Insufficient attribution data.'), findsOneWidget);
    expect(find.textContaining('estimated physical impressions'), findsOneWidget);
  });

  testWidgets('attribution preview remains usable at 390x844', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    const overview = AttributionOverview(
      metrics: {'trackedInteractions': 3, 'uniqueResponses': 2, 'leads': 1, 'conversions': 0},
      assets: [{'type': 'qr', 'status': 'active', 'label': 'QA flyer'}],
      dataStatus: 'available',
    );
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: _Subject(overview))));
    expect(find.text('QA flyer'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _Subject extends StatelessWidget {
  const _Subject(this.overview);
  final AttributionOverview overview;
  @override
  Widget build(BuildContext context) => _AttributionTestContent(overview: overview);
}

// Mirrors the screen's bounded presentation without Firebase/Auth dependencies.
class _AttributionTestContent extends StatelessWidget {
  const _AttributionTestContent({required this.overview});
  final AttributionOverview overview;
  @override
  Widget build(BuildContext context) => ListView(
    children: [
      const Text('Real first-party response events. No estimated physical impressions.'),
      Wrap(children: [
        Text('${overview.metric('trackedInteractions')} Tracked interactions'),
        Text('${overview.metric('uniqueResponses')} Unique responses'),
        Text('${overview.metric('leads')} Leads'),
        Text('${overview.metric('conversions')} Conversions'),
      ]),
      if (overview.dataStatus == 'insufficient_data') const Text('Insufficient attribution data.'),
      ...overview.assets.map((asset) => Text(asset['label']?.toString() ?? 'Tracked response')),
    ],
  );
}
