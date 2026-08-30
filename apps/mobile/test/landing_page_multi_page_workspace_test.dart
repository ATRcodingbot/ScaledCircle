import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/landing_page_builder_screen.dart';
import 'package:flutter_app/services/landing_page_service.dart';
import 'package:flutter_app/services/business_media_service.dart';
import 'dart:typed_data';

class _FakeLandingPageGateway implements LandingPageGateway {
  _FakeLandingPageGateway({this.pages = const [], this.morePages = const []});

  final List<Map<String, dynamic>> pages;
  final List<Map<String, dynamic>> morePages;
  int createCalls = 0;
  int listCalls = 0;
  String? creationRequestId;
  Map<String, dynamic>? createdContent;

  @override
  Future<Map<String, dynamic>> list({String? cursor}) async {
    listCalls++;
    if (cursor == null) {
      return {
        'pages': pages,
        'hasMore': morePages.isNotEmpty,
        'nextCursor': morePages.isEmpty ? null : 'cursor-2',
      };
    }
    return {'pages': morePages, 'hasMore': false, 'nextCursor': null};
  }

  @override
  Future<Map<String, dynamic>> create({
    required Map<String, dynamic> content,
    required bool tracking,
    required String creationRequestId,
  }) async {
    createCalls++;
    createdContent = content;
    this.creationRequestId = creationRequestId;
    return {'pageId': 'page-new', 'publicSlug': 'PUBLIC_NEW'};
  }

  @override
  Future<Map<String, dynamic>> load(String pageId) async =>
      throw UnimplementedError();

  @override
  Future<Map<String, dynamic>> save(
    String pageId,
    Map<String, dynamic> content, {
    required bool tracking,
  }) async => {};

  @override
  Future<Map<String, dynamic>> transition(String pageId, String action) async =>
      {};
}

class _FakeBusinessMediaGateway implements BusinessMediaGateway {
  @override
  Future<Map<String, dynamic>> workspace({String? cursor}) async => {
    'assets': [
      {'assetId': 'asset-approved', 'title': 'Approved hero', 'purpose': 'hero',
        'approvedRevisionId': 'revision-approved', 'removed': false,
        'approvedRevision': {'revisionId': 'revision-approved', 'status': 'ready',
          'approvalStatus': 'approved', 'altText': 'Conceptual service image'}},
      {'assetId': 'asset-pending', 'title': 'Pending image', 'purpose': 'hero',
        'approvedRevisionId': null, 'removed': false,
        'revision': {'revisionId': 'revision-pending', 'status': 'ready',
          'approvalStatus': 'pending', 'altText': 'Pending'}},
    ],
  };
  @override Future<void> approve(String a,String r) async {}
  @override Future<void> reject(String a,String r) async {}
  @override Future<void> remove(String a) async {}
  @override Future<void> selectLogo(String a,String r) async {}
  @override Future<Uint8List?> previewBytes(Map<String,dynamic> a) async => null;
  @override Future<void> saveReviewMetadata({required String assetId,required String revisionId,required String altText,required String serviceLabel,required bool rightsAttestation}) async {}
  @override Future<void> updateBrand({required String primaryColor,required String secondaryColor,required String stylePreset,required List<String> approvedServiceCategories}) async {}
  @override Future<void> upload({required Uint8List bytes,required String filename,required String purpose,String? assetId}) async {}
}

