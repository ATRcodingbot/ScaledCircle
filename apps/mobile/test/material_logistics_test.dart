import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/models/material_logistics.dart';

void main() {
  test('all four authoritative fulfillment methods are exposed', () {
    expect(MaterialLogisticsDraft.supportedTypes, [
      'scaler_pickup_print_shop',
      'scaler_pickup_business',
      'business_delivery',
      'no_materials_required',
    ]);
  });

  test('required fields vary by fulfillment method', () {
    expect(
      const MaterialLogisticsDraft(
        fulfillmentType: MaterialLogisticsDraft.noMaterialsRequired,
      ).validate(),
      isNull,
    );
    expect(
      const MaterialLogisticsDraft(
        fulfillmentType: MaterialLogisticsDraft.businessDelivery,
      ).validate(),
      contains('date and time'),
    );
    final scheduled = DateTime.utc(2030, 9, 3, 12, 30);
    expect(
      MaterialLogisticsDraft(
        fulfillmentType: MaterialLogisticsDraft.businessDelivery,
        scheduledAt: scheduled,
        location: '100 Staging Plaza',
      ).validate(),
      isNull,
    );
    expect(
      MaterialLogisticsDraft(
        fulfillmentType: MaterialLogisticsDraft.scalerPickupPrintShop,
        scheduledAt: scheduled,
        location: '100 Staging Plaza',
      ).validate(),
      contains('printing shop'),
    );
  });

  test('existing campaign logistics load and serialize deterministically', () {
    final draft = MaterialLogisticsDraft.fromCampaign({
      'materialFulfillmentType': 'business_delivery',
      'materialHandoffAddress': '100 Staging Plaza',
      'materialHandoffScheduledAt': '2030-09-03T12:30:00Z',
      'materialHandoffInstructions': 'Meet near the entrance.',
    });
    expect(draft.fulfillmentType, 'business_delivery');
    expect(draft.location, '100 Staging Plaza');
    expect(draft.validate(), isNull);
    expect(draft.toCallableData(campaignId: 'campaign-1'), containsPair(
      'campaignId',
      'campaign-1',
    ));
  });

  test('create and edit use one shared Material Fulfillment form', () {
    final createSource = File(
      'lib/screens/business/create_campaign_screen.dart',
    ).readAsStringSync();
    final editSource = File(
      'lib/screens/business/edit_campaign_screen.dart',
    ).readAsStringSync();
    final widgetSource = File(
      'lib/widgets/material_fulfillment_form.dart',
    ).readAsStringSync();
    final modelSource = File(
      'lib/models/material_logistics.dart',
    ).readAsStringSync();
    expect(createSource, contains('MaterialFulfillmentForm('));
    expect(editSource, contains('MaterialFulfillmentForm('));
    final flyerSource = File(
      'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
    ).readAsStringSync();
    final distributionSource = File(
      'lib/screens/business/create/campaigns/distribution/'
      'material_distribution_campaign_screen.dart',
    ).readAsStringSync();
    expect(flyerSource, contains('MaterialFulfillmentForm('));
    expect(distributionSource, contains('MaterialFulfillmentForm('));
    expect(flyerSource, isNot(contains("labelText: 'Material Handoff'")));
    expect(distributionSource, isNot(contains("labelText: 'Material Handoff'")));
    for (final method in MaterialLogisticsDraft.supportedTypes) {
      expect(modelSource, contains(method));
    }
    expect(widgetSource, contains('MaterialLogisticsDraft.supportedTypes'));
    expect(editSource, contains('updateCampaignMaterialLogistics'));
    expect(editSource, contains('proposeMaterialLogisticsChange'));
    expect(editSource, contains('Material logistics are locked because a Scaler accepted'));
  });

  test('Campaign Details exposes locked material plan and formats legacy values', () {
    final details = File(
      'lib/screens/campaigns/campaign_details_screen.dart',
    ).readAsStringSync();
    expect(details, contains("'MATERIAL FULFILLMENT'"));
    expect(details, contains('Editable until a Scaler is assigned'));
    expect(details, contains('Locked — a Scaler accepted these terms'));
    expect(details, contains("].join('\\n')"));
    expect(details, isNot(contains("].join('\\\\n')")));
    expect(details, contains(r'Timestamp\(seconds='));
  });

  test('Scaler discovery displays material terms before acceptance', () {
    final screen = File(
      'lib/screens/scaler/campaigns/scaler_campaign_details_screen.dart',
    ).readAsStringSync();
    final model = File('lib/models/campaign_model.dart').readAsStringSync();
    expect(model, contains('materialLogistics'));
    expect(screen, contains("'MATERIALS'"));
    expect(screen, contains('These material terms become locked when you accept'));
  });

  test('group campaign details never projects a zero legacy base pay', () {
    final detailsSource = File(
      'lib/screens/campaigns/campaign_details_screen.dart',
    ).readAsStringSync();
    expect(detailsSource, contains('CampaignCardCompensation.fromCampaign'));
    expect(detailsSource, contains("'GROUP WORKER PAY'"));
    expect(detailsSource, contains('compensation.isGroupCampaign'));
  });

  test('beta access remains authoritative and is not locally bypassed', () {
    final loginSource = File(
      'lib/screens/auth/login_screen.dart',
    ).readAsStringSync();
    expect(loginSource, contains("userData?['betaAccess'] == 'approved'"));
    final gateStart = loginSource.indexOf('final approvedForBeta');
    final gateEnd = loginSource.indexOf('var accountType', gateStart);
    final gate = loginSource.substring(gateStart, gateEnd);
    expect(gate, isNot(contains('AppEnvironmentConfig.isLocal')));
  });
}
