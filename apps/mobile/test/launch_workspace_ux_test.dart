import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/startup_session_gate.dart';
import 'package:flutter_app/screens/business/business_team_screen.dart';
import 'package:flutter_app/screens/business/business_membership_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';
import 'package:flutter_app/widgets/automatic_canvassing_progress.dart';

class FakeWorkspace extends BusinessWorkspaceService {
  final Map<String, dynamic> data;
  final calls = <String>[];
  FakeWorkspace(this.data);
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add(name);
    return data;
  }
}

Map<String, dynamic> signed(String role) => {
  'signedIn': true,
  'emailVerified': true,
  'profile': {'role': role, 'active': true},
  'missingAgreements': <String>[],
  'workProfileComplete': true,
};
void main() {
  test(
    'canonical startup handles roles, profile, consent and signed out deterministically',
    () {
      expect(
        resolveStartupDestination({'signedIn': false}),
        StartupDestination.signedOut,
      );
      for (final pair in [
        ('business', StartupDestination.business),
        ('scaler', StartupDestination.scaler),
        ('admin', StartupDestination.admin),
      ]) {
        expect(resolveStartupDestination(signed(pair.$1)), pair.$2);
      }
      expect(
        resolveStartupDestination({
          ...signed('scaler'),
          'workProfileComplete': false,
        }),
        StartupDestination.scalerProfile,
      );
      expect(
        resolveStartupDestination({
          ...signed('business'),
          'missingAgreements': ['privacy'],
        }),
        StartupDestination.consent,
      );
      expect(
        resolveStartupDestination({
          ...signed('business'),
          'workspaceReady': true,
          'missingAgreements': ['privacy'],
        }),
        StartupDestination.consent,
      );
      expect(
        resolveStartupDestination({
          ...signed('business'),
          'emailVerified': false,
        }),
        StartupDestination.verifyEmail,
      );
      expect(
        resolveStartupDestination({...signed('business'), 'profile': null}),
        StartupDestination.profileMissing,
      );
      expect(
        resolveStartupDestination({
          ...signed('scaler'),
          'profile': {'role': 'scaler', 'active': false},
        }),
        StartupDestination.pending,
      );
      expect(
        resolveStartupDestination({
          ...signed('business'),
          'profile': {'role': 'business', 'active': false},
          'workspaceReady': true,
        }),
        StartupDestination.business,
      );
    },
  );
  testWidgets(
    'auth resolution paints no marketing/login before Business routing',
    (t) async {
      final load = Completer<Map<String, dynamic>>();
      await t.pumpWidget(
        MaterialApp(
          home: StartupSessionGate(
            load: () => load.future,
            signedOut: const Text('PUBLIC MARKETING'),
          ),
          routes: {
            '/business': (_) => const Scaffold(body: Text('BUSINESS HOME')),
          },
        ),
      );
      expect(find.text('Opening ScaledCircle…'), findsOneWidget);
      expect(find.text('PUBLIC MARKETING'), findsNothing);
      load.complete(signed('business'));
      await t.pumpAndSettle();
      expect(find.text('BUSINESS HOME'), findsOneWidget);
      expect(find.text('PUBLIC MARKETING'), findsNothing);
    },
  );
  testWidgets(
    'failed startup has visible Retry and resolves without indefinite loader',
    (t) async {
      var calls = 0;
      await t.pumpWidget(
        MaterialApp(
          home: StartupSessionGate(
            load: () async {
              if (calls++ == 0) throw StateError('read failed');
              return {'signedIn': false};
            },
            signedOut: const Text('PUBLIC HOME'),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      await t.tap(find.text('Retry'));
      await t.pumpAndSettle();
      expect(find.text('PUBLIC HOME'), findsOneWidget);
    },
  );
  for (final width in [360.0, 1024.0]) {
    testWidgets(
      'Team is responsive with owner counted and no unauthorized edit at $width',
      (t) async {
        t.view.physicalSize = Size(width, 900);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.resetPhysicalSize);
        addTearDown(t.view.resetDevicePixelRatio);
        final service = FakeWorkspace({
          'seatsUsed': 2,
          'seatLimit': 3,
          'seatsReserved': 0,
          'permissions': ['analytics'],
          'owner': {'name': 'Owner'},
          'members': [
            {
              'uid': 'member',
              'name': 'Teammate',
              'email': 'teammate@example.test',
              'status': 'active',
              'permissions': ['analytics'],
            },
          ],
          'invitations': [],
        });
        await t.pumpWidget(
          MaterialApp(
            home: BusinessTeamScreen(service: service, businessId: 'business'),
          ),
        );
        await t.pumpAndSettle();
        expect(find.text('2 of 3 seats used'), findsOneWidget);
        expect(find.text('Invite Team Member'), findsNothing);
        expect(find.byType(PopupMenuButton<String>), findsNothing);
        expect(t.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'cancellation is visible and requires explicit final confirmation',
    (t) async {
      final service = FakeWorkspace({
        'planName': 'Growth',
        'price': 299,
        'plan': 'growth',
        'periodEndMs': DateTime(2026, 10, 8).millisecondsSinceEpoch,
        'paidAccess': true,
        'canCancel': true,
      });
      await t.pumpWidget(
        MaterialApp(
          home: BusinessMembershipScreen(
            service: service,
            businessId: 'business',
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.tap(find.text('Cancel Membership'));
      await t.pumpAndSettle();
      expect(service.calls, ['getBusinessMembership']);
      expect(
        find.textContaining('Funded campaigns, accepted Scaler compensation'),
        findsOneWidget,
      );
      await t.tap(find.text('Keep Current Settings'));
      await t.pumpAndSettle();
      expect(service.calls, ['getBusinessMembership']);
    },
  );
  for (final percent in [79.99, 80.0, 94.99, 95.0, 100.0]) {
    testWidgets(
      'automatic progress displays authoritative thresholds at $percent',
      (t) async {
        await t.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: AutomaticCanvassingProgress(
                progress: {'state': 'available', 'coveragePercentage': percent},
                contract: {'baseAmountCents': 1500, 'bonusAmountCents': 300},
              ),
            ),
          ),
        );
        expect(
          find.text('Base Pay Secured ✓'),
          percent >= 80 ? findsOneWidget : findsNothing,
        );
        expect(
          find.text('Coverage Bonus Earned ✓'),
          percent >= 95 ? findsOneWidget : findsNothing,
        );
        expect(find.text('Mark Progress'), findsNothing);
        expect(find.text('Base Pay: \$15.00'), findsOneWidget);
      },
    );
  }
}
