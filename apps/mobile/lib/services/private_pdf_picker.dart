import 'dart:typed_data';
import 'private_pdf_picker_stub.dart'
    if (dart.library.js_interop) 'private_pdf_picker_web.dart';

Future<Uint8List?> pickPrivatePdf() => selectPrivatePdf();
