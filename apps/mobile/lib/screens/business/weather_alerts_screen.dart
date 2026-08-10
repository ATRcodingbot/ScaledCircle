import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../services/maryland_weather_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/scaled_circle_brand.dart';
import 'subscription_screen.dart';

class WeatherAlertsScreen extends StatefulWidget {
  const WeatherAlertsScreen({super.key});

  @override
  State<WeatherAlertsScreen> createState() => _WeatherAlertsScreenState();
}

class _WeatherAlertsScreenState extends State<WeatherAlertsScreen> {
  final MarylandWeatherService _service = MarylandWeatherService();
  late Future<List<MarylandCountyWeather>> _weather;
  WeatherEntitlement? _entitlement;

  @override
  void initState() {
    super.initState();
    _weather = Future.value(const []);
    _refresh();
  }

  Future<void> _refresh() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final entitlement = await _service.loadEntitlement(user.uid);
    if (!mounted) return;
    setState(() => _entitlement = entitlement);
    if (!entitlement.entitled) return;

    final future = _service.load();
    setState(() => _weather = future);
    await future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const ScaledCircleBrand(compact: true),
        actions: [
          IconButton(
            tooltip: 'Refresh weather alerts',
            onPressed: _refresh,
            icon: const Icon(Icons.refresh),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _entitlement == null
            ? const Center(child: CircularProgressIndicator())
            : !_entitlement!.entitled
            ? _lockedView()
            : FutureBuilder<List<MarylandCountyWeather>>(
                future: _weather,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  final counties =
                      snapshot.data ?? const <MarylandCountyWeather>[];
                  final activeCount = counties.fold<int>(
                    0,
                    (total, county) => total + county.alerts.length,
                  );
                  final horizontalPadding =
                      MediaQuery.sizeOf(context).width > 1060
                      ? (MediaQuery.sizeOf(context).width - 1020) / 2
                      : 20.0;

                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: EdgeInsets.fromLTRB(
                      horizontalPadding,
                      24,
                      horizontalPadding,
                      48,
                    ),
                    children: [
                      DashboardHero(
                        eyebrow: 'Maryland local intelligence',
                        title: activeCount == 0
                            ? 'Weather monitored. No active signals.'
                            : '$activeCount active weather signal${activeCount == 1 ? '' : 's'}.',
                        description:
                            'Official alerts are monitored for Howard, Baltimore, '
                            'Anne Arundel, and Montgomery counties. Opportunity '
                            'ranges are experimental planning estimates.',
                        primaryActionLabel: 'Refresh Signals',
                        primaryActionIcon: Icons.refresh,
                        onPrimaryAction: _refresh,
                        metrics: const [
                          DashboardPill(
                            icon: Icons.verified_outlined,
                            label: 'Official NWS alert facts',
                          ),
                          DashboardPill(
                            icon: Icons.science_outlined,
                            label: 'Experimental lead estimates',
                            accent: AppColors.warning,
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      ...counties.map(_countyCard),
                      const SizedBox(height: 8),
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(18),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.info_outline,
                                color: AppColors.secondary,
                              ),
                              SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Weather alerts describe conditions, not guaranteed '
                                  'leads. Scaled Circle keeps the official weather '
                                  'facts separate from its experimental opportunity '
                                  'model so businesses can make informed decisions.',
                                  style: TextStyle(
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
      ),
    );
  }

  Widget _lockedView() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(24),
      children: [
        DashboardHero(
          eyebrow: 'Premium business intelligence',
          title: 'Unlock Maryland Weather Intelligence.',
          description:
              'Real-time county alerts, opportunity estimates, and service '
              'recommendations are included with the Scale subscription.',
          primaryActionLabel: 'View Scale Upgrade',
          primaryActionIcon: Icons.workspace_premium_outlined,
          onPrimaryAction: () async {
            final upgraded = await Navigator.push<bool>(
              context,
              MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
            );
            if (upgraded == true) await _refresh();
          },
          metrics: const [
            DashboardPill(
              icon: Icons.lock_outline,
              label: 'Scale plan feature',
              accent: AppColors.secondary,
            ),
            DashboardPill(
              icon: Icons.location_on_outlined,
              label: '4 Maryland counties',
            ),
          ],
        ),
      ],
    );
  }

  Widget _countyCard(MarylandCountyWeather county) {
    final alert = county.alerts.firstOrNull;
    if (county.error != null) {
      return Card(
        margin: const EdgeInsets.only(bottom: 14),
        child: ListTile(
          contentPadding: const EdgeInsets.all(18),
          leading: const Icon(Icons.cloud_off, color: AppColors.warning),
          title: Text(county.county.name),
          subtitle: const Text(
            'Live NWS data is temporarily unavailable. Pull down to retry.',
          ),
        ),
      );
    }

    if (alert == null) {
      return Card(
        margin: const EdgeInsets.only(bottom: 14),
        child: ListTile(
          contentPadding: const EdgeInsets.all(18),
          leading: const Icon(
            Icons.verified_user_outlined,
            color: AppColors.primary,
          ),
          title: Text(county.county.name),
          subtitle: const Text('No active National Weather Service alert.'),
          trailing: const Text(
            'MONITORING',
            style: TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w800,
              fontSize: 11,
            ),
          ),
        ),
      );
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.thunderstorm, color: AppColors.warning),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    county.county.name,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Text(
                  alert.severity.toUpperCase(),
                  style: const TextStyle(
                    color: AppColors.warning,
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              alert.event,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Text(
              alert.areaDescription,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),
            Text(
              '+${alert.leadLiftLowPercent}% to +${alert.leadLiftHighPercent}%',
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 28,
                fontWeight: FontWeight.w900,
              ),
            ),
            const Text(
              'Experimental estimated lead opportunity',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
            const SizedBox(height: 12),
            Text(alert.rationale),
            if (alert.services.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: alert.services
                    .map((service) => Chip(label: Text(service)))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
