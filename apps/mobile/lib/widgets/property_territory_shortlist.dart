import 'package:flutter/material.dart';

class PropertyTerritoryShortlist extends StatelessWidget {
  const PropertyTerritoryShortlist({
    super.key,
    required this.report,
    required this.recommendations,
    required this.onSelect,
    required this.onSave,
    this.selectedId,
    this.busy = false,
  });
  final Map<String, dynamic> report;
  final List<Map<String, dynamic>> recommendations;
  final String? selectedId;
  final bool busy;
  final ValueChanged<Map<String, dynamic>> onSelect, onSave;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(report['summary']?.toString() ?? 'Recommended territories'),
      if (report['context'] is Map)
        Text(
          [
            report['context']['businessName'],
            report['context']['goal'],
          ].whereType<String>().join(' · '),
        ),
      if (report['examinedCount'] != null)
        Text(
          '${report['examinedCount']} examined · ${report['remainingCandidateCount'] ?? 0} remaining · ${report['overlapsExcludedCount'] ?? 0} overlaps excluded · ${report['failedSectionCount'] ?? 0} sections unavailable',
        ),
      if (report['historyNote'] != null) Text(report['historyNote'].toString()),
      if (report['sampling'] is Map && report['sampling']['message'] is String)
        Text(report['sampling']['message'] as String),
      if (report['sampling'] != null)
        const Text(
          'These results cover a sample of candidate territories, not every property or possible area.',
        ),
      if (recommendations.isEmpty)
        const Text(
          'No territories are available in this result. Try another saved area or review your history.',
        ),
      for (final territory in recommendations)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${territory['rank'] ?? '—'}. ${territory['name'] ?? 'Territory'}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (territory['fitLabel'] is String &&
                    (territory['fitLabel'] as String).trim().isNotEmpty)
                  Text('Planning fit: ${territory['fitLabel']}')
                else if (territory['fit'] is num)
                  Text('Planning fit score: ${territory['fit']} / 100')
                else if (territory['fit'] != null)
                  Text('Planning fit: ${territory['fit']}'),
                for (final reason in (territory['reasons'] as List? ?? []))
                  Text(reason.toString()),
                for (final limitation
                    in (territory['limitations'] as List? ?? []))
                  Text(limitation.toString()),
                if (territory['nextAction'] != null)
                  Text(territory['nextAction'].toString()),
                Text('Status: ${territory['status'] ?? 'Recommended'}'),
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: () => onSelect(territory),
                      child: Text(
                        selectedId == territory['id']
                            ? 'Selected on map'
                            : 'View on map',
                      ),
                    ),
                    TextButton(
                      onPressed:
                          busy ||
                              territory['id'] == null ||
                              territory['status'] == 'saved'
                          ? null
                          : () => onSave(territory),
                      child: const Text('Save Territory'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
    ],
  );
}
