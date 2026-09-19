import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/customer_social_review_queue.dart';
import 'package:flutter_app/services/social_operations_service.dart';

class QueueService extends SocialOperationsService {
  final prepared = <String>[];
  final seen = <String>[];
  Map<String, dynamic> post(String id) => {
    'itemId': id,
    'provider': 'facebook',
    'version': 1,
    'ready': true,
    'reasons': [],
    'scheduledFor': '2027-01-01T15:00:00Z',
    'publicationStatus': null,
    'reviewedPost': {
      'variant': {'copy': 'Exact copy for $id', 'mediaRequirement': 'none'},
      'images': [],
      'quality': {'readyToPublish': true},
    },
  };
  SocialOperationsWorkspace workspace() => SocialOperationsWorkspace({
    'plans': [
      {
        'id': 'strategy',
        'goal': 'Approved direction',
        'items': [
          for (final id in ['first', 'second', 'frozen'])
            {
              'itemKey': id,
              'pillar': id,
              'variants': [
                {
                  'provider': 'facebook',
                  'status': id == 'frozen' ? 'scheduled' : 'draft',
                  'scheduling': post('strategy_$id'),
                },
              ],
            },
        ],
      },
    ],
  });
  @override
  Future<SocialOperationsWorkspace> load() async => workspace();
  @override
  Future<Map<String, dynamic>> previewPost(Map<String, dynamic> value) async {
    seen.add(value['itemId']);
    return post(value['itemId']);
  }

  @override
  Future<Map<String, dynamic>> preparePost(Map<String, dynamic> value) async {
    prepared.add(value['itemId']);
    return {};
  }
}

class DiversityQueueService extends QueueService {
  @override
  Map<String, dynamic> post(String id) => {
    ...super.post(id),
    'creativeRecommendation': {
      'format': 'text',
      'label': 'Text-only Facebook post',
      'reason': 'A short question invites a clear conversation.',
    },
  };
}

void main() {
  test(
    'private concept is ready only when inline approval and all scheduling requirements pass',
    () {
      final row = <String, dynamic>{
        'ready': false,
        'reviewCandidate': {
          'status': 'pending_owner_review',
          'approved': false,
        },
      };
      expect(socialQueueGroup(row), 'Needs Attention');
      expect(
        socialQueueGroup({
          ...row,
          'ready': true,
          'inlineCreativeApproval': {'digest': 'review'},
        }),
        'Ready for Review',
      );
      expect(row['ready'], false);
      expect(
        socialQueueGroup({...row, 'publicationStatus': 'scheduled'}),
        'Scheduled',
      );
      expect(
        socialQueueGroup({...row, 'reviewCandidate': null}),
        'Needs Attention',
      );
    },
  );
  testWidgets(
    'intentional text recommendation and reason wrap on a narrow large-text screen',
    (tester) async {
      tester.view.physicalSize = const Size(375, 812);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = DiversityQueueService();
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: CustomerSocialReviewQueue(
            workspace: service.workspace(),
            service: service,
            onSchedule: (_) async {
              fail('No approval');
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('TEXT POST').first,
        100,
        scrollable: find.byType(Scrollable).last,
      );
      expect(
        find.textContaining('Recommended format: Text-only Facebook post'),
        findsWidgets,
      );
      expect(
        find.text('A short question invites a clear conversation.'),
        findsWidgets,
      );
      expect(tester.takeException(), isNull);
      expect(service.prepared, isEmpty);
    },
  );
  test(
    'queue separates ready, unfinished, scheduled and published without treating media absence as success',
    () {
      expect(socialQueueGroup({'ready': true}), 'Ready for Review');
      expect(socialQueueGroup({'ready': false}), 'Needs Attention');
      expect(
        socialQueueGroup({'ready': false, 'preparing': true}),
        'Preparing Creative',
      );
      expect(
        socialQueueGroup({'ready': true, 'publicationStatus': 'scheduled'}),
        'Scheduled',
      );
      expect(socialQueueGroup({'publicationStatus': 'published'}), 'Published');
    },
  );
  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'review Back/Previous/Next preserve queue context at scale $scale without approval',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final service = QueueService();
        var approvals = 0;
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: CustomerSocialReviewQueue(
              workspace: service.workspace(),
              service: service,
              onSchedule: (_) async {
                approvals++;
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byType(DropdownButtonFormField<String>));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Ready for Review (2)').last);
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text('Preview').first,
          100,
          scrollable: find.byType(Scrollable).last,
        );
        await tester.tap(find.text('Preview').first);
        await tester.pumpAndSettle();
        expect(find.text('Post 1 of 2'), findsOneWidget);
        await tester.tap(find.text('Next'));
        await tester.pumpAndSettle();
        expect(find.text('Post 2 of 2'), findsOneWidget);
        await tester.tap(find.text('Previous'));
        await tester.pumpAndSettle();
        expect(find.text('Post 1 of 2'), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(find.text('Upcoming Posts'), findsOneWidget);
        expect(find.text('Ready for Review (2)'), findsWidgets);
        expect(service.prepared, isEmpty);
        expect(approvals, 0);
        expect(service.seen, [
          'strategy_first',
          'strategy_second',
          'strategy_first',
        ]);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
