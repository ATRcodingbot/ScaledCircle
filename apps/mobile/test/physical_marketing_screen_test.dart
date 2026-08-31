import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_app/screens/business/physical_marketing_screen.dart';
import 'package:flutter_app/services/physical_marketing_service.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakePhysicalMarketing implements PhysicalMarketingGateway {
  _FakePhysicalMarketing(this.value);
  Map<String, dynamic> value;
  var creates = 0;
  var prepares = 0;
  var approvals = 0;
  final image = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZ7hG3sAAAAASUVORK5CYII=',
  );

  @override
  Future<Map<String, dynamic>> workspace() async => value;
  @override
  Future<Map<String, dynamic>> create({
    required String requestId,
    required Map<String, dynamic> draft,
  }) async {
    creates++;
    return {'materialId': 'material-new', 'status': 'DRAFT'};
  }

  @override
  Future<Map<String, dynamic>> prepare(String materialId) async {
    prepares++;
    return {'materialId': materialId, 'status': 'READY_FOR_REVIEW'};
  }

  @override
  Future<Map<String, dynamic>> approve(
    String materialId,
    String versionId,
  ) async {
    approvals++;
    return {'materialId': materialId, 'status': 'ORDER_READY'};
  }

  @override
  Future<Uint8List?> bytes(
    String storagePath, {
    required int maximumBytes,
  }) async => image;
}

Map<String, dynamic> _workspace({String status = 'ORDER_READY'}) => {
  'campaigns': [
    {'campaignId': 'campaign-one', 'name': 'Spring outreach'},
  ],
  'landingPages': [
    {'landingPageId': 'page-one', 'title': 'Seasonal cleanup'},
  ],
  'approvedMedia': <dynamic>[],
  'productSpecs': [
    {
      'specId': 'door_hanger_3_5x8_5',
      'productType': 'door_hanger',
      'label': 'Door hanger',
    },
  ],
  'materials': [
    {
      'materialId': 'material-one',
      'status': status,
      'draft': {
        'headline': 'Refresh your outdoor space',
        'service': 'Seasonal cleanup',
        'productSpecId': 'door_hanger_3_5x8_5',
      },
      if (status != 'DRAFT')
        'version': {
          'versionId': 'version-one',
          'artifact': {
            'storagePath': 'private/print-master.pdf',
            'digitalJpgPath': 'private/digital.jpg',
            'proofs': [
              {
                'side': 1,
                'storagePath': 'private/proof.webp',
                'contentHash': 'proof-hash',
              },
            ],
          },
        },
    },
  ],
};

Widget _screen(_FakePhysicalMarketing service) =>
    MaterialApp(home: PhysicalMarketingScreen(service: service));

void main() {
  testWidgets('desktop shows exact proof and honest fulfillment choices', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(_screen(_FakePhysicalMarketing(_workspace())));
    await tester.pumpAndSettle();
    expect(find.text('Download File'), findsOneWidget);
    expect(find.text('Ship to Me'), findsOneWidget);
    expect(find.text('Pick Up Nearby'), findsOneWidget);
    expect(find.text('Print-ready PDF'), findsOneWidget);
    expect(find.text('Print — Coming Soon'), findsOneWidget);
    expect(find.bySemanticsLabel('Exact print proof'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('390 by 844 keeps review workflow usable without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      _screen(_FakePhysicalMarketing(_workspace(status: 'READY_FOR_REVIEW'))),
    );
    await tester.pumpAndSettle();
    expect(find.text('Approve exact version'), findsOneWidget);
    expect(find.text('Print + Mail — Coming Soon'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('draft prepare action invokes one server authority', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final service = _FakePhysicalMarketing(_workspace(status: 'DRAFT'));
    await tester.pumpWidget(_screen(service));
    await tester.pumpAndSettle();
    final button = find.widgetWithText(FilledButton, 'Prepare proof');
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(service.prepares, 1);
  });
}
