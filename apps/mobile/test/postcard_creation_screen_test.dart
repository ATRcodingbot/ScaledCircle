import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/postcard_creation_screen.dart';
import 'package:flutter_app/services/physical_marketing_service.dart';
import 'package:flutter_app/services/postcard_fulfillment_service.dart';

class CreativePhysical implements PhysicalMarketingGateway {
  final drafts = <Map<String, dynamic>>[];
  int approvals = 0;
  bool failPrepare = false;
  static const data = {
    'businessIdentity': {
      'businessName': 'Craft & Care',
      'phone': '(410) 732-6184',
    },
    'availableServices': ['Build decks'],
    'copySuggestions': {
      'Build decks': {
        'headline': 'Plan your next deck',
        'supportingText': 'Explore deck options.',
      },
    },
    'landingPages': [],
    'approvedMedia': [],
    'trackingNumbers': [],
  };
  @override
  Future<Map<String, dynamic>> workspace() async => data;
  @override
  Future<Map<String, dynamic>> create({
    required String requestId,
    required Map<String, dynamic> draft,
  }) async {
    drafts.add(draft);
    return {'materialId': 'material'};
  }

  @override
  Future<Map<String, dynamic>> prepare(String id) async {
    if (failPrepare) throw StateError('Preview unavailable. Retry.');
    return {
      'versionId': 'version',
      'artifact': {'proofs': []},
    };
  }

  @override
  Future<Map<String, dynamic>> approve(String m, String v) async {
    approvals++;
    return {};
  }

  @override
  Future<Uint8List?> bytes(String p, {required int maximumBytes}) async => null;
}

class CreativeOrders implements PostcardGateway {
  final calls = <String>[];
  final payloads = <Map<String, dynamic>>[];
  bool failUpload = false;
  @override
  Future<Map<String, dynamic>> call(String a, Map<String, dynamic> d) async {
    calls.add(a);
    payloads.add(d);
    if (a == 'uploadArtwork') {
      if (failUpload) {
        throw StateError('This image is too small for a clear postcard.');
      }
      return {'uploadId': 'upload', 'pageCount': 1};
    }
    return {'orderId': 'order', 'campaignId': 'order'};
  }
}

Future<void> tap(WidgetTester t, String s) async {
  await t.ensureVisible(find.text(s).last);
  await t.tap(find.text(s).last);
  await t.pumpAndSettle();
}

Future<void> open(WidgetTester t, CreativePhysical p, CreativeOrders o) async {
  await t.pumpWidget(
    MaterialApp(
      home: PostcardCreationScreen(
        service: o,
        physical: p,
        workspace: CreativePhysical.data,
        pickArtwork: () async => [
          {'base64': 'test'},
        ],
      ),
    ),
  );
  await t.pumpAndSettle();
}

void main() {
  testWidgets(
    'file picker precedes server work and cancellation creates nothing',
    (t) async {
      final o = CreativeOrders();
      var picked = false;
      await t.pumpWidget(
        MaterialApp(
          home: PostcardCreationScreen(
            service: o,
            physical: CreativePhysical(),
            workspace: CreativePhysical.data,
            pickArtwork: () async {
              picked = true;
              expect(o.calls, isEmpty);
              return null;
            },
          ),
        ),
      );
      await t.pumpAndSettle();
      await tap(t, 'Use My Design');
      await tap(t, 'Choose artwork');
      expect(picked, true);
      expect(o.calls, isEmpty);
      expect(find.text('Choose artwork'), findsOneWidget);
    },
  );
  testWidgets(
    'preview retry reuses the exact design rather than duplicating it',
    (t) async {
      final p = CreativePhysical()..failPrepare = true, o = CreativeOrders();
      await open(t, p, o);
      await tap(t, 'Customize a Template');
      await tap(t, 'Continue');
      await tap(t, 'Continue');
      await tap(t, 'Continue');
      await tap(t, 'Prepare preview');
      expect(find.textContaining('Preview unavailable'), findsOneWidget);
      p.failPrepare = false;
      await tap(t, 'Prepare preview');
      expect(p.drafts.length, 1);
      expect(o.calls.where((a) => a == 'create').length, 1);
    },
  );
  testWidgets(
    'three choices first; QR off creates exact immutable preview before mailing/quote; no charge',
    (t) async {
      final p = CreativePhysical(), o = CreativeOrders();
      await open(t, p, o);
      for (final label in [
        'Use My Design',
        'Customize a Template',
        'Create It For Me',
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      expect(o.calls, isEmpty);
      await tap(t, 'Create It For Me');
      expect(find.text('Plan your next deck'), findsOneWidget);
      await tap(t, 'Continue');
      for (final label in [
        'Use My Photo',
        'Use My Brand Asset',
        'Generate a Service Image',
        'No Photo',
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      await tap(t, 'Continue');
      await tap(t, 'Continue');
      expect(
        t.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
        false,
      );
      await tap(t, 'Prepare preview');
      expect(p.drafts.single['qrEnabled'], false);
      expect(p.drafts.single['businessPhone'], '(410) 732-6184');
      expect(o.payloads.first.containsKey('targetArea'), false);
      expect(
        t
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Approve exact design'),
            )
            .onPressed,
        isNull,
      );
      expect(p.approvals, 0);
      await t.ensureVisible(find.byType(CheckboxListTile));
      await t.tap(find.byType(CheckboxListTile));
      await t.pumpAndSettle();
      await tap(t, 'Approve exact design');
      expect(p.approvals, 1);
      await t.enterText(
        find.byType(TextField).at(0),
        'Illustrative neighborhood',
      );
      await t.enterText(find.byType(TextField).at(1), '21061');
      await tap(t, 'Continue');
      await tap(t, 'Continue');
      expect(
        find.textContaining('20% of printing + USPS postage'),
        findsOneWidget,
      );
      expect(o.calls, contains('mailing'));
      expect(o.calls, isNot(contains('checkout')));
    },
  );
  testWidgets(
    'upload validation error visible and recoverable; original upload bound to preview',
    (t) async {
      final p = CreativePhysical(), o = CreativeOrders()..failUpload = true;
      await open(t, p, o);
      await tap(t, 'Use My Design');
      await tap(t, 'Choose artwork');
      expect(find.textContaining('too small'), findsOneWidget);
      o.failUpload = false;
      await tap(t, 'Choose artwork');
      expect(find.textContaining('1 side(s) checked'), findsOneWidget);
      await tap(t, 'Continue');
      await tap(t, 'Continue');
      await tap(t, 'Continue');
      await tap(t, 'Prepare preview');
      expect(p.drafts.single['artworkUploadId'], 'upload');
      expect(o.calls.where((e) => e == 'create').length, 1);
    },
  );
  testWidgets('narrow mobile creation stays readable', (t) async {
    t.view.physicalSize = const Size(320, 720);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await open(t, CreativePhysical(), CreativeOrders());
    await tap(t, 'Customize a Template');
    await tap(t, 'Continue');
    await tap(t, 'Continue');
    expect(t.takeException(), isNull);
  });
}
