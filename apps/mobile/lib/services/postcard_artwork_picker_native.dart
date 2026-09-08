import 'dart:convert';
import 'package:image_picker/image_picker.dart';

Future<List<Map<String, dynamic>>?> selectPostcardArtwork() async {
  final image = await ImagePicker().pickImage(source: ImageSource.gallery);
  if (image == null) return null;
  final bytes = await image.readAsBytes();
  if (bytes.length > 8 * 1024 * 1024) {
    throw StateError('Choose artwork up to 8 MB.');
  }
  return [
    {'name': image.name, 'base64': base64Encode(bytes)},
  ];
}
