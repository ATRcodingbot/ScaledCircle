// ignore_for_file: depend_on_referenced_packages
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/contact_csv_actions.dart';
import 'package:flutter_app/services/business_operations_service.dart';
import 'package:flutter_app/screens/auth/login_screen.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'cancellation_login_return_test.dart' show LocalCore, LocalAuth;

class CsvFixture extends BusinessOperationsService {
  final calls = <String>[], inputs = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> call(
    String b,
    String op,
    Map<String, dynamic> input, {
    String? requestId,
  }) async {
    expect(b, 'fixture');
    calls.add(op);
    inputs.add(input);
    switch (op) {
      case 'inspectContactCsv':
        return {
          'headers': ['Name', 'Email'],
          'mapping': ['name', 'email'],
          'fields': {'name': 'Customer name', 'email': 'Email'},
          'rowCount': 2,
        };
      case 'previewContactImport':
        return {
          'previewId': 'preview1',
          'rows': [
            {
              'row': 2,
              'name': 'New fixture',
              'kind': 'new',
              'changes': {'name': 'New fixture'},
            },
            {
              'row': 3,
              'name': 'Existing fixture',
              'kind': 'matched',
              'changes': {'email': 'new@example.test'},
            },
          ],
        };
      case 'commitContactImport':
        return {
          'previewId': 'preview1',
          'complete': true,
          'processed': 2,
          'created': 1,
          'matched': 1,
          'updated': 0,
          'skipped': 1,
          'duplicate': 0,
          'failed': 0,
          'unauthorizedWrites': 0,
        };
      case 'exportContacts':
        return {
          'csv':
              '\uFEFF"Customer name","Email"\r\n"José","jose@example.test"\r\n',
          'count': 1,
          'filename': 'contacts.csv',
        };
    }
    return {};
  }
}

void main() {
  testWidgets(
    'CSV mapping preview requires confirmation, defaults matches to Skip, downloads UTF8 content',
    (t) async {
      final s = CsvFixture(), downloads = <String>[];
      await t.binding.setSurfaceSize(const Size(1100, 1400));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ContactCsvActions(
              businessId: 'fixture',
              service: s,
              canImport: true,
              search: 'jose',
              filter: 'All',
              onChanged: () async {},
              pickFile: () async => (
                name: 'fixture.csv',
                text: 'Name,Email\nFixture,fixture@example.test',
              ),
              download:
                  ({
                    required filename,
                    required content,
                    required mimeType,
                  }) async {
                    downloads.add(content);
                    expect(mimeType, 'text/csv');
                  },
            ),
          ),
        ),
      );
      await t.tap(find.text('Import CSV'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 400));
      expect(find.text('Map CSV columns'), findsOneWidget);
      expect(s.calls, ['inspectContactCsv']);
      await t.tap(find.text('Preview'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 400));
      expect(s.calls, ['inspectContactCsv', 'previewContactImport']);
      expect(find.text('Confirm import'), findsOneWidget);
      await t.tap(find.text('Confirm import'));
      await t.pumpAndSettle();
      expect(s.inputs.last['decisions'], ['create', 'skip']);
      expect(find.textContaining('1 created'), findsOneWidget);
      await t.tap(find.text('Export filtered CSV'));
      await t.pumpAndSettle();
      expect(s.inputs.last, {'search': 'jose', 'filter': 'All'});
      expect(downloads.single, contains('José'));
    },
  );
  testWidgets(
    'Email deep link survives successful Login instead of generic dashboard',
    (t) async {
      final core = FirebasePlatform.instance,
          auth = FirebaseAuthPlatform.instance;
      FirebasePlatform.instance = LocalCore();
      FirebaseAuthPlatform.instance = LocalAuth();
      addTearDown(() {
        FirebasePlatform.instance = core;
        FirebaseAuthPlatform.instance = auth;
      });
      await t.binding.setSurfaceSize(const Size(700, 1200));
      addTearDown(() => t.binding.setSurfaceSize(null));
      await t.pumpWidget(
        MaterialApp(
          home: const LoginScreen(returnRoute: '/business/email-connection'),
          routes: {
            '/business/email-connection': (_) =>
                const Scaffold(body: Text('Email portal returned')),
            '/business': (_) => const Scaffold(body: Text('Generic home')),
          },
        ),
      );
      await t.enterText(find.byType(TextField).at(0), 'owner@example.test');
      await t.enterText(find.byType(TextField).at(1), 'fixture-only');
      await t.tap(find.text('Login'));
      await t.pumpAndSettle();
      expect(find.text('Email portal returned'), findsOneWidget);
      expect(find.text('Generic home'), findsNothing);
    },
  );
}
