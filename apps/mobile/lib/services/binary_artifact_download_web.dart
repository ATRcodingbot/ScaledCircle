import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

Future<void> downloadBinaryArtifactFile({
  required String filename,
  required Uint8List bytes,
  required String mimeType,
}) async {
  final blob = web.Blob(
    <web.BlobPart>[bytes.toJS as web.BlobPart].toJS,
    web.BlobPropertyBag(type: mimeType),
  );
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = filename
    ..style.display = 'none';
  web.document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  await Future<void>.delayed(const Duration(seconds: 1));
  web.URL.revokeObjectURL(url);
}
