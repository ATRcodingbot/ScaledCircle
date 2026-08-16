import 'dart:js_interop';

import 'package:web/web.dart' as web;

Future<void> downloadArtifactFile({
  required String filename,
  required String content,
  required String mimeType,
}) async {
  final blob = web.Blob(
    <web.BlobPart>[content.toJS as web.BlobPart].toJS,
    web.BlobPropertyBag(type: '$mimeType;charset=utf-8'),
  );
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = filename
    ..style.display = 'none';
  web.document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  web.URL.revokeObjectURL(url);
}
