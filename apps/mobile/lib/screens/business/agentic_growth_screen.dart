import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

import '../../services/agentic_growth_service.dart';

class AgenticGrowthScreen extends StatefulWidget {
  const AgenticGrowthScreen({super.key, this.service});

  final AgenticGrowthGateway? service;

  @override
  State<AgenticGrowthScreen> createState() => _AgenticGrowthScreenState();
}

class _AgenticGrowthScreenState extends State<AgenticGrowthScreen> {
  late final AgenticGrowthGateway _service =
      widget.service ?? AgenticGrowthService();
  AgenticGrowthWorkspace? _workspace;
  bool _loading = true;
  bool _working = false;
  String? _error;
  String? _runResult;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final workspace = await _service.load();
      if (mounted) {
        setState(() => _workspace = workspace);
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _error = error.message ?? 'Unable to load your AI Team.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to load your AI Team.');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _initialize() async {
    setState(() => _working = true);
    try {
      await _service.initialize();
      await _load();
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _error = error.message ?? 'Setup could not be completed.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _working = false);
      }
    }
  }

  Future<void> _observe() async {
    setState(() {
      _working = true;
      _runResult = null;
    });
    try {
      final day = DateTime.now()
          .toUtc()
          .toIso8601String()
          .substring(0, 10)
          .replaceAll('-', '');
      final result = await _service.runMarketingObserve(
        'scaledcircle_observe_$day',
      );
      if (mounted) {
        setState(
          () => _runResult =
              'Review complete · ${result['recommendationCount'] ?? 0} recommendation(s)',
        );
      }
      await _load();
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _error = error.message ?? 'The review could not be completed.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _working = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('AI Team'),
      actions: [
        IconButton(
          onPressed: _working ? null : _load,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _load,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          )
        : _content(context),
  );

  Widget _content(BuildContext context) {
    final workspace = _workspace!;
    if (!workspace.initialized) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.groups_2_outlined, size: 52),
              const SizedBox(height: 12),
              Text(
                'Your AI Team is ready to be set up.',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              const Text(
                'It starts in observation and draft-only modes. External actions stay off.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _working ? null : _initialize,
                child: const Text('Set up AI Team'),
              ),
            ],
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            leading: const Icon(Icons.shield_outlined),
            title: const Text('External actions'),
            subtitle: const Text(
              'Posts, messages, calls, bookings, and ads cannot run.',
            ),
            trailing: const Chip(label: Text('Off')),
          ),
        ),
        const SizedBox(height: 12),
        Text('Your team', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        ...workspace.agents.map(
          (agent) => Card(
            child: ListTile(
              leading: const Icon(Icons.auto_awesome_outlined),
              title: Text(agent['name']?.toString() ?? 'AI teammate'),
              subtitle: Text(agent['state']?.toString() ?? 'Off'),
            ),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _working ? null : _observe,
          icon: const Icon(Icons.visibility_outlined),
          label: const Text('Review current marketing plan'),
        ),
        if (_runResult != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(_runResult!, textAlign: TextAlign.center),
          ),
        const SizedBox(height: 20),
        Text('Latest review', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        if (workspace.observations.isEmpty)
          const Card(
            child: ListTile(
              leading: Icon(Icons.visibility_outlined),
              title: Text('No completed review yet'),
            ),
          )
        else
          Card(
            child: ListTile(
              leading: const Icon(Icons.visibility_outlined),
              title: Text(
                workspace.observations.first['evidenceState']?.toString() ==
                        'NO_DATA'
                    ? 'More evidence is needed'
                    : 'Marketing evidence reviewed',
              ),
              subtitle: Text(
                workspace.observations.first['summary']?.toString() ??
                    'The review completed without external actions.',
              ),
            ),
          ),
        const SizedBox(height: 20),
        Text('Recommendations', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        if (workspace.recommendations.isEmpty)
          const Card(
            child: ListTile(
              leading: Icon(Icons.inbox_outlined),
              title: Text('No recommendations yet'),
              subtitle: Text(
                'Run a marketing review when a Social plan is ready.',
              ),
            ),
          )
        else
          ...workspace.recommendations.map(
            (item) => Card(
              child: ListTile(
                title: Text(
                  '${item['recommendation'] ?? 'Review'} · ${item['platform'] ?? 'Social'}',
                ),
                subtitle: Text(
                  item['reason']?.toString() ??
                      'Review the supporting evidence.',
                ),
                trailing: item['founderActionNeeded'] == true
                    ? const Chip(label: Text('Needs review'))
                    : const Chip(label: Text('Observed')),
              ),
            ),
          ),
      ],
    );
  }
}
