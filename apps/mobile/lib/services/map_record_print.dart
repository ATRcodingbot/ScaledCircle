import 'map_record_print_stub.dart'
    if (dart.library.js_interop) 'map_record_print_web.dart';

Future<void> printMapPng(String pngBase64) => openMapPrint(pngBase64);
