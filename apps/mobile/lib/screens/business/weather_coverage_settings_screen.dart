import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../navigation/authenticated_app_bar.dart';
import '../../services/weather_monitoring_service.dart';
import '../../services/maryland_weather_service.dart';

class WeatherCoverageSettingsScreen extends StatefulWidget {
  const WeatherCoverageSettingsScreen({super.key});
  @override
  State<WeatherCoverageSettingsScreen> createState() => _WeatherSettingsState();
}

class _WeatherSettingsState extends State<WeatherCoverageSettingsScreen> {
  final service = WeatherMonitoringService();
  Map<String, dynamic>? data;
  String? error;
  bool saving = false, email = false, quiet = false, urgent = false;
  int version = 0, start = 1320, end = 480;
  Set<String> extra = {};
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final result = await service.call('read');
      if (!mounted) return;
      final p = Map<String, dynamic>.from(result['preferences'] as Map);
      setState(() {
        data = result;
        version = (p['version'] as num?)?.toInt() ?? 0;
        email = p['emailEnabled'] == true;
        quiet = p['quietHours']?['enabled'] == true;
        start = (p['quietHours']?['startMinute'] as num?)?.toInt() ?? 1320;
        end = (p['quietHours']?['endMinute'] as num?)?.toInt() ?? 480;
        urgent = p['urgentOutsideQuietHours'] == true;
        extra = Set<String>.from(p['extraCountyIds'] as List? ?? []);
      });
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              error = 'Weather settings could not be loaded. Please try again.',
        );
      }
    }
  }

  Future<void> save() async {
    setState(() => saving = true);
    try {
      await service.call(
        'save',
        preferences: {
          'expectedVersion': version,
          'emailEnabled': email,
          'extraCountyIds': extra.toList(),
          'quietHours': {
            'enabled': quiet,
            'startMinute': start,
            'endMinute': end,
          },
          'urgentOutsideQuietHours': urgent,
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Settings were not saved. Reload if another session changed them; check your saved Schedule timezone.',
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> choose(bool opening) async {
    final minute = opening ? start : end;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: minute ~/ 60, minute: minute % 60),
    );
    if (t != null && mounted) {
      setState(
        () => opening
            ? start = t.hour * 60 + t.minute
            : end = t.hour * 60 + t.minute,
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: const AuthenticatedAppBar(title: Text('Weather email preferences')),
    body: data == null
        ? Center(
            child: error == null
                ? const CircularProgressIndicator()
                : Text(error!),
          )
        : data!['canConfigure'] != true
        ? const Center(
            child: Text(
              'Only the Business owner can change weather email preferences.',
            ),
          )
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Follow my saved service areas',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              ),
              const Text(
                'Coverage follows your saved Business geography. Additional watch areas affect only Weather.',
              ),
              for (final area in data!['coverage']?['areas'] as List? ?? [])
                ListTile(
                  leading: const Icon(Icons.location_on_outlined),
                  title: Text('${area['name']}'),
                ),
              if ((data!['coverage']?['unresolved'] as List? ?? []).isNotEmpty)
                const Text(
                  'Some saved boundaries are unavailable. Review Service Areas; unresolved coverage is not a no-alert result.',
                ),
              ExpansionTile(
                title: Text('Additional watch areas (${extra.length})'),
                children: [
                  for (final county in MarylandWeatherService.counties)
                    CheckboxListTile(
                      title: Text(county.name),
                      value: extra.contains(county.id),
                      onChanged: (v) => setState(
                        () => v == true
                            ? extra.add(county.id)
                            : extra.remove(county.id),
                      ),
                    ),
                ],
              ),
              SwitchListTile(
                title: const Text('Email official weather alerts'),
                subtitle: Text(
                  'To ${FirebaseAuth.instance.currentUser?.email ?? 'the verified owner'}. No connected mailbox or push device is required. Future alerts only.',
                ),
                value: email,
                onChanged: (v) => setState(() => email = v),
              ),
              Text(
                'Timezone: ${data!['timeZone'] ?? 'Save your timezone in Schedule'}',
              ),
              SwitchListTile(
                title: const Text('Weather quiet hours'),
                value: quiet,
                onChanged: (v) => setState(() => quiet = v),
              ),
              if (quiet)
                Wrap(
                  spacing: 12,
                  children: [
                    TextButton(
                      onPressed: () => choose(true),
                      child: Text(
                        'Start: ${TimeOfDay(hour: start ~/ 60, minute: start % 60).format(context)}',
                      ),
                    ),
                    TextButton(
                      onPressed: () => choose(false),
                      child: Text(
                        'End: ${TimeOfDay(hour: end ~/ 60, minute: end % 60).format(context)}',
                      ),
                    ),
                  ],
                ),
              SwitchListTile(
                title: const Text(
                  'Allow severe or extreme active warnings during quiet hours',
                ),
                subtitle: const Text(
                  'Optional. Other alerts continue to respect weather quiet hours.',
                ),
                value: urgent,
                onChanged: (v) => setState(() => urgent = v),
              ),
              const Text(
                'ScaledCircle is not your sole source of emergency warnings. Follow official instructions. Expired warnings are not delivered as new emergencies.',
              ),
              if (error != null) Text(error!),
              FilledButton(
                onPressed: saving ? null : save,
                child: Text(saving ? 'Saving…' : 'Save weather preferences'),
              ),
            ],
          ),
  );
}
