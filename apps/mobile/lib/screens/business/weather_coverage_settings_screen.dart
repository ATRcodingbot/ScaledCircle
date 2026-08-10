import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/maryland_weather_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/scaled_circle_brand.dart';

class WeatherCoverageSettingsScreen extends StatefulWidget {
  const WeatherCoverageSettingsScreen({super.key});

  @override
  State<WeatherCoverageSettingsScreen> createState() =>
      _WeatherCoverageSettingsScreenState();
}

class _WeatherCoverageSettingsScreenState
    extends State<WeatherCoverageSettingsScreen> {
  final MarylandWeatherService _service = MarylandWeatherService();
  Set<String> _selectedCountyIds = <String>{};
  bool _emailAlertsEnabled = true;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final preferences = await _service.loadCoveragePreferences(user.uid);
    if (!mounted) return;
    setState(() {
      _selectedCountyIds = preferences.configured
          ? preferences.countyIds
          : MarylandWeatherService.allCountyIds;
      _emailAlertsEnabled = preferences.configured
          ? preferences.emailAlertsEnabled
          : true;
      _loading = false;
    });
  }

  Future<void> _save() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || _saving) return;
    if (_selectedCountyIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one service area.')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await _service.saveCoveragePreferences(
        userId: user.uid,
        countyIds: _selectedCountyIds,
        emailAlertsEnabled: _emailAlertsEnabled,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Weather coverage saved.')),
      );
      Navigator.pop(context, true);
    } on FirebaseException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to save coverage: ${error.message}')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = FirebaseAuth.instance.currentUser?.email ?? 'your account email';
    return Scaffold(
      appBar: AppBar(title: const ScaledCircleBrand(compact: true)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 48),
              children: [
                DashboardHero(
                  eyebrow: 'Weather alert coverage',
                  title: 'Choose where your business works.',
                  description:
                      'Scaled Circle checks official National Weather Service '
                      'alerts in the counties you select. Scale subscribers and '
                      'approved test administrators receive matching in-app alerts.',
                  primaryActionLabel: 'Save Alert Coverage',
                  primaryActionIcon: Icons.save_outlined,
                  onPrimaryAction: () {
                    if (!_saving) _save();
                  },
                  metrics: const [
                    DashboardPill(
                      icon: Icons.schedule_outlined,
                      label: 'Background checks every 5 minutes',
                    ),
                    DashboardPill(
                      icon: Icons.filter_alt_outlined,
                      label: 'Test products filtered',
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Card(
                  child: Column(
                    children: MarylandWeatherService.counties.map((county) {
                      final selected = _selectedCountyIds.contains(county.id);
                      return CheckboxListTile(
                        value: selected,
                        title: Text(
                          county.name,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        subtitle: const Text('Official NWS alert monitoring'),
                        secondary: const Icon(Icons.location_on_outlined),
                        onChanged: (value) {
                          setState(() {
                            if (value == true) {
                              _selectedCountyIds.add(county.id);
                            } else {
                              _selectedCountyIds.remove(county.id);
                            }
                          });
                        },
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: SwitchListTile(
                    value: _emailAlertsEnabled,
                    onChanged: (value) =>
                        setState(() => _emailAlertsEnabled = value),
                    secondary: const Icon(Icons.email_outlined),
                    title: const Text(
                      'Email genuine weather alerts',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(
                      'Send matching alerts to $email. Test and exercise '
                      'products are excluded.',
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Official alert facts and experimental lead estimates are '
                  'shown separately. Email delivery requires an active Scale '
                  'subscription or an approved administrator test account.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(_saving ? 'Saving...' : 'Save Alert Coverage'),
                ),
              ],
            ),
    );
  }
}
