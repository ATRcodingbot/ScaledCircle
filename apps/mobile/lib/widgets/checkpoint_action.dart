import 'package:flutter/material.dart';
import '../models/canvassing_photo_policy.dart';

class CheckpointAction extends StatelessWidget {
  const CheckpointAction({
    super.key,
    required this.jobType,
    required this.onPressed,
  });
  final Object? jobType;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final known = jobType != null && jobType.toString().trim().isNotEmpty;
    final gpsOnly = prohibitsResidentialPhotos(jobType);
    if (gpsOnly) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'GPS records automatically while route tracking is active. No manual marks are required.',
          ),
          OutlinedButton.icon(
            onPressed: onPressed,
            icon: const Icon(Icons.bookmark_border),
            label: const Text('Mark Progress (optional)'),
          ),
          const Text(
            'Saves your current verified location and time. It does not add route credit.',
          ),
        ],
      );
    }
    return FilledButton.icon(
      onPressed: known ? onPressed : null,
      icon: Icon(!known || gpsOnly ? Icons.location_on : Icons.add_a_photo),
      label: Text(
        !known
            ? 'Checkpoint unavailable — reload job details'
            : gpsOnly
            ? 'Mark Progress (optional)'
            : 'Add Checkpoint / Photo',
      ),
    );
  }
}
