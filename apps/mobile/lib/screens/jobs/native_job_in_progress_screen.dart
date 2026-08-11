import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/tracking_models.dart';
import '../../services/active_job_tracking_service.dart';
import '../scaler/completion/submit_completion_screen.dart';

class NativeJobInProgressScreen extends StatefulWidget {
  const NativeJobInProgressScreen({
    super.key,
    required this.campaign,
    required this.zone,
  });

  final DocumentSnapshot campaign;
  final DocumentSnapshot zone;

  @override
  State<NativeJobInProgressScreen> createState() =>
      _NativeJobInProgressScreenState();
}

class _NativeJobInProgressScreenState extends State<NativeJobInProgressScreen>
    with WidgetsBindingObserver {
  final ActiveJobTrackingService _tracking = ActiveJobTrackingService();
  ActiveTrackingState _state = ActiveTrackingState.inactive;
  Timer? _refreshTimer;
  Timer? _syncTimer;
  bool _working = false;
  String _syncMessage = 'Checking secure device queue…';

  Map<String, dynamic> get _campaignData =>
      Map<String, dynamic>.from(widget.campaign.data() as Map);
  Map<String, dynamic> get _zoneData =>
      Map<String, dynamic>.from(widget.zone.data() as Map);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _refresh(),
    );
    _syncTimer = Timer.periodic(const Duration(seconds: 30), (_) => _sync());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refresh();
      _sync();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refreshTimer?.cancel();
    _syncTimer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final state = await _tracking.recover();
      if (mounted) setState(() => _state = state);
    } catch (error) {
      if (mounted) {
        setState(() => _syncMessage = 'GPS state unavailable: $error');
      }
    }
  }

  Future<void> _sync() async {
    try {
      await _tracking.syncPending();
      if (mounted) setState(() => _syncMessage = 'Synced with Scaled Circle');
      await _refresh();
    } catch (_) {
      if (mounted) {
        setState(
          () => _syncMessage =
              'Offline — GPS evidence is safely queued on this phone',
        );
      }
    }
  }

  String _elapsed() {
    final startedAt = _state.startedAt;
    if (startedAt == null) return '00:00:00';
    final value = DateTime.now().toUtc().difference(startedAt.toUtc());
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(value.inHours)}:${two(value.inMinutes.remainder(60))}:${two(value.inSeconds.remainder(60))}';
  }

  Future<void> _addCheckpoint() async {
    if (_working || !_state.active) return;
    setState(() => _working = true);
    try {
      final location = await _tracking.captureCheckpointLocation();
      if (location == null) {
        throw Exception('Unable to capture a checkpoint GPS fix.');
      }
      final photo = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 82,
      );
      if (photo == null) return;
      final user = FirebaseAuth.instance.currentUser;
      final sessionId = _state.sessionId;
      if (user == null || sessionId == null) {
        throw Exception('Tracking session ended.');
      }
      final reference = FirebaseStorage.instance
          .ref('tracking_checkpoints')
          .child(user.uid)
          .child(sessionId)
          .child('${DateTime.now().toUtc().millisecondsSinceEpoch}.jpg');
      await reference.putData(
        await photo.readAsBytes(),
        SettableMetadata(contentType: 'image/jpeg'),
      );
      await _tracking.registerCheckpoint(
        sessionId: sessionId,
        storagePath: reference.fullPath,
        location: location,
      );
      await _sync();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Checkpoint photo and GPS saved.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Checkpoint failed: $error')));
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _complete() async {
    if (_working) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Complete this job?'),
        content: const Text(
          'This captures a final location, uploads queued evidence, and immediately stops background GPS. This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep Tracking'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Complete Job'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _working = true);
    try {
      final routeId = await _tracking.complete();
      final route = await FirebaseFirestore.instance
          .collection('campaignRoutes')
          .doc(routeId)
          .get();
      final count =
          (route.data()?['pointCount'] as num?)?.toInt() ?? _state.pointCount;
      if (!mounted) return;
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => SubmitCompletionScreen(
            campaignId: widget.campaign.id,
            businessId:
                _campaignData['businessId']?.toString() ??
                _zoneData['businessId']?.toString() ??
                '',
            zoneId: widget.zone.id,
            zoneName: _zoneData['zoneName']?.toString() ?? 'Zone',
            routeId: routeId,
            gpsPointCount: count,
            routeSimulated: false,
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Unable to complete job: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _stopWithoutCompleting() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Stop and cancel tracking?'),
        content: const Text(
          'GPS stops immediately. The job returns to accepted and will not be submitted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Continue Job'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Stop Tracking'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _working = true);
    try {
      await _tracking.cancel();
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final last = _state.lastLocation;
    return PopScope(
      canPop: true,
      child: Scaffold(
        appBar: AppBar(title: const Text('JOB IN PROGRESS')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: const ListTile(
                leading: Icon(Icons.location_searching),
                title: Text(
                  'GPS TRACKING ACTIVE',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(
                  'Tracking continues while the screen is locked or another app is open.',
                ),
              ),
            ),
            const SizedBox(height: 16),
            _StatusRow(label: 'Elapsed time', value: _elapsed()),
            _StatusRow(
              label: 'GPS status',
              value: _state.active ? 'Active' : 'Stopped',
            ),
            _StatusRow(
              label: 'Last location',
              value: last == null
                  ? 'Acquiring accurate fix…'
                  : '${last.latitude.toStringAsFixed(5)}, ${last.longitude.toStringAsFixed(5)} (±${last.horizontalAccuracy.round()} m)',
            ),
            _StatusRow(label: 'Recorded points', value: '${_state.pointCount}'),
            _StatusRow(
              label: 'Sync status',
              value: _state.pendingPointCount == 0
                  ? _syncMessage
                  : '${_state.pendingPointCount} safely queued • $_syncMessage',
            ),
            const _StatusRow(
              label: 'Battery-friendly tracking',
              value: 'Adaptive movement samples; stationary points reduced',
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _working ? null : _addCheckpoint,
              icon: const Icon(Icons.add_a_photo),
              label: const Text('Add checkpoint/photo'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.maybePop(context),
              icon: const Icon(Icons.info_outline),
              label: const Text('Return to job details'),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _working || _state.sessionId == null
                  ? null
                  : _complete,
              icon: const Icon(Icons.task_alt),
              label: Text(
                _working
                    ? 'Finalizing...'
                    : _state.active
                    ? 'Complete Job'
                    : 'Retry Secure Finalization',
              ),
            ),
            const SizedBox(height: 20),
            TextButton(
              onPressed: _working || !_state.active
                  ? null
                  : _stopWithoutCompleting,
              child: const Text('Stop tracking without completing'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(flex: 2, child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    ),
  );
}
