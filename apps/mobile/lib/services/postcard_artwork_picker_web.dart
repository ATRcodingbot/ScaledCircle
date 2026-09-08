import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'package:web/web.dart' as web;

Future<List<Map<String, dynamic>>?> selectPostcardArtwork() async {
  final result = Completer<List<Map<String, dynamic>>?>();
  final input = web.HTMLInputElement()
    ..type = 'file'
    ..accept = '.pdf,.png,.jpg,.jpeg'
    ..multiple = true;
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
          final files = input.files;
          if (files == null || files.length == 0) {
            result.complete(null);
            return;
          }
          if (files.length > 2) {
            throw StateError('Choose the front and optional back only.');
          }
          var size = 0;
          final values = <Map<String, dynamic>>[];
          for (var i = 0; i < files.length; i++) {
            final f = files.item(i)!;
            size += f.size;
            if (size > 8 * 1024 * 1024) {
              throw StateError('Choose files totaling at most 8 MB.');
            }
            values.add({
              'name': f.name,
              'contentType': f.type,
              'base64': base64Encode(
                (await f.arrayBuffer().toDart).toDart.asUint8List(),
              ),
            });
          }
          result.complete(values);
        } catch (e, s) {
          if (!result.isCompleted) result.completeError(e, s);
        }
      }();
    }).toJS,
  );
  input.style.display = 'none';
  web.document.body!.appendChild(input);
  input.click();
  return result.future.whenComplete(() => input.remove());
}
