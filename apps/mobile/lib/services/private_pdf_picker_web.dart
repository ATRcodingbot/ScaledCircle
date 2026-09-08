import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';
import 'package:web/web.dart' as web;

Future<Uint8List?> selectPrivatePdf() async {
  final result = Completer<Uint8List?>();
  final input = web.HTMLInputElement()
    ..type = 'file'
    ..accept = 'application/pdf';
  input.addEventListener(
    'cancel',
    ((web.Event _) {
      if (!result.isCompleted) result.complete(null);
    }).toJS,
  );
  input.addEventListener(
    'change',
    ((web.Event _) {
      () async {
        try {
          final file = input.files?.item(0);
          if (file == null) {
            result.complete(null);
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            throw StateError('Choose a PDF up to 5 MB.');
          }
          result.complete(
            (await file.arrayBuffer().toDart).toDart.asUint8List(),
          );
        } catch (e, s) {
          if (!result.isCompleted) result.completeError(e, s);
        }
      }();
    }).toJS,
  );
  input.click();
  return result.future;
}
