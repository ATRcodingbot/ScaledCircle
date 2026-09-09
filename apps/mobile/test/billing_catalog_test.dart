import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/billing_selection_editor.dart';
import 'package:flutter_app/screens/business/business_membership_screen.dart';
import 'package:flutter_app/services/business_workspace_service.dart';

class CatalogWorkspace extends BusinessWorkspaceService {
  final calls = <(String, Map<String, dynamic>)>[];
  @override
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> input = const {},
  ]) async {
    calls.add((name, input));
    if (name == 'previewBusinessMembershipChange') {
      return {
        'quoteId': 'quote_verified',
        'monthlyCents': 200000,
        'amountDueCents': 200000,
        'seatLimit': 10,
        'effectiveAtMs': DateTime(2026, 10, 9).millisecondsSinceEpoch,
      };
    }
    return {
      'plan': 'managed_growth',
      'planName': 'Managed Growth',
      'price': 2097,
      'bundle': null,
      'addons': ['business_assistant', 'lead_generation_research'],
      'periodEndMs': DateTime(2026, 10, 9).millisecondsSinceEpoch,
      'paidAccess': true,
      'canCancel': true,
      'cancelAtPeriodEnd': false,
    };
  }
}

void main() {
  for (final width in [390.0, 1280.0]) {
    testWidgets('base/add-on/bundle selection is responsive at $width', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(Size(width, 1800));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      Map<String, dynamic>? selected;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: BillingSelectionEditor(
                onChanged: (value) => selected = value,
              ),
            ),
          ),
        ),
      );
      expect(find.text('Choose your plan'), findsOneWidget);
      expect(find.text('Add more intelligence'), findsOneWidget);
      expect(
        find.textContaining('does not authorize outreach'),
        findsOneWidget,
      );
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(selected, {'bundle': 'growth_department'});
      for (final tile in tester.widgetList<CheckboxListTile>(
        find.byType(CheckboxListTile),
      )) {
        expect(tile.value, true);
        expect(tile.onChanged, isNull);
      }
      expect(find.textContaining('Save \$97/month'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'membership change requires server preview and explicit boundary confirmation',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(700, 2000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final service = CatalogWorkspace();
      await tester.pumpWidget(
        MaterialApp(
          home: BusinessMembershipScreen(
            service: service,
            businessId: 'business',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(Switch));
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Review Plan & Add-on Changes'));
      await tester.tap(find.text('Review Plan & Add-on Changes'));
      await tester.pumpAndSettle();
      expect(find.textContaining('2000.00/month'), findsOneWidget);
      expect(find.textContaining('No change charge today'), findsOneWidget);
      expect(
        service.calls.where((c) => c.$1 == 'changeBusinessMembership'),
        isEmpty,
      );
      await tester.tap(find.text('Confirm Change at Renewal'));
      await tester.pumpAndSettle();
      final request = service.calls
          .singleWhere((c) => c.$1 == 'changeBusinessMembership')
          .$2;
      expect(request['quoteId'], 'quote_verified');
      expect(request['action'], 'changeSelection');
      expect(request.containsKey('priceId'), false);
      expect(tester.takeException(), isNull);
    },
  );
}
