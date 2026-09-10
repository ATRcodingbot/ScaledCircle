import 'package:flutter/material.dart';

class GrowthTerritoriesDialog extends StatefulWidget {
  const GrowthTerritoriesDialog({
    super.key,
    required this.scope,
    required this.call,
  });
  final Map<String, dynamic> scope;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) call;
  @override
  State<GrowthTerritoriesDialog> createState() =>
      _GrowthTerritoriesDialogState();
}

class _GrowthTerritoriesDialogState extends State<GrowthTerritoriesDialog> {
  final _query = TextEditingController();
  late final List<Map<String, dynamic>> _areas =
      (widget.scope['areas'] as List? ?? [])
          .map(
            (a) => <String, dynamic>{
              'selectionId': a['id'],
              'label': a['label'],
            },
          )
          .toList();
  List<Map<String, dynamic>> _results = [];
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _run(bool save) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.call(
        save
            ? {
                'action': 'save',
                'input': {
                  'selectionIds': _areas.map((a) => a['selectionId']).toList(),
                  'expectedRevision': widget.scope['preferenceVersion'],
                },
              }
            : {
                'action': 'search',
                'input': {'query': _query.text},
              },
      );
      if (!mounted) return;
      if (save) {
        Navigator.of(context).pop(true);
        return;
      }
      setState(
        () => _results = (result['results'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Could not confirm this change. Retry, or reopen territories to refresh saved state.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Growth territories'),
    content: SizedBox(
      width: 520,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'These priorities apply only to ScaledCircle’s internal Growth Agents.',
            ),
            for (var i = 0; i < _areas.length; i++)
              ListTile(
                title: Text('Priority ${i + 1}: ${_areas[i]['label']}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Move up',
                      onPressed: _busy || i == 0
                          ? null
                          : () => setState(() {
                              final a = _areas.removeAt(i);
                              _areas.insert(i - 1, a);
                            }),
                      icon: const Icon(Icons.arrow_upward),
                    ),
                    IconButton(
                      tooltip: 'Remove area',
                      onPressed: _busy
                          ? null
                          : () => setState(() => _areas.removeAt(i)),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
            TextField(
              controller: _query,
              enabled: !_busy,
              decoration: const InputDecoration(
                labelText: 'City, county or ZIP',
              ),
            ),
            TextButton(
              onPressed: _busy ? null : () => _run(false),
              child: const Text('Search areas'),
            ),
            for (final area in _results)
              ListTile(
                title: Text('${area['label']}'),
                subtitle: Text('${area['type']}'),
                trailing: TextButton(
                  onPressed:
                      _busy ||
                          _areas.length >= 8 ||
                          _areas.any(
                            (a) => a['selectionId'] == area['selectionId'],
                          )
                      ? null
                      : () => setState(() => _areas.add(area)),
                  child: const Text('Add area'),
                ),
              ),
            if (_error != null) Text(_error!),
            if (_busy) const LinearProgressIndicator(),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.of(context).pop(),
        child: const Text('Close'),
      ),
      FilledButton(
        onPressed: _busy || _areas.isEmpty ? null : () => _run(true),
        child: const Text('Save priorities'),
      ),
    ],
  );
}
