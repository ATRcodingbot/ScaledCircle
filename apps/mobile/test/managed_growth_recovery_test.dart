import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/managed_growth_screen.dart';
import 'package:flutter_app/services/managed_growth_service.dart';

class _GrowthService implements ManagedGrowthService {
  bool fail = true;
  bool hang = false;
  final pendingProfile = Completer<BusinessGrowthProfile?>();
  int loads = 0;
  @override
  Future<BusinessGrowthProfile?> loadProfile() async {
    loads++;
    if (hang) return pendingProfile.future;
    if (fail) throw StateError('private provider diagnostic');
    return null;
  }

  @override
  Future<String?> loadArtifactDeliveryEmail() async => null;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('failed load is recoverable and retry renders first-time setup', (
    tester,
  ) async {
    final service = _GrowthService();
    await tester.pumpWidget(
      MaterialApp(home: ManagedGrowthScreen(service: service)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(
      find.textContaining('Unable to load your growth workspace'),
      findsOneWidget,
    );
    expect(find.textContaining('private provider diagnostic'), findsNothing);
    service.fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(service.loads, 2);
    await tester.scrollUntilVisible(
      find.text('Set Up Your Growth Profile'),
      400,
    );
    expect(find.text('Set Up Your Growth Profile'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('unresolved load reaches error and ignores its late result', (
    tester,
  ) async {
    final service = _GrowthService()..hang = true;
    await tester.pumpWidget(
      MaterialApp(home: ManagedGrowthScreen(service: service)),
    );
    await tester.pump(const Duration(seconds: 31));
    await tester.pump();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    service.pendingProfile.complete(null);
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text('Set Up Your Growth Profile'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
