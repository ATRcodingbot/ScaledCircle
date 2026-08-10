import 'package:flutter/material.dart';

class ZoneIntelligenceCard extends StatelessWidget {
  final String zoneName;
  final Map<String, dynamic> data;
  final VoidCallback? onTap;

  const ZoneIntelligenceCard({
    super.key,
    required this.zoneName,
    required this.data,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final estimatedHomes = (data['estimatedHomes'] as num?)?.toInt();

    final homeCountStatus = data['homeCountStatus']?.toString() ?? 'pending';

    final homeCountConfidence = data['homeCountConfidence']?.toString();

    final homeCountConfidenceScore = (data['homeCountConfidenceScore'] as num?)
        ?.toDouble();

    final walkingMiles = (data['estimatedWalkingMiles'] as num?)?.toDouble();

    final estimatedMinutes = (data['estimatedMinutes'] as num?)?.toInt();

    final suggestedPay = (data['suggestedBasePay'] as num?)?.toDouble();

    final recommendedScalers =
        (data['recommendedScalerCount'] as num?)?.toInt() ?? 1;

    final gpsCoverage =
        (data['gpsCoveragePercent'] as num?)?.toDouble() ??
        (data['completionPercentage'] as num?)?.toDouble();

    final zoneStatus = data['status']?.toString() ?? 'unassigned';

    final assignedScalerEmail = data['assignedScalerEmail']?.toString();

    final recommendedFlyers = _recommendedFlyers(
      estimatedHomes,
      homeCountStatus,
    );

    final difficulty = _difficultyLabel(
      estimatedHomes: estimatedHomes,
      walkingMiles: walkingMiles,
      estimatedMinutes: estimatedMinutes,
      recommendedScalers: recommendedScalers,
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(child: Icon(_statusIcon(zoneStatus))),

                  const SizedBox(width: 12),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          zoneName,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),

                        const SizedBox(height: 3),

                        Text(
                          _statusLabel(zoneStatus),
                          style: TextStyle(
                            color: Colors.grey.shade700,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),

                  _difficultyChip(difficulty),
                ],
              ),

              if (assignedScalerEmail != null &&
                  assignedScalerEmail.isNotEmpty) ...[
                const SizedBox(height: 14),

                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: Colors.grey.shade100,
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.person_outline, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Assigned to $assignedScalerEmail',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 20),

              _metricRow(
                icon: Icons.home_work_outlined,
                label: 'Estimated Homes',
                value: _homeCountLabel(estimatedHomes, homeCountStatus),
                supportingText: _homeConfidenceLabel(
                  status: homeCountStatus,
                  confidence: homeCountConfidence,
                  confidenceScore: homeCountConfidenceScore,
                ),
              ),

              _divider(),

              _metricRow(
                icon: Icons.directions_walk,
                label: 'Estimated Walking Distance',
                value: walkingMiles == null
                    ? 'Pending'
                    : '${walkingMiles.toStringAsFixed(1)} miles',
                supportingText: 'Preliminary route estimate',
              ),

              _divider(),

              _metricRow(
                icon: Icons.schedule,
                label: 'Estimated Walking Time',
                value: estimatedMinutes == null
                    ? 'Pending'
                    : _formatDuration(estimatedMinutes),
              ),

              _divider(),

              _metricRow(
                icon: Icons.payments_outlined,
                label: 'Recommended Pay',
                value: suggestedPay == null
                    ? 'Pending'
                    : '\$${suggestedPay.toStringAsFixed(0)}',
                supportingText: 'Preliminary workload recommendation',
              ),

              _divider(),

              _metricRow(
                icon: Icons.speed_outlined,
                label: 'Difficulty',
                value: difficulty,
              ),

              _divider(),

              _metricRow(
                icon: Icons.print_outlined,
                label: 'Recommended Flyers',
                value: recommendedFlyers == null
                    ? 'Pending'
                    : recommendedFlyers.toString(),
                supportingText: recommendedFlyers == null
                    ? 'Available after the home estimate'
                    : 'Includes approximately 10% overage',
              ),

              _divider(),

              _metricRow(
                icon: Icons.groups_outlined,
                label: 'Suggested Scalers',
                value: recommendedScalers.toString(),
              ),

              _divider(),

              _metricRow(
                icon: Icons.gps_fixed,
                label: 'GPS Coverage',
                value: gpsCoverage == null
                    ? 'Not started'
                    : '${gpsCoverage.toStringAsFixed(1)}%',
                supportingText: gpsCoverage == null
                    ? 'Available after GPS work is recorded'
                    : 'Recorded route coverage inside the assigned zone',
              ),

              if (gpsCoverage != null) ...[
                const SizedBox(height: 14),

                LinearProgressIndicator(
                  value: (gpsCoverage / 100).clamp(0.0, 1.0),
                  minHeight: 9,
                  borderRadius: BorderRadius.circular(20),
                ),
              ],

              if (onTap != null) ...[
                const SizedBox(height: 14),

                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: onTap,
                    icon: const Icon(Icons.visibility_outlined),
                    label: const Text('View Zone'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _metricRow({
    required IconData icon,
    required String label,
    required String value,
    String? supportingText,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 26),

          const SizedBox(width: 14),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                ),

                const SizedBox(height: 3),

                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                if (supportingText != null && supportingText.isNotEmpty) ...[
                  const SizedBox(height: 3),

                  Text(
                    supportingText,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _divider() {
    return Divider(color: Colors.grey.shade300, height: 12);
  }

  Widget _difficultyChip(String difficulty) {
    IconData icon;

    switch (difficulty) {
      case 'Hard':
        icon = Icons.warning_amber_rounded;
        break;

      case 'Moderate':
        icon = Icons.trending_up;
        break;

      default:
        icon = Icons.check_circle_outline;
    }

    return Chip(avatar: Icon(icon, size: 18), label: Text(difficulty));
  }

  String _homeCountLabel(int? estimatedHomes, String status) {
    switch (status) {
      case 'complete':
      case 'estimated':
        return estimatedHomes == null
            ? 'Unavailable'
            : estimatedHomes.toString();

      case 'failed':
        return 'Unavailable';

      case 'analyzing':
      case 'processing':
        return 'Analyzing...';

      default:
        return 'Pending';
    }
  }

  String? _homeConfidenceLabel({
    required String status,
    required String? confidence,
    required double? confidenceScore,
  }) {
    if (status == 'failed') {
      return 'The home estimate could not be calculated';
    }

    if (status != 'complete' && status != 'estimated') {
      return 'Waiting for geographic housing analysis';
    }

    if (confidenceScore != null) {
      final percent = (confidenceScore * 100).clamp(0, 100).round();

      if (confidence != null && confidence.isNotEmpty) {
        return '${_capitalize(confidence)} confidence • $percent%';
      }

      return '$percent% confidence';
    }

    if (confidence != null && confidence.isNotEmpty) {
      return '${_capitalize(confidence)} confidence';
    }

    return null;
  }

  int? _recommendedFlyers(int? estimatedHomes, String status) {
    if (estimatedHomes == null || estimatedHomes <= 0) {
      return null;
    }

    if (status != 'complete' && status != 'estimated') {
      return null;
    }

    return (estimatedHomes * 1.10).ceil();
  }

  String _difficultyLabel({
    required int? estimatedHomes,
    required double? walkingMiles,
    required int? estimatedMinutes,
    required int recommendedScalers,
  }) {
    int score = 0;

    if (estimatedHomes != null) {
      if (estimatedHomes >= 500) {
        score += 3;
      } else if (estimatedHomes >= 250) {
        score += 2;
      } else if (estimatedHomes >= 100) {
        score += 1;
      }
    }

    if (walkingMiles != null) {
      if (walkingMiles >= 8) {
        score += 3;
      } else if (walkingMiles >= 4) {
        score += 2;
      } else if (walkingMiles >= 2) {
        score += 1;
      }
    }

    if (estimatedMinutes != null) {
      if (estimatedMinutes >= 360) {
        score += 3;
      } else if (estimatedMinutes >= 180) {
        score += 2;
      } else if (estimatedMinutes >= 90) {
        score += 1;
      }
    }

    if (recommendedScalers >= 3) {
      score += 2;
    } else if (recommendedScalers == 2) {
      score += 1;
    }

    if (score >= 7) {
      return 'Hard';
    }

    if (score >= 3) {
      return 'Moderate';
    }

    return 'Easy';
  }

  String _formatDuration(int minutes) {
    if (minutes < 60) {
      return '$minutes min';
    }

    final hours = minutes ~/ 60;

    final remainingMinutes = minutes % 60;

    if (remainingMinutes == 0) {
      return '$hours hr';
    }

    return '$hours hr $remainingMinutes min';
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'assigned':
        return 'Assigned';

      case 'accepted':
        return 'Assigned';

      case 'in_progress':
        return 'In Progress';

      case 'submitted':
        return 'Submitted for Review';

      case 'completed':
        return 'Completed';

      case 'unassigned':
        return 'Unassigned';

      default:
        return _capitalize(status.replaceAll('_', ' '));
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'assigned':
      case 'accepted':
        return Icons.person_pin_circle_outlined;

      case 'in_progress':
        return Icons.gps_fixed;

      case 'submitted':
        return Icons.fact_check_outlined;

      case 'completed':
        return Icons.verified;

      default:
        return Icons.map_outlined;
    }
  }

  String _capitalize(String value) {
    if (value.isEmpty) {
      return value;
    }

    return value[0].toUpperCase() + value.substring(1);
  }
}
