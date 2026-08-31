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

Map<String, dynamic> _workspace({
  String status = 'ORDER_READY',
  String? businessName = 'Attractive Remodel',
  bool marketingReady = true,
}) => {
  'campaigns': [
    {'campaignId': 'campaign-one', 'name': 'Spring outreach'},
  ],
  'landingPages': [
    {'landingPageId': 'page-one', 'title': 'Seasonal cleanup'},
  ],
  'approvedMedia': [
    {
      'assetId': 'asset-one',
      'revisionId': 'revision-one',
      'title': 'Approved deck image',
    },
  ],
  'businessIdentity': {
    'businessName': businessName,
    'hasApprovedLogo': true,
    'verifiedPhoneAvailable': false,
  },
  'availableServices': ['Build decks', 'Fences'],
  'copySuggestions': {
    'Build decks': {
      'headline': 'Build the deck your home deserves',
      'supportingText': 'Explore professional deck options for your property.',
      'cta': 'Scan to learn more',
    },
    'Fences': {
      'headline': 'A better-looking boundary starts here',
      'supportingText': 'Explore professional fence options for your property.',
      'cta': 'Scan to learn more',
    },
  },
  'templateSpecs': [
    {
      'templateId': 'door_hanger_service_hero_v1',
      'label': 'Service Hero',
      'available': true,
    },
    {
      'templateId': 'door_hanger_professional_services_v1',
      'label': 'Professional Services',
      'available': true,
    },
  ],
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
              {
                'side': 2,
                'storagePath': 'private/proof-back.webp',
                'contentHash': 'proof-back-hash',
              },
            ],
            'printReadiness': {'status': 'pass'},
            'marketingReadiness': {'status': marketingReady ? 'pass' : 'fail'},
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
    expect(find.bySemanticsLabel('Exact print proof side 1'), findsOneWidget);
    expect(find.bySemanticsLabel('Exact print proof side 2'), findsOneWidget);
    expect(find.text('Print quality Ready'), findsOneWidget);
    expect(find.text('Marketing content Ready'), findsOneWidget);
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

  testWidgets('creation uses canonical service, template, and approved media', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1100, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final service = _FakePhysicalMarketing(_workspace(status: 'DRAFT'));
    await tester.pumpWidget(_screen(service));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create material'));
    await tester.pumpAndSettle();
    expect(find.text('Attractive Remodel'), findsOneWidget);
    expect(find.text('Service Hero'), findsOneWidget);
    expect(find.text('Approved deck image'), findsOneWidget);
    expect(find.text('Build the deck your home deserves'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
  });

  testWidgets('missing canonical Business name blocks creation actionably', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1100, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final service = _FakePhysicalMarketing(
      _workspace(status: 'DRAFT', businessName: null),
    );
    await tester.pumpWidget(_screen(service));
    await tester.pumpAndSettle();
    expect(find.textContaining('Set Up Your Growth Profile'), findsOneWidget);
    expect(
      find.widgetWithText(FilledButton, 'Create material'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Create material'),
          )
          .onPressed,
      isNull,
    );
  });

  testWidgets('legacy order-ready fixture is downgraded when marketing fails', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1100, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      _screen(
        _FakePhysicalMarketing(
          _workspace(status: 'ORDER_READY', marketingReady: false),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('READY FOR REVIEW'), findsOneWidget);
    expect(find.text('Print-ready PDF'), findsNothing);
    expect(find.text('Marketing content Needs attention'), findsOneWidget);
  });
}
