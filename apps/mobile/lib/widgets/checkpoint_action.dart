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
    return FilledButton.icon(
      onPressed: known ? onPressed : null,
      icon: Icon(!known || gpsOnly ? Icons.location_on : Icons.add_a_photo),
      label: Text(
        !known
            ? 'Checkpoint unavailable — reload job details'
            : gpsOnly
            ? 'Add GPS Checkpoint'
            : 'Add Checkpoint / Photo',
      ),
    );
  }
}
