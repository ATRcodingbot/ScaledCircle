import 'package:flutter/material.dart';

import '../services/property_intelligence_service.dart';

class PropertyIntelligencePanel extends StatelessWidget {
  static const disclaimer =
      'This signal summarizes property-age characteristics in the selected area. '
      'It does not indicate the condition of any particular property, system, roof, '
      'appliance, component, or structure.';

  final PropertyIntelligenceAnalysis analysis;
  final VoidCallback? onCreateCampaign;
  final VoidCallback? onCompare;
  final VoidCallback? onAskAi;

  const PropertyIntelligencePanel({
    super.key,
    required this.analysis,
    this.onCreateCampaign,
    this.onCompare,
    this.onAskAi,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF071A2C),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.home_work_outlined, color: Color(0xFF19E3A2)),
                SizedBox(width: 10),
                Text(
                  'PROPERTY INTELLIGENCE',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'PROPERTY AGE SIGNAL',
              style: TextStyle(
                color: Color(0xFF9EB4CA),
                fontWeight: FontWeight.w700,
              ),
            ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  analysis.signal?.toString() ?? '—',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 42,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(bottom: 7),
                  child: Text(
                    ' / 100',
                    style: TextStyle(color: Color(0xFF9EB4CA), fontSize: 18),
                  ),
                ),
              ],
            ),
            Text(
              analysis.category,
              style: const TextStyle(
                color: Color(0xFF19E3A2),
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _metric(
                  analysis.analyzedUnitLabel,
                  '${analysis.propertyCount}',
                ),
                _metric(
                  'Residential structures',
                  '${analysis.residentialCount}',
                ),
                _metric('Predominant era', analysis.predominantEra),
                _metric('Built before 1980', _percent(analysis.pre1980)),
                _metric('Built before 2000', _percent(analysis.pre2000)),
                _metric(
                  '${analysis.ageMetricsAreEstimated ? 'Estimated ' : ''}20+ years old',
                  _percent(analysis.age20Plus),
                ),
                _metric(
                  '${analysis.ageMetricsAreEstimated ? 'Estimated ' : ''}30+ years old',
                  _percent(analysis.age30Plus),
                ),
                _metric(
                  '${analysis.ageMetricsAreEstimated ? 'Estimated ' : ''}40+ years old',
                  _percent(analysis.age40Plus),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Factual summary',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              analysis.summary,
              style: const TextStyle(color: Color(0xFFD5E2EE)),
            ),
            const SizedBox(height: 14),
            _detail(
              'Data source',
              '${analysis.source}${analysis.sourceVersion.isEmpty ? '' : ' • ${analysis.sourceVersion}'}',
            ),
            _detail('Last updated', analysis.dataUpdatedAt),
            _detail('Confidence', analysis.confidence),
            _detail('Coverage', _percent(analysis.coverage)),
            _detail(
              'Granularity',
              analysis.inputGranularity == 'aggregate_census'
                  ? 'Aggregate Census estimate'
                  : 'Parcel-level observations',
            ),
            _detail('Signal precision', analysis.signalPrecision),
            if (analysis.intersectingGeographyCount > 0)
              _detail(
                'Intersecting Census block groups',
                '${analysis.intersectingGeographyCount}',
              ),
            if (analysis.propertyTypes.isNotEmpty)
              _detail(
                'Property types',
                analysis.propertyTypes.entries
                    .map((entry) => '${entry.key}: ${entry.value}')
                    .join(' • '),
              ),
            if (analysis.limitations.isNotEmpty)
              _detail('Limitations', analysis.limitations.join(' ')),
            const Divider(color: Color(0xFF244A69), height: 24),
            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Color(0xFF9EB4CA), size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    disclaimer,
                    style: TextStyle(color: Color(0xFF9EB4CA), fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton(
                  onPressed: onCreateCampaign,
                  child: const Text('Create Campaign in This Area'),
                ),
                OutlinedButton(
                  onPressed: onCompare,
                  child: const Text('Compare Nearby Areas'),
                ),
                OutlinedButton(
                  onPressed: onAskAi,
                  child: const Text('Ask AI (Coming Soon)'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static Widget _metric(String label, String value) => SizedBox(
    width: 150,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(color: Color(0xFF9EB4CA), fontSize: 12),
        ),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 17,
          ),
        ),
      ],
    ),
  );

  static Widget _detail(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Text(
      '$label: $value',
      style: const TextStyle(color: Color(0xFFD5E2EE), fontSize: 12),
    ),
  );
  static String _percent(double value) =>
      '${value.toStringAsFixed(value % 1 == 0 ? 0 : 1)}%';
}
