import 'package:flutter/material.dart';
import '../models/social_plan_presentation.dart';
import 'social_connection_card.dart';

class SocialPerformancePanel extends StatelessWidget {
  const SocialPerformancePanel({super.key, required this.data});
  final Map data;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final p in (data['platforms'] as List? ?? []).whereType<Map>())
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  socialProviderName('${p['provider']}'),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                Text(
                  p['baselineAt'] == null
                      ? 'No provider baseline captured.'
                      : 'Baseline captured ${socialCustomerTime(context, p['baselineAt'], label: p['baselineAtLabel'])}',
                ),
                if (p['currentAt'] != null)
                  Text(
                    'Latest observation ${socialCustomerTime(context, p['currentAt'], label: p['currentAtLabel'])}',
                  ),
                const SizedBox(height: 12),
                for (final m in (p['metrics'] as List? ?? []).whereType<Map>())
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${m['label']}: ${m['current'] ?? 'Unavailable'}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        Text(
                          m['change'] == null
                              ? 'Comparable change unavailable'
                              : 'Change since baseline: ${(m['change'] as num) >= 0 ? '+' : ''}${m['change']}',
                        ),
                      ],
                    ),
                  ),
                Text(
                  'Published through ScaledCircle: ${p['published'] ?? 'Unavailable'}',
                ),
              ],
            ),
          ),
        ),
      const Text(
        'Provider history belongs to your Business. Period metrics are compared only when their account and measurement windows match. A reply or engagement does not by itself prove a lead or sale.',
      ),
    ],
  );
}
