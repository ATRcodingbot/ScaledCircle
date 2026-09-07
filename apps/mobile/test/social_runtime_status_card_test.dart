import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/social_runtime_status_card.dart';

void main() {
  testWidgets('social status is truthful, responsive, and refresh is read-only', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 740));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var reads = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: SocialRuntimeStatusCard(
              status: const {
                'available': true,
                'channels': [
                  {
                    'provider': 'facebook',
                    'nextScheduledFor': '2026-09-08T14:00:00Z',
                    'result':
                        'Waiting for the scheduled publication. No publication ID is recorded.',
                    'jobId': 'private-job-id',
                    'actionNeeded':
                        'No action is needed before the scheduled time.',
                  },
                ],
              },
              onRefresh: () => reads++,
            ),
          ),
        ),
      ),
    );
    expect(
      find.textContaining('No publication ID is recorded'),
      findsOneWidget,
    );
    expect(find.text('private-job-id'), findsNothing);
    expect(find.textContaining('Not scheduled'), findsOneWidget);
    await tester.ensureVisible(find.text('Refresh saved status'));
    await tester.tap(find.text('Refresh saved status'));
    expect(reads, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('missing read result is not a claim that publishing is off', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SocialRuntimeStatusCard(status: const {}, onRefresh: () {}),
        ),
      ),
    );
    expect(
      find.textContaining('do not assume publishing is paused'),
      findsOneWidget,
    );
    expect(find.textContaining('No approved scheduled work'), findsNothing);
  });
}
