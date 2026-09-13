import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/admin/staging_payment_certification_screen.dart';

void main() {
  Map<String, dynamic> state(
    String role,
    String status,
    List<String> actions,
  ) => {
    'role': role,
    'status': status,
    'actions': actions,
    'task': 'Inspect the payment certification flow.',
    'fundingStatus': 'funded',
    'notes': '',
  };
  testWidgets('production never invokes the staging authority', (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: StagingPaymentCertificationScreen(
          staging: false,
          call: (_) async {
            calls++;
            return {};
          },
        ),
      ),
    );
    expect(find.text('Unavailable in production'), findsOneWidget);
    expect(calls, 0);
  });
  testWidgets(
    'accepted task uses written observations without GPS, camera or Start Job',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: StagingPaymentCertificationScreen(
            staging: true,
            call: (_) async => state('scaler', 'accepted', ['submit']),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('LIVE payments are blocked'), findsOneWidget);
      expect(
        find.textContaining('Fixed compensation: \$5.00 TEST'),
        findsOneWidget,
      );
      expect(
        find.textContaining('does not come out of the Scaler'),
        findsOneWidget,
      );
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Start Job'), findsNothing);
      expect(find.text('Add GPS Checkpoint'), findsNothing);
    },
  );
  testWidgets(
    'Business sees actual notes and exact compensation before explicit approval; cancellation sends nothing',
    (tester) async {
      final calls = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: StagingPaymentCertificationScreen(
            staging: true,
            call: (input) async {
              calls.add(input['action'] as String);
              return {
                ...state('business', 'submitted', ['approve']),
                'notes':
                    'Observed the real task and Wallet screen. No bank transfer yet.',
              };
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Observed the real task'), findsOneWidget);
      await tester.ensureVisible(find.text('Approve \$5 TEST compensation'));
      await tester.tap(find.text('Approve \$5 TEST compensation'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('This does not execute a cash-out.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Back').last);
      await tester.pumpAndSettle();
      expect(calls, ['get']);
    },
  );
  testWidgets('narrow large-text layout and error recovery remain usable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: StagingPaymentCertificationScreen(
          staging: true,
          call: (_) async => throw Exception('offline'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Refresh before retrying'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

