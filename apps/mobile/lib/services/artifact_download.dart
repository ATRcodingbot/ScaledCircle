import 'artifact_download_stub.dart'
    if (dart.library.js_interop) 'artifact_download_web.dart';

Future<void> downloadArtifact({
  required String filename,
  required String content,
  required String mimeType,
}) => downloadArtifactFile(
  filename: filename,
  content: content,
  mimeType: mimeType,
);
