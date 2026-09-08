import 'dart:async';
import 'package:flutter/material.dart';
import '../services/business_workspace_service.dart';
import 'active_route_guidance.dart';
import 'automatic_canvassing_progress.dart';

class BusinessLiveProgressPanel extends StatefulWidget {
  const BusinessLiveProgressPanel({
    super.key,
    required this.zoneId,
    this.service,
    this.tilesEnabled = true,
  });
  final String zoneId;
  final BusinessWorkspaceService? service;
  final bool tilesEnabled;
  @override
  State<BusinessLiveProgressPanel> createState() =>
      _BusinessLiveProgressPanelState();
}

class _BusinessLiveProgressPanelState extends State<BusinessLiveProgressPanel>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _data;
  bool _reading = false, _failed = false;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _read();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _read());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _read();
  }

  Future<void> _read() async {
    if (_reading ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.paused ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.inactive) {
      return;
    }
    _reading = true;
    try {
      final data = await (widget.service ?? BusinessWorkspaceService()).call(
        'getBusinessLiveProgress',
        {'zoneId': widget.zoneId},
      );
      if (mounted) {
        setState(() {
          _data = data;
          _failed = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _data = null;
          _failed = true;
        });
      }
    } finally {
      _reading = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (_failed) {
      return const Text(
        'Live progress is unavailable. Access and progress will be checked again automatically.',
      );
    }
    if (data == null || data['state'] == 'not_available') {
      return const Text(
        'Automatic progress will appear after accepted GPS evidence arrives.',
      );
    }
    final estimate = Map<String, dynamic>.from(data['estimate'] as Map? ?? {});
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          data['active'] == true ? 'Scaler working' : 'Tracking stopped',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        Text('Started: ${_date(data['startedAt'])}'),
        Text('Last accepted GPS update: ${_date(data['lastAcceptedGpsAt'])}'),
        ActiveRouteGuidance(
          automaticGps: true,
          zone: {
            'serviceArea': data['corridor'],
            'executionRoute': data['route'],
          },
          location: null,
          progress: {...estimate, 'path': data['path']},
          tilesEnabled: widget.tilesEnabled,
        ),
        AutomaticCanvassingProgress(
          progress: {...estimate, 'reliable': data['reliable']},
          contract: data,
        ),
        for (final note in data['notes'] as List? ?? [])
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: Text(
              note['kind'] == 'access'
                  ? 'Access issue'
                  : note['kind'] == 'safety'
                  ? 'Safety issue'
                  : 'Scaler note',
            ),
            subtitle: Text(note['note']?.toString() ?? ''),
          ),
        const Text(
          'The map updates automatically while this page is open. Only work-start, coverage thresholds and submission create notifications.',
        ),
      ],
    );
  }

  String _date(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
    return date == null
        ? 'Not yet recorded'
        : '${MaterialLocalizations.of(context).formatShortDate(date)} ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
  }
}
