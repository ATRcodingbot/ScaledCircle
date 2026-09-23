import '../../config/native_release_policy.dart';
import 'package:flutter/material.dart';
import '../../navigation/authenticated_app_bar.dart';
import '../../services/weather_monitoring_service.dart';
import 'weather_coverage_settings_screen.dart';
import 'weather_opportunity_analysis_screen.dart';

class WeatherAlertsScreen extends StatefulWidget {
  const WeatherAlertsScreen({super.key, this.alertId});
  final String? alertId;
  @override
  State<WeatherAlertsScreen> createState() => _WeatherAlertsState();
}

class _WeatherAlertsState extends State<WeatherAlertsScreen> {
  final service = WeatherMonitoringService();
  Map<String, dynamic>? data, selected;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final result = await service.call('read');
      final alert = widget.alertId == null
          ? null
          : await service.call('alert', alertId: widget.alertId);
      if (mounted) {
        setState(() {
          data = result;
          selected = alert;
          error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Weather information is unavailable for this account. Please try again.',
        );
      }
    }
  }

  Widget alert(Map value) {
    final e = Map<String, dynamic>.from(value['event'] as Map);
    final zone = data?['timeZone'];
    // The server supplies Business-local labels; never use the device timezone.
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${e['event']} — ${e['status']}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Text('National Weather Service'),
            for (final m in value['matches'] as List? ?? [])
              Text(
                '${m['reason']}${m['partial'] == true ? ' Only part of this area intersects official coverage.' : ''}',
              ),
            Text('Issued: ${e['issuedLabel'] ?? 'Time unavailable'}'),
            Text('Effective: ${e['effectiveLabel'] ?? 'Time unavailable'}'),
            Text('Expires: ${e['expiresLabel'] ?? 'Time unavailable'}'),
            if (zone == null)
              const Text('Business timezone unavailable; save it in Schedule.'),
            SelectableText('${e['description'] ?? ''}'),
            SelectableText('${e['instructions'] ?? ''}'),
            ExpansionTile(
              title: const Text('Official source and recorded evidence'),
              children: [
                SelectableText('${e['officialUrl']}'),
                SelectableText(
                  'Issued UTC: ${DateTime.fromMillisecondsSinceEpoch((e['issuedAt'] as num).toInt(), isUtc: true).toIso8601String()}',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final monitoring = data?['monitoring'] as Map?;
    final status = monitoring?['status'];
    final rows = monitoring?['activeAlerts'] as List? ?? [];
    return Scaffold(
      appBar: AuthenticatedAppBar(
        title: const Text('Weather Intelligence'),
        actions: [
          IconButton(
            onPressed: load,
            tooltip: 'Refresh saved weather results',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Official alerts in your saved service areas',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          const Text(
            'ScaledCircle is not your sole source of emergency warnings. Follow official instructions.',
          ),
          if (data?['canConfigure'] == true)
            OutlinedButton(
              onPressed: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const WeatherCoverageSettingsScreen(),
                  ),
                );
                load();
              },
              child: const Text('Weather coverage and email preferences'),
            ),
          if (error != null)
            Text(error!)
          else if (data == null)
            const Center(child: CircularProgressIndicator())
          else ...[
            Text(
              status == 'available'
                  ? 'Saved coverage checked'
                  : status == 'partial_coverage'
                  ? 'Maryland coverage checked. Geography outside the current Maryland Weather coverage remains unresolved.'
                  : status == null
                  ? 'First background coverage check pending'
                  : 'Coverage/provider check unavailable — this does not mean there are no alerts.',
            ),
            if (selected != null) ...[
              const Text('Selected alert · recorded history'),
              alert(selected!),
              for (final work in selected!['relatedWork'] as List? ?? [])
                TextButton(
                  onPressed: () =>
                      Navigator.of(context).pushNamed(work['route'] as String),
                  child: Text('Review affected active work: ${work['label']}'),
                ),
            ],
            if (rows.isEmpty && status == 'available')
              const Text(
                'No matching official alerts in the last saved check.',
              ),
            for (final row in rows) alert(row as Map),
          ],
          if (NativeReleasePolicy.premiumToolsAvailable)
            TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const WeatherOpportunityAnalysisScreen(),
                ),
              ),
              child: const Text('Optional Business weather planning analysis'),
            ),
        ],
      ),
    );
  }
}
