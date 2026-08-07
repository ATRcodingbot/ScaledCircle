import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

class CompletionPhotoService {
  final ImagePicker _imagePicker = ImagePicker();

  final FirebaseStorage _storage = FirebaseStorage.instance;

  Future<XFile?> takePhoto() async {
    return _imagePicker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 2000,
    );
  }

  Future<String> uploadCompletionPhoto({
    required XFile photo,
    required String campaignId,
    required String scalerId,
    required String completionId,
    required String proofType,
    String? campaignLocationId,
  }) async {
    final timestamp = DateTime.now().millisecondsSinceEpoch;

    final safeLocationId =
        campaignLocationId == null || campaignLocationId.trim().isEmpty
        ? 'general'
        : campaignLocationId.trim();

    final reference = _storage
        .ref()
        .child('campaignCompletionProofs')
        .child(campaignId)
        .child(scalerId)
        .child(completionId)
        .child('${proofType}_${safeLocationId}_$timestamp.jpg');

    await reference.putFile(
      File(photo.path),
      SettableMetadata(
        contentType: 'image/jpeg',
        customMetadata: {
          'campaignId': campaignId,
          'scalerId': scalerId,
          'completionId': completionId,
          'proofType': proofType,
          'campaignLocationId': safeLocationId,
        },
      ),
    );

    return reference.getDownloadURL();
  }
}
