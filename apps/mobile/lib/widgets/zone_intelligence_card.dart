import 'package:flutter/material.dart';

class ZoneIntelligenceCard extends StatelessWidget {
  final String zoneName;
  final Map<String, dynamic> data;
  final VoidCallback? onTap;
  final int? displayOrdinal;
  final Color? identityColor;

  const ZoneIntelligenceCard({
    super.key,
    required this.zoneName,
    required this.data,
    this.onTap,
    this.displayOrdinal,
    this.identityColor,
  });

  @override
  Widget build(BuildContext context) {
    final estimatedHomes = (data['estimatedHomes'] as num?)?.toInt();
    final homeStatus = data['homeCountStatus']?.toString() ?? 'pending';
    final analysisStatus = data['analysisStatus']?.toString() ?? 'waiting';
    final assignedScaler = data['assignedScalerEmail']?.toString();
    final gpsCoverage =
        (data['gpsCoveragePercent'] as num?)?.toDouble() ??
        (data['completionPercentage'] as num?)?.toDouble();

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
                  CircleAvatar(
                    backgroundColor: identityColor,
                    foregroundColor: identityColor == null
                        ? null
                        : Colors.white,
                    child: displayOrdinal == null
                        ? const Icon(Icons.check)
                        : Text('$displayOrdinal'),
                  ),
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
                        const Text(
                          'Target saved ✓',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              _MetricRow(
                icon: Icons.home_work_outlined,
                label: 'Estimated Homes',
                value: _homeLabel(estimatedHomes, homeStatus),
                supportingText: _homeSupport(homeStatus, analysisStatus),
              ),
              const Divider(),
              const _MetricRow(
                icon: Icons.route_outlined,
                label: 'Route',
                value: 'Not yet verified',
              ),
              const Divider(),
              _MetricRow(
                icon: Icons.analytics_outlined,
                label: 'Workload',
                value: _workloadLabel(analysisStatus, homeStatus),
              ),
              const Divider(),
              _MetricRow(
                icon: Icons.person_outline,
                label: 'Scaler',
                value: assignedScaler == null || assignedScaler.isEmpty
                    ? 'Not assigned'
                    : assignedScaler,
              ),
              if (gpsCoverage != null) ...[
                const Divider(),
                _MetricRow(
                  icon: Icons.gps_fixed,
                  label: 'GPS Coverage',
                  value: '${gpsCoverage.toStringAsFixed(1)}%',
                  supportingText: 'Recorded during active field work',
                ),
              ],
              if (onTap != null) ...[
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: onTap,
                    icon: const Icon(Icons.edit_location_alt_outlined),
                    label: const Text('Edit Target'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _homeLabel(int? homes, String status) {
    if (status == 'unavailable') return 'Unavailable';
    if (status == 'pending' || status == 'waiting') return 'Analyzing...';
    if (homes != null && homes > 0) return '$homes';
    return 'Unavailable';
  }

  static String? _homeSupport(String status, String analysisStatus) {
    if (status == 'unavailable') return 'The target remains saved.';
    if (status == 'pending' || analysisStatus == 'waiting') {
      return 'Optional intelligence does not affect your saved target.';
    }
    return null;
  }

  static String _workloadLabel(String analysisStatus, String homeStatus) {
    if (analysisStatus == 'waiting' || homeStatus == 'pending') {
      return 'Pending target analysis';
    }
    if (homeStatus == 'unavailable') return 'Unavailable';
    return 'Analysis complete';
  }
}

class _MetricRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String? supportingText;

  const _MetricRow({
    required this.icon,
    required this.label,
    required this.value,
    this.supportingText,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 21),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                if (supportingText != null)
                  Text(
                    supportingText!,
                    style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
