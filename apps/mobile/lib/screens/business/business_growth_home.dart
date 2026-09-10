import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../../navigation/app_router.dart';
import '../../navigation/context_back_button.dart';

class BusinessGrowthHome extends StatefulWidget {
  const BusinessGrowthHome({super.key, this.loadOverride});
  final Future<Map<String, dynamic>> Function()? loadOverride;
  @override
  State<BusinessGrowthHome> createState() => _BusinessGrowthHomeState();
}

class _BusinessGrowthHomeState extends State<BusinessGrowthHome> {
  Map<String, dynamic>? _data;
  bool _failed = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final data = await (widget.loadOverride?.call() ?? _loadCustomer());
      if (mounted) setState(() => _data = data);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<Map<String, dynamic>> _loadCustomer() async {
    final result = await FirebaseFunctions.instanceFor(region: 'us-east1')
        .httpsCallable('customerGrowthOperationsV1')
        .call({'operation': 'load'})
        .timeout(const Duration(seconds: 25));
    return Map<String, dynamic>.from(result.data as Map);
  }

  @override
  Widget build(BuildContext context) {
    final summary = _data?['summary'] as Map?;
    final agents = (_data?['agents'] as List? ?? []).whereType<Map>();
    return Scaffold(
      appBar: AppBar(
        leading: const ContextBackButton(
          fallback: '/business',
          businessOnly: true,
        ),
        title: const Text('Growth'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Your Growth team',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const Text(
            'Private Beta · Research, recommendations and drafts. You decide what happens next.',
          ),
          const SizedBox(height: 16),
          if (_failed) ...[
            const Text(
              'Your Growth workspace could not be opened. Use your invited Business account with an active Managed Growth membership, then retry.',
            ),
            TextButton(onPressed: _load, child: const Text('Retry')),
          ] else if (_data == null)
            const Center(child: CircularProgressIndicator())
          else ...[
            Text(
              'Needs your attention',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Text(
              '${summary?['awaitingApproval'] ?? 0} sourced drafts need review',
            ),
            for (final group
                in (summary?['opportunityGroups'] as List? ?? [])
                    .whereType<Map>())
              Text('${group['count']} ${group['label']}'),
            Text('${_data?['social']?['planCount'] ?? 0} saved Social plans'),
            const SizedBox(height: 12),
            for (final type in [
              'growth_strategist',
              'lead_generation',
              'workforce_recruiter',
              'marketing_manager',
              'ad_manager',
              'business_assistant',
            ])
              for (final agent in agents.where((a) => a['type'] == type))
                Card(
                  child: ListTile(
                    title: Text('${agent['name']}'),
                    subtitle: Text('${agent['status']}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => AppNavigation.push(
                      context,
                      type == 'marketing_manager'
                          ? '/business/social-operations'
                          : '/business/growth-agents?agent=$type',
                    ),
                  ),
                ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () =>
                  AppNavigation.push(context, '/business/growth-agents'),
              child: const Text('Open Growth Team'),
            ),
          ],
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => AppNavigation.push(context, '/referral-portal'),
            child: const Text('Referral Program'),
          ),
        ],
      ),
    );
  }
}
