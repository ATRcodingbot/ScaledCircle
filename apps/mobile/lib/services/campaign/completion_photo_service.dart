import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

class CompletionPhotoService {
  CompletionPhotoService({FirebaseStorage? storage, ImagePicker? picker})
    : _storage = storage ?? FirebaseStorage.instance,
      _picker = picker ?? ImagePicker();

  final FirebaseStorage _storage;
  final ImagePicker _picker;

  /// Take a photo using device camera
  Future<XFile?> takePhoto() async {
    return _picker.pickImage(source: ImageSource.camera, imageQuality: 85);
  }

  /// Select photo from gallery
  Future<XFile?> pickPhoto() async {
    return _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
  }

  /// Upload completion proof photo
  ///
  /// Storage:
  /// completionProofs/
  ///   campaignId/
  ///     scalerId/
  ///       completionId/
  ///         proofType/
  ///           photo.jpg
  ///
  Future<String> uploadCompletionPhoto({
    required String campaignId,
    required String scalerId,
    required String completionId,
    required String proofType,
    String? campaignLocationId,
    required XFile photo,
  }) async {
    if (campaignId.trim().isEmpty) {
      throw Exception('Campaign ID is required.');
    }

    if (scalerId.trim().isEmpty) {
      throw Exception('Scaler ID is required.');
    }

    if (completionId.trim().isEmpty) {
      throw Exception('Completion ID is required.');
    }

    if (proofType.trim().isEmpty) {
      throw Exception('Proof type is required.');
    }

    final timestamp = DateTime.now().millisecondsSinceEpoch.toString();

    final fileName = '${timestamp}_${photo.name}';

    final finalFileName =
        campaignLocationId != null && campaignLocationId.trim().isNotEmpty
        ? '${campaignLocationId}_$fileName'
        : fileName;

    final reference = _storage
        .ref()
        .child('completionProofs')
        .child(campaignId)
        .child(scalerId)
        .child(completionId)
        .child(proofType)
        .child(finalFileName);

    await reference.putData(
      await photo.readAsBytes(),
      SettableMetadata(
        contentType: 'image/jpeg',
        customMetadata: {
          'campaignId': campaignId,
          'scalerId': scalerId,
          'completionId': completionId,
          'proofType': proofType,
          'campaignLocationId': ?campaignLocationId,
        },
      ),
    );

    return reference.getDownloadURL();
  }

  /// Upload multiple completion photos
  Future<List<String>> uploadCompletionPhotos({
    required String campaignId,
    required String scalerId,
    required String completionId,
    required String proofType,
    required List<XFile> photos,
  }) async {
    final urls = <String>[];

    for (final photo in photos) {
      final url = await uploadCompletionPhoto(
        campaignId: campaignId,
        scalerId: scalerId,
        completionId: completionId,
        proofType: proofType,
        photo: photo,
      );

      urls.add(url);
    }

    return urls;
  }

  /// Delete uploaded proof photo
  Future<void> deleteCompletionPhoto(String photoUrl) async {
    if (photoUrl.trim().isEmpty) {
      return;
    }

    final reference = _storage.refFromURL(photoUrl);

    await reference.delete();
  }
}
