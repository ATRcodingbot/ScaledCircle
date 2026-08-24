import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/sales_home_screen.dart';
import 'package:flutter_app/services/sales_service.dart';

void main() {
  testWidgets('empty Sales funnel is intentional and simple', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SalesPipelineContent(
            pipeline: const SalesPipeline(
              leads: [],
              summary: {},
              recentActivity: [],
            ),
            onOpen: (_) {},
          ),
        ),
      ),
    );
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Pipeline'), findsOneWidget);
    expect(find.text('Recent'), findsOneWidget);
    expect(find.text('No Sales activity recorded yet.'), findsOneWidget);
    expect(find.text('No prospects yet.'), findsOneWidget);
    expect(find.textContaining('Firestore'), findsNothing);
  });

  testWidgets('Sales Home renders recent activity without backend IDs', (
    tester,
  ) async {
    const lead = SalesLead(
      id: 'private-lead-id',
      businessName: 'QA Roofing',
      stage: 'contacted',
      priority: 'normal',
      mayContact: true,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SalesPipelineContent(
            pipeline: const SalesPipeline(
              leads: [lead],
              summary: {},
              recentActivity: [
                {
                  'leadId': 'private-lead-id',
                  'type': 'note',
                  'summary': 'Internal QA only',
                  'occurredAt': 1787530000000,
                },
              ],
            ),
            onOpen: (_) {},
          ),
        ),
      ),
    );
    expect(find.text('QA Roofing • Note'), findsOneWidget);
    expect(find.textContaining('Internal QA only'), findsOneWidget);
    expect(find.text('private-lead-id'), findsNothing);
  });

  testWidgets(
    'responsive Sales list shows stage, follow-up, and suppression without internals',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      const lead = SalesLead(
        id: 'internal-id',
        businessName: 'QA Roofing',
        stage: 'interested',
        priority: 'high',
        mayContact: false,
        industry: 'Roofing',
        followUpBucket: 'overdue',
        suppressionStatus: 'opted_out',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SalesPipelineContent(
              pipeline: const SalesPipeline(
                leads: [lead],
                summary: {
                  'counts': {'interested': 1},
                },
                recentActivity: [],
              ),
              onOpen: (_) {},
            ),
          ),
        ),
      );
      expect(find.text('QA Roofing'), findsWidgets);
      expect(find.textContaining('Do not contact'), findsWidgets);
      expect(find.text('Interested  1'), findsOneWidget);
      expect(find.text('internal-id'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  test('service parser keeps only the redacted callable contract', () {
    final pipeline = SalesPipeline.fromMap({
      'leads': [
        {
          'leadId': 'one',
          'businessName': 'One',
          'stage': 'paid',
          'priority': 'normal',
          'mayContact': true,
          'stripeSecret': 'hidden',
        },
      ],
      'summary': {
        'counts': {'paid': 1},
      },
      'recentActivity': [],
    });
    expect(pipeline.leads.single.stage, 'paid');
    expect(pipeline.leads.single.businessName, 'One');
  });
}
