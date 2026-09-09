import '../../config/app_environment.dart';
import 'job_room_screen.dart';
import '../../models/work_lifecycle_presentation.dart';
import '../scaler/completion/submitted_completion_screen.dart';
import '../../widgets/checkpoint_action.dart';
import '../../widgets/automatic_canvassing_progress.dart';
import '../../services/business_workspace_service.dart';
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/tracking_models.dart';
import '../../models/canvassing_photo_policy.dart';
import '../../widgets/active_route_guidance.dart';
import '../../services/active_job_tracking_service.dart';
import '../../services/native_tracking_bridge.dart';
import '../scaler/completion/submit_completion_screen.dart';

class NativeJobInProgressScreen extends StatefulWidget {
  const NativeJobInProgressScreen({
    super.key,
    required this.campaign,
    required this.zone,
    this.trackingService,
  });

  final DocumentSnapshot campaign;
  final DocumentSnapshot zone;
  final ActiveJobTrackingService? trackingService;

  @override
  State<NativeJobInProgressScreen> createState() =>
      _NativeJobInProgressScreenState();
}

class _NativeJobInProgressScreenState extends State<NativeJobInProgressScreen>
    with WidgetsBindingObserver {
  late final ActiveJobTrackingService _tracking;
  ActiveTrackingState _state = ActiveTrackingState.inactive;
  StreamSubscription<DocumentSnapshot>? _zoneSubscription;
  Timer? _zoneLoadTimeout;
  Map<String, dynamic>? _resolvedZone;
  bool _zoneUnavailable = false;
  Timer? _refreshTimer;
  Timer? _syncTimer;
  bool _working = false;
  bool _refreshing = false;
  bool _syncing = false;
  Map<String, dynamic>? _progress;
  Map<String, dynamic> _acceptedContract = {};
  String _syncMessage = 'Checking secure device queue…';
  bool get _photoFree => prohibitsResidentialPhotos(
    _campaignData['campaignType'] ?? _campaignData['type'],
  );
  bool get _pauseAvailable =>
      _photoFree &&
      supportsWorkPause(
        staging: AppEnvironmentConfig.isStaging,
        policyVersion: _campaignData['completionPolicyVersion'],
      );

  Map<String, dynamic> get _campaignData =>
      Map<String, dynamic>.from(widget.campaign.data() as Map);
  Map<String, dynamic> get _zoneData =>
      Map<String, dynamic>.from(widget.zone.data() as Map);

  @override
  void initState() {
    super.initState();
    _tracking =
        widget.trackingService ??
        ActiveJobTrackingService.forCurrentEnvironment();
    WidgetsBinding.instance.addObserver(this);
    _watchZone();
    _refresh();
    _sync();
    _loadAcceptedContract();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _refresh(),
    );
    _syncTimer = Timer.periodic(const Duration(seconds: 30), (_) => _sync());
  }

  void _watchZone() {
    _zoneSubscription?.cancel();
    _zoneLoadTimeout?.cancel();
    _zoneUnavailable = false;
    _zoneLoadTimeout = Timer(const Duration(seconds: 20), () {
      if (mounted && _resolvedZone == null) {
        setState(() => _zoneUnavailable = true);
      }
    });
    _zoneSubscription = widget.zone.reference.snapshots().listen(
      (snapshot) {
        if (!mounted) return;
        if (!snapshot.exists) {
          setState(() => _zoneUnavailable = true);
          return;
        }
        final data = Map<String, dynamic>.from(snapshot.data() as Map);
        if (workIsSubmitted(data['status']?.toString()) ||
            workSection(data['status']?.toString()) == WorkSection.completed) {
          _refreshTimer?.cancel();
          _syncTimer?.cancel();
        }
        setState(() {
          _resolvedZone = data;
          _zoneUnavailable = false;
        });
      },
      onError: (_) {
        if (mounted) setState(() => _zoneUnavailable = true);
      },
    );
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
    _zoneSubscription?.cancel();
    _zoneLoadTimeout?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      // The one-second timer updates local elapsed/GPS state only. Server
      // reconciliation belongs to the bounded sync interval, not every tick.
      final state = await _tracking
          .recover(reconcileWithServer: false)
          .timeout(const Duration(seconds: 10));
      if (mounted) setState(() => _state = state);
    } catch (error) {
      if (mounted) {
        setState(() => _syncMessage = 'GPS state unavailable: $error');
      }
    } finally {
      _refreshing = false;
    }
  }

  Future<void> _sync() async {
    if (_syncing) return;
    _syncing = true;
    try {
      await _tracking.syncPending().timeout(const Duration(seconds: 45));
      final progress = await _tracking.getProgress();
      if (mounted) setState(() => _progress = progress);
      if (mounted) setState(() => _syncMessage = 'Synced with Scaled Circle');
      await _refresh();
    } catch (_) {
      if (mounted) {
        setState(() => _progress = {'state': 'unavailable'});
        setState(
          () => _syncMessage =
              'Offline — GPS evidence is safely queued on this phone',
        );
      }
    } finally {
      _syncing = false;
    }
  }

  List<TestRouteCoordinate> _testZone() {
    List<TestRouteCoordinate> parse(dynamic raw) {
      if (raw is! List) return const [];
      return raw
          .map((value) {
            if (value is GeoPoint) {
              return TestRouteCoordinate(value.latitude, value.longitude);
            }
            if (value is Map) {
              final latitude = value['latitude'] ?? value['lat'];
              final longitude = value['longitude'] ?? value['lng'];
              if (latitude is num && longitude is num) {
                return TestRouteCoordinate(
                  latitude.toDouble(),
                  longitude.toDouble(),
                );
              }
            }
            return null;
          })
          .whereType<TestRouteCoordinate>()
          .toList(growable: false);
    }

    final zone = parse(_zoneData['serviceArea']);
    if (zone.length >= 3) return zone;
    return parse(_campaignData['serviceArea']);
  }

  Future<void> _runTestRoute() async {
    final harness = _tracking.emulatorHarness;
    if (_working || harness == null) return;
    setState(() => _working = true);
    try {
      final count = await harness.runDeterministicRoute(_testZone());
      await _sync();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$count deterministic test samples synced.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Test route unavailable: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  void _toggleTestPause() {
    final harness = _tracking.emulatorHarness;
    if (harness == null) return;
    setState(() {
      if (harness.paused) {
        harness.resume();
      } else {
        harness.pause();
      }
    });
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
      String? storagePath;
      final sessionId = _state.sessionId;
      if (sessionId == null) throw Exception('Tracking session ended.');
      if (!_photoFree) {
        final photo = await ImagePicker().pickImage(
          source: ImageSource.camera,
          imageQuality: 82,
        );
        if (photo == null) return;
        final user = FirebaseAuth.instance.currentUser;
        if (user == null) {
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
        storagePath = reference.fullPath;
      }
      await _tracking.registerCheckpoint(
        sessionId: sessionId,
        storagePath: storagePath,
        location: location,
      );
      await _sync();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _photoFree
                  ? 'Optional progress mark saved. Route GPS continues automatically.'
                  : 'Checkpoint photo and GPS saved.',
            ),
          ),
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

  bool get _baseCoverageReached =>
      _progress?['state'] == 'available' &&
      (_progress?['coveragePercentage'] as num? ?? -1) >= 80;

  Future<void> _loadAcceptedContract() async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .doc('assignmentCompensations/${widget.zone.id}')
          .get(const GetOptions(source: Source.server))
          .timeout(const Duration(seconds: 20));
      if (mounted) setState(() => _acceptedContract = snapshot.data() ?? {});
    } catch (_) {
      /* Unknown accepted terms remain visibly unknown. */
    }
  }

  Future<void> _reportAccessIssue() async {
    final controller = TextEditingController();
    final summary = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Report Access Issue'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          maxLength: 2500,
          decoration: const InputDecoration(
            hintText:
                'Describe the gate, safety concern or access restriction. Do not enter unauthorized areas.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                Navigator.pop(dialogContext, controller.text.trim());
              }
            },
            child: const Text('Send for review'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (summary == null || !mounted) return;
    try {
      await BusinessWorkspaceService().call('addActiveWorkNote', {
        'zoneId': widget.zone.id,
        'kind': 'access',
        'note': summary,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Access issue recorded for review. Coverage and pay have not been changed.',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Issue was not confirmed. Please retry.'),
          ),
        );
      }
    }
  }

  Future<void> _complete() async {
    if (_working) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          _photoFree
              ? (_baseCoverageReached
                    ? 'Finish this route?'
                    : 'Save route for exception or technical review?')
              : 'Complete this job?',
        ),
        content: const Text(
          'Your route will be saved and tracking will stop. You can review your work before submitting it to the Business.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep Tracking'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(_photoFree ? 'Save route' : 'Complete Job'),
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
          .get(const GetOptions(source: Source.server))
          .timeout(const Duration(seconds: 20));
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
            canvassing: _photoFree,
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Finalization could not be confirmed. Your saved evidence is retained. '
              'Check your connection, then check completion again.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _pauseWork() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Pause & Finish Later?'),
        content: const Text(
          'Your route will sync and GPS will stop. You have 24 hours to resume the same job. Saved evidence and any secured base or bonus are preserved. The Business can review the saved work.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep working'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Pause & Finish Later'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _working = true);
    try {
      await _tracking.pauseAndFinishLater(zoneId: widget.zone.id);
      if (mounted) {
        await Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(
            builder: (_) => JobRoomScreen(zoneId: widget.zone.id),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Pause is not yet confirmed. Your saved route is retained. Reconnect, then retry Pause & Finish Later.',
            ),
          ),
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
    if (_zoneUnavailable || _resolvedZone == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checking work status')),
        body: Center(
          child: _zoneUnavailable
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Work status is unavailable. Retry before taking another action.',
                    ),
                    TextButton(
                      onPressed: () {
                        setState(() {});
                        _watchZone();
                      },
                      child: const Text('Retry'),
                    ),
                  ],
                )
              : const CircularProgressIndicator(),
        ),
      );
    }
    if (workIsSubmitted(_resolvedZone!['status']?.toString()) ||
        workSection(_resolvedZone!['status']?.toString()) ==
            WorkSection.completed) {
      return SubmittedCompletionScreen(zoneId: widget.zone.id);
    }
    final last = _state.lastLocation;
    return PopScope(
      canPop: true,
      child: Scaffold(
        appBar: AppBar(title: const Text('Job in Progress')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            ActiveRouteGuidance(
              automaticGps: _photoFree,
              zone: _zoneData,
              location: _state.lastLocation,
              progress: _progress,
            ),
            if (_tracking.emulatorHarness != null) ...[
              Card(
                color: const Color(0xFFFFE8A3),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'TEST / EMULATOR ONLY',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF6B3D00),
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Deterministic location samples use the normal secure '
                        'session, queue, chunk, and completion pipeline.',
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _working || !_state.active
                            ? null
                            : _runTestRoute,
                        icon: const Icon(Icons.route),
                        label: const Text('Run Simulated Route'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _working || !_state.active
                            ? null
                            : _toggleTestPause,
                        icon: Icon(
                          _tracking.emulatorHarness!.paused
                              ? Icons.play_arrow
                              : Icons.pause,
                        ),
                        label: Text(
                          _tracking.emulatorHarness!.paused
                              ? 'Resume'
                              : 'Pause',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: ListTile(
                leading: const Icon(Icons.location_searching),
                title: Text(
                  _state.active
                      ? 'Route Tracking Active'
                      : 'Route Tracking Stopped',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(
                  _state.active
                      ? 'Tracking continues while the screen is locked or another app is open.'
                      : 'Tracking is stopped. Saved route evidence is preserved.',
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (_photoFree)
              AutomaticCanvassingProgress(
                progress: _progress ?? {},
                contract: _acceptedContract,
              ),
            ExpansionTile(
              title: const Text('Tracking details'),
              children: [
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
                _StatusRow(
                  label: 'Recorded points',
                  value: '${_state.pointCount}',
                ),
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
              ],
            ),
            const SizedBox(height: 24),
            CheckpointAction(
              jobType: _campaignData['campaignType'] ?? _campaignData['type'],
              onPressed: _working ? null : _addCheckpoint,
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.maybePop(context),
              icon: const Icon(Icons.info_outline),
              label: const Text('Return to job details'),
            ),
            const SizedBox(height: 12),
            if (_photoFree) ...[
              const Text(
                'GPS records automatically. Full accepted base at 80% eligible route coverage; accepted coverage bonus at 95%. Aim for 100%. Final lifecycle and evidence checks apply.',
              ),
              OutlinedButton(
                onPressed: _working ? null : _reportAccessIssue,
                child: const Text('Report Access Issue'),
              ),
            ],
            if (_photoFree && !_baseCoverageReached)
              OutlinedButton.icon(
                onPressed: _working || _state.sessionId == null
                    ? null
                    : _complete,
                icon: const Icon(Icons.help_outline),
                label: const Text('Review saved route / exception'),
              ),
            if (!_photoFree || _baseCoverageReached)
              FilledButton.icon(
                onPressed: _working || _state.sessionId == null
                    ? null
                    : _complete,
                icon: const Icon(Icons.task_alt),
                label: Text(
                  _working
                      ? 'Finalizing...'
                      : _state.active
                      ? (_photoFree
                            ? (_baseCoverageReached
                                  ? 'Finish Route'
                                  : 'Save Route for Review')
                            : 'Complete Job')
                      : 'Retry Secure Finalization',
                ),
              ),
            const SizedBox(height: 20),
            TextButton(
              onPressed: _working
                  ? null
                  : _pauseAvailable
                  ? _pauseWork
                  : !_state.active
                  ? null
                  : _stopWithoutCompleting,
              child: Text(
                _pauseAvailable
                    ? 'Pause & Finish Later'
                    : 'Stop tracking without completing',
              ),
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
