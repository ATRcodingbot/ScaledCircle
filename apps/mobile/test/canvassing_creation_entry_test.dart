import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/create/campaigns/canvassing/canvassing_campaign_screen.dart';
import 'package:flutter_app/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart';

void main() {
  testWidgets(
    'canvassing reaches the maintained mapped wizard in every environment',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: CanvassingCampaignScreen()),
      );
      await tester.pumpAndSettle();
      expect(find.byType(FlyerCampaignScreen), findsOneWidget);
      expect(
        tester
            .widget<FlyerCampaignScreen>(find.byType(FlyerCampaignScreen))
            .campaignType,
        'neighborhoodCanvassing',
      );
      expect(find.text('Create Neighborhood Canvassing'), findsOneWidget);
      await tester.dragUntilVisible(
        find.text('Create & Define Zones'),
        find.byType(ListView),
        const Offset(0, -450),
      );
      expect(find.text('Create & Define Locations'), findsNothing);
      expect(find.text('Material Quantity'), findsNothing);
      expect(find.text('Before Photo'), findsNothing);
      expect(find.text('After Photo'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
