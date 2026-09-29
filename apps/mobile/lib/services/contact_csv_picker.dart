import 'contact_csv_picker_stub.dart'
    if (dart.library.js_interop) 'contact_csv_picker_web.dart';

Future<({String name, String text})?> pickContactCsv() => pickCsv();
