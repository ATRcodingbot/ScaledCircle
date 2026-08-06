import 'package:flutter/material.dart';

class HomeCompletionCounter extends StatelessWidget {
  final String zoneId;
  final int assignedHomes;
  final int completedHomes;
  final double basePay;

  const HomeCompletionCounter({
    super.key,
    required this.zoneId,
    required this.assignedHomes,
    required this.completedHomes,
    required this.basePay,
  });

  double get completionPercentage {
    if (assignedHomes <= 0) {
      return 0.0;
    }

    final percentage =
        (completedHomes.toDouble() / assignedHomes.toDouble()) * 100.0;

    return percentage.clamp(0.0, 100.0);
  }

  double get estimatedPay {
    final percentage = completionPercentage;

    if (percentage < 30.0) {
      return 0.0;
    }

    if (percentage >= 100.0) {
      return basePay;
    }

    return basePay * (percentage / 100.0);
  }

  @override
  Widget build(BuildContext context) {
    final percentage = completionPercentage;

    final safeCompletedHomes = completedHomes.clamp(
      0,
      assignedHomes > 0 ? assignedHomes : completedHomes,
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.gps_fixed),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'GPS Completion Progress',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            const Text(
              'Completion is calculated automatically from your recorded GPS route.',
            ),

            const SizedBox(height: 18),

            LinearProgressIndicator(value: percentage / 100.0, minHeight: 12),

            const SizedBox(height: 16),

            Text(
              assignedHomes > 0
                  ? '$safeCompletedHomes / $assignedHomes homes covered'
                  : 'Assigned home count unavailable',
              style: const TextStyle(fontSize: 16),
            ),

            const SizedBox(height: 8),

            Text(
              '${percentage.toStringAsFixed(1)}% Complete',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 18),

            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'You do not manually enter completed homes. '
                      'Scaled Circle determines completion from GPS route coverage. '
                      'Development simulation routes use the same completion calculation.',
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 18),

            Text(
              percentage < 30.0
                  ? 'Minimum 30% completion required for payment.'
                  : 'Estimated earnings: \$${estimatedPay.toStringAsFixed(2)}',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: percentage < 30.0 ? Colors.orange : Colors.green,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
