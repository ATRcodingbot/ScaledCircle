import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/navigation/app_routes.dart';
import 'package:flutter_app/navigation/app_router.dart';
import 'package:flutter_app/navigation/protected_route_gate.dart';
import 'package:flutter_app/navigation/workspace_presentation.dart';
import 'package:flutter_app/widgets/campaign_material_source_options.dart';

void main() {
  test(
    'membership links reload with preserved sections and no paid-subscription requirement',
    () {
      for (final path in AppRoutes.membershipPaths) {
        for (final fragment in [path, path.substring(1)]) {
          final route = initialBillingRoute(
            Uri.parse('https://scaledcircle.com/#$fragment'),
          )!;
          expect(route.path, path);
          expect(
            WorkspacePresentation({
              'isOwner': true,
              'subscriptionActive': false,
              'complimentary': true,
            }).allowsRoute(route.toString()),
            isTrue,
          );
          expect(
            WorkspacePresentation({
              'permissions': ['billing'],
            }).allowsRoute(route.toString()),
            isTrue,
          );
          expect(
            WorkspacePresentation({
              'permissions': ['intelligence'],
            }).allowsRoute(route.toString()),
            isFalse,
          );
        }
      }
      expect(
        initialBillingRoute(
          Uri.parse('https://scaledcircle.com/#https://other.example/billing'),
        ),
        isNull,
      );
      expect(
        initialBillingRoute(
          Uri.parse('https://scaledcircle.com/#/business/membership/unknown'),
        ),
        isNull,
      );
      final source = File('lib/main.dart').readAsStringSync();
      expect(source, contains('AppRoutes.membershipPath(route?.path)'));
      expect(
        source,
        contains(
          "BusinessMembershipScreen(section: membershipPath.split('/').last)",
        ),
      );
    },
  );

  test(
    'growth aliases preserve Admin workspace without opening admin authority to customers',
    () {
      expect(
        profileAllowsAudience({
          'role': 'admin',
        }, ProtectedRouteAudience.business),
        isTrue,
      );
      expect(
        profileAllowsAudience({
          'role': 'business',
          'active': true,
        }, ProtectedRouteAudience.admin),
        isFalse,
      );
      final source = File('lib/main.dart').readAsStringSync();
      expect(source, contains("customer: profile['role'] != 'admin'"));
      expect(source, contains('ProtectedRouteAudience.admin'));
      expect(
        source,
        isNot(contains("customer: route?.path != '/growth-agents'")),
      );
    },
  );

  testWidgets(
    'printing is visibly unavailable while supported material choices work',
    (tester) async {
      String? selected;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DropdownButtonFormField<String>(
              initialValue: 'business_provided',
              items: campaignMaterialSourceOptions,
              onChanged: (value) => selected = value,
            ),
          ),
        ),
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      expect(find.text('ScaledCircle Printing — Coming Soon'), findsWidgets);
      expect(
        campaignMaterialSourceOptions
            .singleWhere((item) => item.value == 'printed_by_scaled_circle')
            .enabled,
        isFalse,
      );
      await tester.tap(
        find.text('ScaledCircle Printing — Coming Soon').last,
        warnIfMissed: false,
      );
      await tester.pumpAndSettle();
      expect(selected, isNull);
      await tester.tap(
        find.text('Create Tracked Materials with Scaled Circle').last,
      );
      await tester.pumpAndSettle();
      expect(selected, 'scaled_circle_generated');
      expect(
        campaignMaterialSourceOptions
            .singleWhere((item) => item.value == 'business_provided')
            .enabled,
        isTrue,
      );
      for (final path in [
        'lib/screens/business/create_campaign_screen.dart',
        'lib/screens/business/create/campaigns/flyer/flyer_campaign_screen.dart',
      ]) {
        expect(
          File(path).readAsStringSync(),
          contains('items: campaignMaterialSourceOptions'),
        );
      }
    },
  );
}
