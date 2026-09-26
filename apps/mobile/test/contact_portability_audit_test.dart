import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/business_email_campaign_screen.dart';
void main() {
  test('existing TSV importer preserves Unicode, CRLF and source detail', () {
    final rows = campaignImportRows('José\tjose@example.test\t2026-09-26\tDeck, repair\r\nLee\tlee@example.test\t2026-09-25\tFence');
    expect(rows.length, 2); expect(rows.first['name'], 'José'); expect(rows.first['context'], 'Deck, repair');
  });
  test('ordinary and malformed CSV are not supported by the TSV importer', () {
    for (final csv in ['Name,Email,Source date,Notes\r\nPat,pat@example.test,2026-09-26,Inquiry','"Pat, Smith",pat@example.test,2026-09-26,"Deck\nrepair"','"unterminated,pat@example.test,2026-09-26,Inquiry','']) {
      expect(() => campaignImportRows(csv), throwsFormatException);
    }
  });
}
