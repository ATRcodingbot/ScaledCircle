import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/config/native_release_policy.dart';
import 'package:flutter_app/main.dart';
import 'package:flutter_app/navigation/native_unavailable_screen.dart';
import 'package:flutter_app/models/notification_destination.dart';
import 'package:flutter_app/services/business_email_service.dart';
import 'package:flutter_app/services/business_operations_service.dart';
import 'package:flutter_app/screens/business/business_schedule_screen.dart';
import 'package:flutter_app/screens/business/business_member_home.dart';
import 'business_schedule_test.dart' show FakeOperations;

class PremiumWorkspace extends FakeOperations {
  @override
  Future<Map<String, dynamic>> call(
    String businessId,
    String operation,
    Map<String, dynamic> input, {
    String? requestId,
  }) async {
    final result = await super.call(
      businessId,
      operation,
      input,
      requestId: requestId,
    );
    return operation == 'load' ? {...result, 'agentAvailable': true} : result;
  }
}

void main() {
  testWidgets('excluded native deep links stop before premium initialization', (
    tester,
  ) async {
    late BuildContext context;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (c) {
            context = c;
            return const SizedBox();
          },
        ),
      ),
    );
    for (final path in NativeReleasePolicy.webOnlyPaths) {
      for (final suffix in ['', '?item=existing&provider=instagram', '/']) {
        final location = '$path$suffix';
        expect(NativeReleasePolicy.allowsRoute(location), isFalse);
        expect(NativeReleasePolicy.allowsRoute(location, web: true), isTrue);
        final route =
            ScaledCircleApp.generateRoute(RouteSettings(name: location))
                as MaterialPageRoute;
        expect(route.builder(context), isA<NativeUnavailableScreen>());
      }
    }
    for (final path in [
      '/business',
      '/business/schedule',
      '/business/property',
      '/business/weather',
      '/billing',
      '/create-account',
      '/scaler',
      '/scaler/work',
      '/complete-scaler-profile',
      '/job-room/authorized',
    ]) {
      expect(NativeReleasePolicy.allowsRoute(path), isTrue);
    }
  });

  test(
    'premium notifications unavailable for native owners and members; web unchanged',
    () {
      for (final destination in [
        'business_email',
        'business_email_campaign',
        'social_review',
        'social_draft',
        'social_published',
        'business_growth_agents',
        'brand_assets',
        'landing_page',
      ]) {
        final data = {
          'deepLink': {
            'destination': destination,
            'provider': 'instagram',
            'itemId': 'item',
            'operationId': 'conversation',
            'pageId': 'page',
            'jobId': 'job',
          },
        };
        for (final workspace in <Map<String, dynamic>?>[
          null,
          {'isOwner': true},
          {
            'isOwner': false,
            'permissions': ['intelligence'],
          },
        ]) {
          expect(workspaceNotificationDestination(data, workspace), isNull);
          expect(
            workspaceNotificationDestination(data, workspace, web: true),
            isNotNull,
          );
        }
      }
      expect(
        workspaceNotificationDestination(
          {
            'deepLink': {
              'destination': 'business_schedule',
              'businessId': 'owner',
              'itemId': 'same',
            },
          },
          {'isOwner': true},
        )?.route,
        '/business/schedule?workspace=owner&item=same',
      );
      expect(
        workspaceNotificationDestination(
          {
            'deepLink': {'destination': 'business_schedule'},
          },
          {'isOwner': false, 'permissions': []},
        ),
        isNull,
      );
    },
  );

  test(
    'native premium actions fail before Firebase or providers initialize',
    () async {
      for (final operation in [
        'load',
        'connect',
        'approveAndSend',
        'authorizeAssistance',
      ]) {
        await expectLater(
          BusinessEmailService().call(operation),
          throwsStateError,
        );
      }
      for (final operation in ['propose', 'linkEmailThread']) {
        await expectLater(
          BusinessOperationsService().call('owner', operation, {}),
          throwsStateError,
        );
      }
      expect(NativeReleasePolicy.requirePremiumWeb, throwsStateError);
    },
  );

  testWidgets(
    'premium owner retains native Core Schedule without premium actions',
    (tester) async {
      final service = PremiumWorkspace();
      service.existingItems.add({
        'id': 'linked',
        'title': 'Existing meeting',
        'type': 'meeting',
        'status': 'scheduled',
        'startMs': DateTime.now().millisecondsSinceEpoch,
        'durationMinutes': 15,
        'assignedLabels': <String>[],
        'emailLink': {'operationId': 'private-conversation'},
      });
      await tester.binding.setSurfaceSize(const Size(1000, 1400));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessScheduleScreen(businessId: 'owner', service: service),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Add to schedule'), findsOneWidget);
      expect(find.text('View conversation'), findsNothing);
      expect(find.text('Prepare with Growth · Private Beta'), findsNothing);
      expect(service.calls, ['load']);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('intelligence-only native member retains Property/Weather', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: BusinessWorkspaceHome(
          workspace: {
            'isOwner': false,
            'businessName': 'Isolated Core',
            'permissions': ['intelligence'],
          },
          ownerBuilder: (_) => const SizedBox(),
          scheduleBuilder: (_) => const SizedBox(),
        ),
      ),
    );
    expect(find.text('Growth'), findsNothing);
    expect(find.text('Property'), findsOneWidget);
    expect(find.text('Weather'), findsOneWidget);
  });
}
