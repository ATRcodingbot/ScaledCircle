import 'package:flutter/material.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'authenticated_media_preview.dart';

/// Private concept preview only. This creates no public delivery or approval.
class SocialCandidatePreview extends StatelessWidget {
  const SocialCandidatePreview({super.key, required this.candidate});
  final Map<String, dynamic> candidate;

  @override
  Widget build(BuildContext context) {
    final path = candidate['storagePath']?.toString() ?? '';
    final width = (candidate['width'] as num?)?.toDouble() ?? 1;
    final height = (candidate['height'] as num?)?.toDouble() ?? 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('New concept · Needs your creative review'),
        AspectRatio(
          aspectRatio: width / height,
          child: AuthenticatedMediaPreview(
            identity: candidate['sha256'] ?? path,
            semanticLabel: 'Private service concept preview',
            fit: BoxFit.contain,
            load: () =>
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
