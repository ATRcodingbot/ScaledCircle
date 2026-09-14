import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'package:firebase_storage/firebase_storage.dart';
import 'authenticated_media_preview.dart';

/// Private concept preview only. This creates no public delivery or approval.
class SocialCandidatePreview extends StatelessWidget {
  const SocialCandidatePreview({
    super.key,
    required this.candidate,
    this.onReady,
    this.load,
  });
  final Map<String, dynamic> candidate;
  final VoidCallback? onReady;
  final Future<Uint8List?> Function()? load;

  @override
  Widget build(BuildContext context) {
    final path = candidate['storagePath']?.toString() ?? '';
    final width = (candidate['width'] as num?)?.toDouble() ?? 1;
    final height = (candidate['height'] as num?)?.toDouble() ?? 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('New concept · Needs your creative review'),
        SizedBox(
          height: (MediaQuery.sizeOf(context).width * height / width)
              .clamp(0, 340)
              .toDouble(),
          child: AuthenticatedMediaPreview(
            identity: candidate['sha256'] ?? path,
            semanticLabel: 'Private service concept preview',
            fit: BoxFit.contain,
            expectedSha256: candidate['sha256']?.toString(),
            onReady: onReady,
            load:
                load ??
                () =>
                    FirebaseStorage.instance.ref(path).getData(8 * 1024 * 1024),
          ),
        ),
        Text(
          candidate['disclosure']?.toString() ??
              'Service concept — not a completed Business project.',
        ),
        const Text(
          'Review the creative before approving this post. Nothing is scheduled.',
        ),
      ],
    );
  }
}
