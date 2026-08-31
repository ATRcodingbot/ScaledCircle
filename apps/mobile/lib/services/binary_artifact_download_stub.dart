import 'dart:typed_data';

import 'package:printing/printing.dart';

Future<void> downloadBinaryArtifactFile({
  required String filename,
  required Uint8List bytes,
  required String mimeType,
}) async {
  if (mimeType != 'application/pdf') {
    throw UnsupportedError('Digital image download is available on web.');
  }
  await Printing.sharePdf(bytes: bytes, filename: filename);
}
