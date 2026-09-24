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
    final planning = data['targetPlanning'] is Map
        ? Map<String, dynamic>.from(data['targetPlanning'] as Map)
        : null;
    final updated = data['serviceAreaUpdatedAt'];
    final checkedAt = planning?['checkedAtMs'] as num?;
    final updatedMs = updated is DateTime
        ? updated.millisecondsSinceEpoch
        : updated?.millisecondsSinceEpoch;
    final currentPlanning =
        planning != null &&
        (updatedMs == null || (checkedAt != null && checkedAt >= updatedMs));
    final regional =
        currentPlanning &&
        (planning['geographicCoverageMethod'] ==
                'all_housing_unit_counts_from_intersecting_block_groups_no_area_weighting' ||
            planning['sourceVersion']?.toString().startsWith('ACS_') == true);
    final geographies =
        (planning?['censusGeographiesUsed'] as List? ?? const [])
            .map((v) => v.toString())
            .toSet()
            .toList();
    final regionalCount = planning?['residentialProperties'] as num?;
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
                label: currentPlanning
                    ? regional
                          ? 'Regional housing estimate'
                          : planning['metric']?.toString() ?? 'Property records'
                    : 'Target-specific home estimate',
                value: currentPlanning
                    ? (regional && regionalCount != null
                              ? '${regionalCount.toInt().toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')} units'
                              : planning['residentialProperties']
                                    ?.toString()) ??
                          'Unavailable'
                    : _homeLabel(estimatedHomes, homeStatus),
                supportingText: currentPlanning
                    ? regional
                          ? 'Total for ${geographies.isEmpty ? "the returned" : geographies.length} Census block groups overlapping your boundary; includes locations outside the selected area. '
                                'This is not a count of houses or accessible doors inside your target, or a guaranteed upper bound. '
                                '${planning['status'] == "partial" ? "Partial source coverage. " : ""}'
                          : '${planning['source'] ?? "Source unavailable"} · ${planning['dataDate'] ?? "Date unknown"}\n${planning['status'] == "partial" ? "Partial coverage" : planning['status']}\n${planning['reason'] ?? "Not an exact household or accessible-door count."}'
                    : _homeSupport(homeStatus, analysisStatus),
              ),
              if (regional)
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: const Text('Census source and uncertainty details'),
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: SelectableText(
                        [
                          'Source: ${planning['source']}',
                          'Dataset/table: ${planning['sourceVersion'] ?? "Not recorded"}',
                          if (planning['sourceVersion'] ==
                              'ACS_2024_5YR_B25034')
                            'Estimate period: 2020–2024 (ACS 5-year). Housing-unit total: B25034_001E. This is not a 2024 point-in-time count.'
                          else
                            'Estimate period: Not recorded for this dataset.',
                          'Boundary vintage: ${planning['boundaryVersion'] ?? "Not recorded"}',
                          'Retrieved: ${checkedAt == null ? "Not recorded" : DateTime.fromMillisecondsSinceEpoch(checkedAt.toInt(), isUtc: true).toIso8601String()} (UTC)',
                          'Geographic IDs (deduplicated): ${geographies.join(", ")}',
                          'Uncertainty: Margin-of-error variables were not retained in this result. No numeric confidence interval is available.',
                          'Method: Whole overlapping block-group totals; no area weighting or assumed uniform density.',
                        ].join('\n\n'),
                      ),
                    ),
                  ],
                ),
              const Divider(),
              _MetricRow(
                icon: Icons.route_outlined,
                label: 'Route',
                value: 'Not yet verified',
                supportingText:
                    currentPlanning &&
                        (planning['areaSquareMeters'] as num? ?? 0) > 25000000
                    ? 'Saved target: ${((planning['areaSquareMeters'] as num) / 1000000).toStringAsFixed(2)} km². Route queries support up to 25 km² per reviewed work area. '
                          'Census analysis succeeded independently. Select and review a smaller work area before route analysis; the full territory remains saved until you explicitly edit it. '
                          'Automatic tiled route subdivision is not supported. Query partitions do not determine Scaler count.'
                    : null,
              ),
              const Divider(),
              _MetricRow(
                icon: Icons.analytics_outlined,
                label: 'Workload',
                value: currentPlanning
                    ? 'Requires route/stop review'
                    : _workloadLabel(analysisStatus, homeStatus),
                supportingText: currentPlanning
                    ? planning['workloadReason']?.toString()
                    : null,
              ),
              if (currentPlanning) ...[
                const Divider(),
                _MetricRow(
                  icon: Icons.inventory_2_outlined,
                  label: 'Entered campaign material quantity',
                  value:
                      planning['materialsAvailable']?.toString() ??
                      'Not entered',
                  supportingText:
                      'A draft input, not confirmed inventory or approved work. Scope, pieces per stop, spares and accessible stops remain unverified. No coverage percentage is inferred.',
                ),
                for (final limitation
                    in (planning['limitations'] as List? ?? const []))
                  Text(
                    limitation.toString().replaceAll(
                      'property_source_access_challenge',
                      'Maryland parcel source unavailable: HTTP 403 access challenge. The Census fallback is separate.',
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
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
    if (status == 'pending' || status == 'waiting') return 'Analysis needed';
    if (homes != null && homes > 0) return '$homes';
    return 'Unavailable';
  }

  static String? _homeSupport(String status, String analysisStatus) {
    if (status == 'unavailable') return 'The target remains saved.';
    if (status == 'pending' || analysisStatus == 'waiting') {
      return 'Target saved. Run or retry analysis; no completed result is available.';
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 21),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(fontWeight: FontWeight.w600),
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
          if (supportingText != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                supportingText!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
