import 'postcard_artwork_picker_native.dart'
    if (dart.library.js_interop) 'postcard_artwork_picker_web.dart';

Future<List<Map<String, dynamic>>?> pickPostcardArtwork() =>
    selectPostcardArtwork();
