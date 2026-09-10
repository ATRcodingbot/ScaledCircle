import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'binary_artifact_download.dart';

Future<Uint8List> referralQrPng(String destination) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, 576, 576),
    Paint()..color = Colors.white,
  );
  canvas.translate(32, 32);
  QrPainter(
    data: destination,
    version: QrVersions.auto,
    eyeStyle: const QrEyeStyle(color: Colors.black),
    dataModuleStyle: const QrDataModuleStyle(color: Colors.black),
  ).paint(canvas, const Size(512, 512));
  final picture = recorder.endRecording();
  final image = await picture.toImage(576, 576);
  final bytes = (await image.toByteData(
    format: ui.ImageByteFormat.png,
  ))!.buffer.asUint8List();
  image.dispose();
  picture.dispose();
  return bytes;
}

Future<void> shareReferral(String destination, Rect origin) async {
  await SharePlus.instance.share(
    ShareParams(
      text: destination,
      title: 'ScaledCircle referral',
      sharePositionOrigin: origin,
    ),
  );
}

Future<void> saveReferralQr(String destination, Rect origin) async {
  final bytes = await referralQrPng(destination);
  if (kIsWeb) {
    await downloadBinaryArtifact(
      filename: 'scaledcircle-referral.png',
      bytes: bytes,
      mimeType: 'image/png',
    );
  } else {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile.fromData(bytes, mimeType: 'image/png')],
        fileNameOverrides: ['scaledcircle-referral.png'],
        sharePositionOrigin: origin,
      ),
    );
  }
}
