import 'dart:typed_data';

import 'binary_artifact_download_stub.dart'
    if (dart.library.js_interop) 'binary_artifact_download_web.dart';

Future<void> downloadBinaryArtifact({
  required String filename,
  required Uint8List bytes,
  required String mimeType,
}) => downloadBinaryArtifactFile(
  filename: filename,
  bytes: bytes,
  mimeType: mimeType,
);
