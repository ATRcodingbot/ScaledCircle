import 'package:flutter/material.dart';

import '../sc_card.dart';

class ScPhotoRequirementCard extends StatelessWidget {
  final bool beforePhotoRequired;
  final bool afterPhotoRequired;

  const ScPhotoRequirementCard({
    super.key,

    required this.beforePhotoRequired,
    required this.afterPhotoRequired,
  });

  @override
  Widget build(BuildContext context) {
    return ScCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          const Row(
            children: [
              Icon(Icons.photo_camera_outlined),

              SizedBox(width: 10),

              Text(
                "Photo Verification",

                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ],
          ),

          const SizedBox(height: 18),

          _PhotoRequirementRow(
            title: "Before Cleanup Photo",

            description: "Scaler documents the original job site condition.",

            enabled: beforePhotoRequired,
          ),

          const SizedBox(height: 14),

          _PhotoRequirementRow(
            title: "After Cleanup Photo",

            description: "Scaler proves the completed cleanup.",

            enabled: afterPhotoRequired,
          ),

          const SizedBox(height: 16),

          Container(
            padding: const EdgeInsets.all(12),

            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),

              color: Theme.of(
                context,
              ).colorScheme.primary.withValues(alpha: .08),
            ),

            child: const Row(
              children: [
                Icon(Icons.verified_outlined, size: 20),

                SizedBox(width: 10),

                Expanded(
                  child: Text(
                    "Photos create trust between businesses and Scalers without requiring constant GPS tracking.",
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoRequirementRow extends StatelessWidget {
  final String title;
  final String description;
  final bool enabled;

  const _PhotoRequirementRow({
    required this.title,
    required this.description,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,

      children: [
        Icon(enabled ? Icons.check_circle : Icons.cancel_outlined),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),

              const SizedBox(height: 4),

              Text(description),
            ],
          ),
        ),
      ],
    );
  }
}
