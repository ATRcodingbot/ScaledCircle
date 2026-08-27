import 'package:flutter/material.dart';

class ResponseTrackingFeatureCard extends StatelessWidget {
  const ResponseTrackingFeatureCard({
    super.key,
    required this.available,
    this.onOpen,
  });

  final bool available;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final status = available ? 'Beta' : 'Coming Soon';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.qr_code_2_outlined),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Response tracking — $status',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              available
                  ? 'Add a tracked ScaledCircle link and QR code to measure responses.'
                  : 'Tracked links and QR response measurement are not available yet.',
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _CapabilityChip(
                  label: 'Tracked link',
                  status: status,
                  available: available,
                ),
                _CapabilityChip(
                  label: 'QR code',
                  status: status,
                  available: available,
                ),
                const _CapabilityChip(
                  label: 'Landing pages',
                  status: 'Coming Soon',
                ),
                const _CapabilityChip(
                  label: 'Tracked calls',
                  status: 'Coming Soon',
                ),
                const _CapabilityChip(
                  label: 'Lead capture/forms',
                  status: 'Coming Soon',
                ),
              ],
            ),
            if (available) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton.icon(
                  onPressed: onOpen,
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Open tracked link + QR'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CapabilityChip extends StatelessWidget {
  const _CapabilityChip({
    required this.label,
    required this.status,
    this.available = false,
  });

  final String label;
  final String status;
  final bool available;

  @override
  Widget build(BuildContext context) => Chip(
    avatar: Icon(
      available ? Icons.check_circle_outline : Icons.schedule_outlined,
      size: 18,
    ),
    label: Text('$label — $status'),
  );
}
