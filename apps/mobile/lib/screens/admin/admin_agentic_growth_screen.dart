import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

import '../../services/agentic_growth_service.dart';

class AdminAgenticGrowthScreen extends StatefulWidget {
  const AdminAgenticGrowthScreen({super.key, this.service});

  final AgenticGrowthGateway? service;

  @override
  State<AdminAgenticGrowthScreen> createState() =>
      _AdminAgenticGrowthScreenState();
}

class _AdminAgenticGrowthScreenState extends State<AdminAgenticGrowthScreen> {
  late final AgenticGrowthGateway _service =
      widget.service ?? AgenticGrowthService();
  Map<String, dynamic>? _summary;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final summary = await _service.loadAdminSummary();
      if (mounted) {
        setState(() => _summary = summary);
      }
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _error = error.message ?? 'Unable to load AI Team health.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to load AI Team health.');
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('AI Team operations'),
      actions: [
        IconButton(
          onPressed: _load,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: _error != null
        ? Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_error!),
                const SizedBox(height: 12),
                FilledButton(onPressed: _load, child: const Text('Try again')),
              ],
            ),
          )
        : _summary == null
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Card(
                child: ListTile(
                  leading: Icon(Icons.shield_outlined),
                  title: Text('External actions'),
                  subtitle: Text('Provider execution routes: 0'),
                  trailing: Chip(label: Text('Off')),
                ),
              ),
              _status('AI teammates', _summary!['agentCount']),
              _status('Observation runs', _summary!['runCount']),
              if (_summary!['latestRunId'] != null)
                _status('Latest review audit ID', _summary!['latestRunId']),
              _status(
                'Evidence state',
                (_summary!['evidenceStates'] as List? ?? const []).join(', '),
              ),
              _status('Observations', _summary!['observationCount']),
              _status('Recommendations', _summary!['recommendationCount']),
              _status('Executable actions', _summary!['actionObjectCount']),
              _status(
                'Safety controls active',
                _summary!['killSwitchActiveCount'],
              ),
            ],
          ),
  );

  Widget _status(String label, dynamic value) => Card(
    child: ListTile(title: Text(label), trailing: Text('${value ?? 0}')),
  );
}
