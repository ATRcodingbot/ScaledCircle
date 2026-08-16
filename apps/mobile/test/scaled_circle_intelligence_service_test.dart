import 'dart:io';

import 'package:flutter_app/services/scaled_circle_intelligence_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('structured response keeps model interpretation in advisory fields', () {
    final result = ScaledCircleAiInterpretation.fromPayload({
      'status': 'complete',
      'cached': true,
      'modelSnapshot': 'mock-model',
      'knownData': {
        'property': {'propertyAgeSignal': 72},
      },
      'aiInterpretation': {
        'summary': 'This area may be useful for qualified outreach.',
        'opportunities': [
          {
            'title': 'Test a campaign',
            'rationale': 'The supplied signal may support a test.',
            'qualification': 'Property condition is not known.',
          },
        ],
        'limitations': ['No component condition data.'],
        'unavailableFacts': ['Roof condition'],
      },
    });
    expect(result.available, isTrue);
    expect(result.cached, isTrue);
    expect(result.summary, contains('qualified outreach'));
    expect(
      result.opportunities.single['qualification'],
      'Property condition is not known.',
    );
    expect(result.unavailableFacts, ['Roof condition']);
    expect((result.knownData['property'] as Map)['propertyAgeSignal'], 72);
  });

  test('provider unavailable has an honest non-fabricated response', () {
    final result = ScaledCircleAiInterpretation.fromPayload({
      'status': 'temporarily_unavailable',
      'message': 'AI analysis is temporarily unavailable.',
      'knownData': {
        'property': {'propertyAgeSignal': 72},
      },
    });
    expect(result.available, isFalse);
    expect(result.summary, 'AI analysis is temporarily unavailable.');
    expect(result.opportunities, isEmpty);
  });

  test('Flutter uses one callable and contains no OpenAI key or endpoint', () {
    final service = File(
      'lib/services/scaled_circle_intelligence_service.dart',
    ).readAsStringSync();
    expect(service, contains("httpsCallable('analyzeScaleIntelligence')"));
    expect(service, contains("'mode': 'property'"));
    expect(service, contains("'mode': 'weather'"));
    expect(service, contains("'mode': 'combined'"));
    expect(service, isNot(contains('OPENAI_API_KEY')));
    expect(service, isNot(contains('api.openai.com')));
  });

  test('Weather UI preserves facts and shows separate AI interpretation', () {
    final source = File(
      'lib/screens/business/weather_alerts_screen.dart',
    ).readAsStringSync();
    expect(source, contains('Ask AI About This Weather'));
    expect(source, contains('AI OPPORTUNITY ANALYSIS'));
    expect(source, contains('National Weather Service facts'));
    expect(source, contains('deterministic opportunity estimates'));
  });

  test('public copy accurately positions both Scale AI features', () {
    final source = File(
      'lib/screens/public/public_landing_screen.dart',
    ).readAsStringSync();
    expect(source, contains('PROPERTY OPPORTUNITY • EXAMPLE'));
    expect(source, contains('WEATHER OPPORTUNITY • ILLUSTRATION'));
    expect(
      source,
      contains('Official weather facts remain separate from AI interpretation.'),
    );
  });
}
