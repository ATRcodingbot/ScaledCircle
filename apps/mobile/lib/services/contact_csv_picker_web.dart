import 'dart:async';
import 'dart:js_interop';
import 'package:web/web.dart' as web;

Future<({String name, String text})?> pickCsv() async {
  final result = Completer<({String name, String text})?>();
  final input = web.HTMLInputElement()
    ..type = 'file'
    ..accept = '.csv,text/csv';
  input.addEventListener(
    'cancel',
    ((web.Event e) {
      if (!result.isCompleted) result.complete(null);
    }).toJS,
  );
  input.addEventListener(
    'change',
    ((web.Event e) {
      unawaited(() async {
        try {
          final file = input.files?.item(0);
          if (file == null) {
            result.complete(null);
            return;
          }
          if (!file.name.toLowerCase().endsWith('.csv') || file.size > 256000) {
            throw const FormatException('Choose a CSV file up to 256 KB.');
          }
          final text = (await file.text().toDart).toDart;
          result.complete((name: file.name, text: text));
        } catch (e) {
          result.completeError(e);
        }
      }());
    }).toJS,
  );
  input.click();
  return result.future;
}
