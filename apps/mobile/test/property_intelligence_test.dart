import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/property_intelligence_service.dart';
import 'package:flutter_app/widgets/property_intelligence_panel.dart';

void main() {
  test('property analysis parses neutral authoritative fields', () {
    const analysis = PropertyIntelligenceAnalysis({
      'propertyAgeSignal': 82,
      'propertyAgeSignalCategory': 'HIGH OLDER-STOCK CONCENTRATION',
      'propertyCount': 1284,
      'residentialStructureCount': 1127,
      'predominantConstructionEra': '1960To1979',
      'percentPre1980': 38,
      'percentPre2000': 64,
      'percent20PlusYearsOld': 72,
      'percent30PlusYearsOld': 58,
      'percent40PlusYearsOld': 41,
      'source': 'Maryland Open Data',
      'confidence': 'HIGH',
      'dataCoverage': 91.2,
    });
    expect(analysis.signal, 82);
    expect(analysis.propertyCount, 1284);
    expect(analysis.pre1980, 38);
    expect(analysis.source, 'Maryland Open Data');
  });

  test('required signal disclaimer stays trade neutral', () {
    expect(
      PropertyIntelligencePanel.disclaimer,
      contains('does not indicate the condition'),
    );
    expect(
      PropertyIntelligencePanel.disclaimer.toLowerCase(),
      isNot(contains('hvac')),
    );
  });

  test('aggregate Census age metrics expose estimated precision', () {
    final analysis = PropertyIntelligenceAnalysis({
      'estimatedPercent20PlusYearsOld': 60,
      'estimatedPercent30PlusYearsOld': 50,
      'estimatedPercent40PlusYearsOld': 40,
      'ageMetricPrecision': 'estimated_from_acs_buckets',
      'inputGranularity': 'aggregate_census',
      'signalPrecision': 'aggregateEstimate',
      'intersectingGeographyCount': 3,
    });
    expect(analysis.ageMetricsAreEstimated, isTrue);
    expect(analysis.age30Plus, 50);
    expect(analysis.inputGranularity, 'aggregate_census');
    expect(analysis.signalPrecision, 'aggregateEstimate');
    expect(analysis.intersectingGeographyCount, 3);
  });
}