void main() {
  testWidgets('builder selects only approved exact media revisions', (tester) async {
    final service = _FakeLandingPageGateway();
    await tester.pumpWidget(MaterialApp(home: LandingPageBuilderScreen(
      service: service, mediaService: _FakeBusinessMediaGateway())));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('new-landing-page-button')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('add-approved-visual')), 500,
      scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const Key('add-approved-visual')));
    await tester.pumpAndSettle();
    expect(find.text('Approved hero'), findsOneWidget);
    expect(find.text('Pending image'), findsNothing);
    await tester.tap(find.text('Approved hero'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Save draft'), 500,
      scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save draft'));
    await tester.pumpAndSettle();
    final media = Map<String,dynamic>.from(service.createdContent!['media'] as Map);
    final visual = Map<String,dynamic>.from((media['visuals'] as List).single as Map);
    expect(visual['assetId'], 'asset-approved');
    expect(visual['revisionId'], 'revision-approved');
    expect(visual['role'], 'hero');
  });
  testWidgets('zero-page workspace starts a local draft without server junk', (
    tester,
  ) async {
    final service = _FakeLandingPageGateway();
    await tester.pumpWidget(
      MaterialApp(home: LandingPageBuilderScreen(service: service)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Create your first Landing Page'), findsNWidgets(2));
    await tester.tap(find.byKey(const Key('new-landing-page-button')));
    await tester.pumpAndSettle();

    expect(find.text('Headline'), findsOneWidget);
    expect(service.createCalls, 0);
    await tester.scrollUntilVisible(
      find.text('Save draft'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Save draft'));
    await tester.pumpAndSettle();
    expect(service.createCalls, 1);
    expect(service.creationRequestId, isNotEmpty);
  });

  testWidgets('existing pages are intentionally identifiable and reopenable', (
    tester,
  ) async {
    final service = _FakeLandingPageGateway(
      pages: [
        {
          'pageId': 'page-a',
          'title': 'Existing Tracking-Off Page',
          'status': 'published',
          'trackingMode': 'off',
          'inquiryCount': 1,
          'hasUnpublishedChanges': false,
        },
        {
          'pageId': 'page-b',
          'title': 'Separate Tracking-On Draft',
          'status': 'draft',
          'trackingMode': 'first_party',
          'inquiryCount': 0,
          'hasUnpublishedChanges': false,
        },
      ],
    );
    await tester.pumpWidget(
      MaterialApp(home: LandingPageBuilderScreen(service: service)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Existing Tracking-Off Page'), findsOneWidget);
    expect(find.text('Published • Tracking Off • 1 inquiry'), findsOneWidget);
    expect(find.text('Separate Tracking-On Draft'), findsOneWidget);
    expect(find.text('Draft • Tracking On • 0 inquiries'), findsOneWidget);
    expect(find.text('Open'), findsNWidgets(2));
  });

  testWidgets('abandoning a changed new draft creates no page', (tester) async {
    final service = _FakeLandingPageGateway();
    await tester.pumpWidget(
      MaterialApp(home: LandingPageBuilderScreen(service: service)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('new-landing-page-button')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Headline'),
      'Unsaved customer funnel',
    );
    await tester.tap(find.byKey(const Key('business-page-back-button')));
    await tester.pumpAndSettle();
    expect(find.text('Leave without saving?'), findsOneWidget);
    await tester.tap(find.text('Leave without saving'));
    await tester.pumpAndSettle();
    expect(find.text('Your Landing Pages'), findsOneWidget);
    expect(service.createCalls, 0);
  });

  testWidgets('workspace controls fit a 390 by 844 viewport', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: LandingPageBuilderScreen(service: _FakeLandingPageGateway()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('new-landing-page-button')), findsOneWidget);
    await tester.tap(find.byKey(const Key('new-landing-page-button')));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const Key('new-landing-page-from-editor-button')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('Load More appends and deduplicates canonical page identities', (
    tester,
  ) async {
    final first = List.generate(
      20,
      (index) => {
        'pageId': 'page-${index + 1}',
        'title': 'Page ${index + 1}',
        'status': 'draft',
        'trackingMode': 'off',
        'inquiryCount': index,
      },
    );
    final service = _FakeLandingPageGateway(
      pages: first,
      morePages: [
        first.last,
        {
          'pageId': 'page-21',
          'title': 'Page 21',
          'status': 'draft',
          'trackingMode': 'off',
          'inquiryCount': 61,
        },
      ],
    );
    await tester.pumpWidget(
      MaterialApp(home: LandingPageBuilderScreen(service: service)),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('load-more-landing-pages-button')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.byKey(const Key('load-more-landing-pages-button')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('load-more-landing-pages-button')));
    await tester.pumpAndSettle();

    expect(find.text('Page 20'), findsOneWidget);
    expect(find.text('Page 21'), findsOneWidget);
    expect(find.text('Draft • Tracking Off • 61 inquiries'), findsOneWidget);
    expect(
      find.byKey(const Key('load-more-landing-pages-button')),
      findsNothing,
    );
    expect(service.listCalls, 2);
  });

  testWidgets('unavailable inquiry count is never rendered as zero', (
    tester,
  ) async {
    final service = _FakeLandingPageGateway(
      pages: const [
        {
          'pageId': 'page-a',
          'title': 'Count unavailable fixture',
          'status': 'published',
          'trackingMode': 'off',
          'inquiryCount': null,
        },
      ],
    );
    await tester.pumpWidget(
      MaterialApp(home: LandingPageBuilderScreen(service: service)),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Inquiry count unavailable'), findsOneWidget);
    expect(find.textContaining('0 inquiries'), findsNothing);
  });
}
