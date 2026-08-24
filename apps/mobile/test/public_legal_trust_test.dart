import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/public/legal_document_screen.dart';
import 'package:flutter_app/screens/public/public_legal_footer.dart';

void main() {
  Future<void> pumpLegal(WidgetTester tester, LegalDocumentKind kind, {Size size = const Size(1000, 900)}) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home: LegalDocumentScreen(kind: kind)));
    await tester.pumpAndSettle();
  }

  testWidgets('public legal pages expose canonical identity and support', (tester) async {
    await pumpLegal(tester, LegalDocumentKind.hub);
    expect(find.text('Legal & Trust'), findsOneWidget);
    expect(find.textContaining('operated by Scaled Circle LLC'), findsWidgets);
    expect(find.text('Terms of Service'), findsWidgets);
    expect(find.text('Privacy Policy'), findsWidgets);
    expect(find.text('Payments & Refunds'), findsWidgets);
    expect(find.text('Support'), findsWidgets);
  });

  test('payment policy preserves authoritative financial distinctions', () {
    final source = File('lib/screens/public/legal_document_screen.dart').readAsStringSync();
    expect(source, contains('Business credits are retired'));
    expect(source, contains('20% of worker compensation'));
    expect(source, contains('Social advertising spend has a 0%'));
    expect(source, contains('not erased by ordinary Business self-service cancellation'));
  });

  test('Scaler terms avoid guaranteed payout and explain tracked work', () {
    final source = File('lib/screens/public/legal_document_screen.dart').readAsStringSync();
    expect(source, contains('Scaler Work & Earnings Agreement'));
    expect(source, contains('guarantees jobs, hours, income'));
    expect(source, contains('payout are separate lifecycle states'));
  });

  test('signup requires explicit legal acceptance links for each role', () {
    final source = File('lib/screens/auth/register_screen.dart').readAsStringSync();
    expect(source, contains("Key('signup-legal-acceptance')"));
    expect(source, contains('Read Terms'));
    expect(source, contains('Read Privacy Policy'));
    expect(source, contains('Scaler Work & Earnings'));
    expect(source, contains('at least 18'));
    expect(source, contains('authorized to act for this Business'));
  });

  test('founder-approved age and Business capacity wording remains counsel flagged', () {
    final source = File('lib/screens/public/legal_document_screen.dart').readAsStringSync();
    expect(source, contains('Account holders must be at least 18 years old'));
    expect(source, contains('authorized to act for and bind the Business'));
    expect(source, contains('professional legal review before official broad public launch'));
  });

  testWidgets('footer links remain reachable at mobile width', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: PublicLegalFooter())));
    expect(find.text('Terms'), findsOneWidget);
    expect(find.text('Privacy'), findsOneWidget);
    expect(find.text('Payments & Refunds'), findsOneWidget);
    expect(find.text('Support'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
