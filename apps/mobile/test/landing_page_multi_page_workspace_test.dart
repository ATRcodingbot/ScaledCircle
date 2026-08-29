import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/landing_page_builder_screen.dart';
import 'package:flutter_app/services/landing_page_service.dart';

class _FakeLandingPageGateway implements LandingPageGateway {
  _FakeLandingPageGateway({this.pages = const [], this.morePages = const []});

  final List<Map<String, dynamic>> pages;
  final List<Map<String, dynamic>> morePages;
  int createCalls = 0;
  int listCalls = 0;
  String? creationRequestId;

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

void main() {
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
