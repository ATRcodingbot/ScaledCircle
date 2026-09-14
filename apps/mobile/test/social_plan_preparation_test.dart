import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/social_operations_screen.dart';
import 'package:flutter_app/services/social_operations_service.dart';

class PlanPreparationService extends SocialOperationsService {
  PlanPreparationService({this.entitled = true});
  final bool entitled;
  final calls = <String>[];
  final preparation = Completer<void>();

  @override
  Future<SocialOperationsWorkspace> load() async {
    calls.add('load');
    return SocialOperationsWorkspace({
      'managedPublishingAvailable': entitled,
      'plans': <Map<String, dynamic>>[],
    });
  }

  @override
  Future<void> prepareCustomerPlan() {
    calls.add('prepareCustomerPlan');
    return preparation.future;
  }
}

void main() {
  Future<void> mount(
    WidgetTester tester,
    PlanPreparationService service,
  ) async {
    await tester.binding.setSurfaceSize(const Size(900, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(home: SocialOperationsScreen(service: service)),
    );
    await tester.pumpAndSettle();
  }

  for (final label in ['Start Plan', 'Prepare my 30-day draft strategy']) {
    testWidgets(
      '$label prepares once and reloads without approving or scheduling',
      (tester) async {
        final service = PlanPreparationService();
        await mount(tester, service);
        final button = find.ancestor(
          of: find.text(label),
          matching: find.byType(FilledButton),
        );
        final press = tester.widget<FilledButton>(button).onPressed!;
        press();
        press();
        await tester.pump();
        expect(service.calls, ['load', 'prepareCustomerPlan']);
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        service.preparation.complete();
        await tester.pumpAndSettle();
        expect(service.calls, ['load', 'prepareCustomerPlan', 'load']);
        expect(find.text('Start a 30-day content plan'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('workspace entitlement disables both plan preparation entries', (
    tester,
  ) async {
    final service = PlanPreparationService(entitled: false);
    await mount(tester, service);
    expect(find.text('Prepare my 30-day draft strategy'), findsNothing);
    final button = find.ancestor(
      of: find.text('Start Plan'),
      matching: find.byType(FilledButton),
    );
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    expect(service.calls, ['load']);
  });

  testWidgets(
    'preparation failure releases loading and asks for saved-state verification',
    (tester) async {
      final service = PlanPreparationService();
      await mount(tester, service);
      await tester.tap(find.text('Start Plan'));
      await tester.pump();
      service.preparation.completeError(StateError('provider unavailable'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Refresh to check saved plans before retrying.'),
        findsOneWidget,
      );
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(service.calls, ['load', 'prepareCustomerPlan']);
      expect(tester.takeException(), isNull);
    },
  );
}
