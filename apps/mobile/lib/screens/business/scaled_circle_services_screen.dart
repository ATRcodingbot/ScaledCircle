import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/scaled_circle_service_catalog.dart';
import '../preferences/areas_preferences_screen.dart';
import 'managed_growth_screen.dart';
import 'property_intelligence_center_screen.dart';
import 'subscription_screen.dart';
import 'weather_alerts_screen.dart';

class ScaledCircleServicesScreen extends StatelessWidget {
  const ScaledCircleServicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) {
      return const Scaffold(
        body: Center(child: Text('Business login required.')),
      );
    }
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('wallets')
          .doc(uid)
          .snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() ?? const <String, dynamic>{};
        final plan = data['subscriptionPlan']?.toString().toLowerCase();
        final status = data['subscriptionStatus']?.toString() ?? 'inactive';
        return Scaffold(
          appBar: AppBar(title: const Text('ScaledCircle Services')),
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              _subscription(plan, status),
              const SizedBox(height: 16),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.location_on_outlined),
                  title: const Text('My Service Areas'),
                  subtitle: const Text(
                    'Tell ScaledCircle where you work and what jobs matter to you.',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          const AreasPreferencesScreen(role: 'business'),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ..._catalog(context, plan),
              const SizedBox(height: 16),
              _financialOverview(),
              const SizedBox(height: 16),
              _growthAnalytics(),
            ],
          ),
        );
      },
    );
  }

  Widget _subscription(String? plan, String status) => Card(
    child: ListTile(
      leading: const Icon(Icons.workspace_premium_outlined),
      title: const Text('SUBSCRIPTION'),
      subtitle: Text('${_planName(plan)} • ${_price(plan)} • $status'),
    ),
  );

  List<Widget> _catalog(BuildContext context, String? plan) {
    final widgets = <Widget>[];
    for (final category in const [
      'INTELLIGENCE',
      'GROWTH',
      'EXECUTION',
      'ANALYTICS',
    ]) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 6),
          child: Text(
            category,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
      );
      for (final item in ScaledCircleServiceCatalog.items.where(
        (item) => item.category == category,
      )) {
        final entitled = item.entitledFor(plan) && !item.comingSoon;
        widgets.add(
          Card(
            child: ListTile(
              enabled: entitled,
              leading: Icon(
                entitled ? Icons.apps_outlined : Icons.lock_outline,
              ),
              title: Text(item.name),
              subtitle: Text(
                item.comingSoon
                    ? 'COMING SOON • Not currently available'
                    : entitled
                    ? item.beta
                          ? 'Included • BETA'
                          : 'Included'
                    : 'Requires ${_planName(item.requiredPlan)} • Upgrade / Learn More',
              ),
              trailing: item.comingSoon
                  ? const Chip(label: Text('COMING SOON'))
                  : item.beta
                  ? const Chip(label: Text('BETA'))
                  : null,
              onTap: () =>
                  entitled ? _open(context, item.name) : _upgrade(context),
            ),
          ),
        );
      }
    }
    return widgets;
  }

  Widget _financialOverview() => const Card(
    child: Padding(
      padding: EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SPEND & FUNDING',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 10),
          Text('Advertising — Planned budget: No data'),
          Text('Advertising — Actual spend: Not connected'),
          Text('Planned ad budget is not a stored-money balance.'),
          Divider(),
          Text('Direct Mail — Printing: No approved quote'),
          Text('Direct Mail — Postage: No approved quote'),
          Text('Direct Mail — Management fee: No approved quote'),
          Text('Vendor costs and ScaledCircle fees remain separate.'),
          Divider(),
          Text(
            'Field Campaigns — Uses existing authoritative campaign funding and payment records.',
          ),
        ],
      ),
    ),
  );

  Widget _growthAnalytics() => const Card(
    child: Padding(
      padding: EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'GROWTH ANALYTICS',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              Chip(label: Text('7 days')),
              Chip(label: Text('30 days • default')),
              Chip(label: Text('90 days')),
              Chip(label: Text('Custom')),
            ],
          ),
          SizedBox(height: 10),
          Text(
            'Social — Planned/generated/approved: No data; published: Not connected',
          ),
          Text('SEO — Recommendations/manual progress: No data'),
          Text('AI — Analyses and plans generated: No data'),
          Text(
            'Advertising — Planned budget: No data; actual spend: Not connected',
          ),
          Text(
            'Direct Mail — Planned pieces/cost: No data; mailed: Not connected',
          ),
          Text(
            'Field Campaigns — Created/completed/verified coverage use authoritative campaign records',
          ),
          Text(
            'Email — Planned/generated: No data; sent/opened/clicked: Not connected',
          ),
        ],
      ),
    ),
  );

  void _open(BuildContext context, String name) {
    final page = switch (name) {
      'Property Intelligence' => const PropertyIntelligenceCenterScreen(),
      'Weather Intelligence' => const WeatherAlertsScreen(),
      'AI Business Analysis' ||
      'Growth Plan' ||
      'Social Content' ||
      'Advertising' ||
      'SEO' ||
      'Email' ||
      'Postcards / Direct Mail' ||
      'Growth Analytics' => const ManagedGrowthScreen(),
      _ => null,
    };
    if (page != null) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    }
  }

  void _upgrade(BuildContext context) => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
  );

  String _planName(String? plan) => switch (plan) {
    'starter' => 'Starter',
    'growth' => 'Growth',
    'scale' => 'Scale',
    'managed_growth' => 'Managed Growth',
    _ => 'No active plan',
  };
  String _price(String? plan) => switch (plan) {
    'starter' => r'$99/month',
    'growth' => r'$299/month',
    'scale' => r'$499/month',
    'managed_growth' => r'$999/month',
    _ => 'No monthly subscription',
  };
}
