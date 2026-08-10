import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../../../models/campaign/campaign_completion.dart';
import '../../../models/campaign/campaign_location.dart';
import '../../../services/campaign/campaign_service.dart';
import '../../../services/campaign/completion_photo_service.dart';

class ExactLocationJobScreen extends StatefulWidget {
  const ExactLocationJobScreen({super.key, required this.campaign});

  final DocumentSnapshot campaign;

  @override
  State<ExactLocationJobScreen> createState() => _ExactLocationJobScreenState();
}

class _ExactLocationJobScreenState extends State<ExactLocationJobScreen> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  final CampaignService _campaignService = CampaignService();

  final CompletionPhotoService _photoService = CompletionPhotoService();

  final TextEditingController _notesController = TextEditingController();

  String? _completionId;

  bool _loadingCompletion = true;

  bool _capturingProof = false;

  bool _submitting = false;

  String? _activeProofKey;

  Position? _currentPosition;

  @override
  void initState() {
    super.initState();

    _initializeCompletion();
  }

  @override
  void dispose() {
    _notesController.dispose();

    super.dispose();
  }

  Map<String, dynamic> get _campaignData {
    final data = widget.campaign.data();

    if (data is Map<String, dynamic>) {
      return data;
    }

    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }

    return <String, dynamic>{};
  }

  String get _campaignId {
    return widget.campaign.id;
  }

  String get _campaignName {
    return _campaignData['campaignName']?.toString() ?? 'Campaign';
  }

  String get _campaignType {
    return _campaignData['campaignType']?.toString() ?? '';
  }

  String get _businessId {
    return _campaignData['businessId']?.toString() ?? '';
  }

  bool get _isYardSignCampaign {
    return _campaignType == 'yard_sign_installation';
  }

  bool get _isDumpRun {
    return _campaignType == 'dump_run';
  }

  bool get _isEventMarketing {
    return _campaignType == 'event_marketing';
  }

  String get _screenTitle {
    if (_isYardSignCampaign) {
      return 'Yard Sign Job';
    }

    if (_isDumpRun) {
      return 'Dump Run';
    }

    if (_isEventMarketing) {
      return 'Event Marketing';
    }

    return 'Exact Location Job';
  }

  Future<void> _initializeCompletion() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      if (mounted) {
        setState(() {
          _loadingCompletion = false;
        });
      }

      return;
    }

    try {
      final existingSnapshot = await _firestore
          .collection('campaignCompletions')
          .where('campaignId', isEqualTo: _campaignId)
          .where('scalerId', isEqualTo: user.uid)
          .where('completionType', isEqualTo: 'campaign')
          .limit(1)
          .get();

      if (existingSnapshot.docs.isNotEmpty) {
        final existing = existingSnapshot.docs.first;

        _completionId = existing.id;

        final existingData = existing.data();

        _notesController.text = existingData['scalerNotes']?.toString() ?? '';
      } else {
        if (_businessId.isEmpty) {
          throw Exception('This campaign is missing its business account.');
        }

        final completion = CampaignCompletion(
          id: '',
          campaignId: _campaignId,
          businessId: _businessId,
          scalerId: user.uid,
          scalerEmail: user.email,
          type: CampaignCompletionType.campaign,
          status: CampaignCompletionStatus.inProgress,
          startedAt: DateTime.now(),
        );

        _completionId = await _campaignService.createCompletion(
          completion: completion,
        );
      }

      await _loadCurrentPosition();
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to initialize job completion: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _loadingCompletion = false;
        });
      }
    }
  }

  Future<bool> _ensureLocationPermission() async {
    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      if (!mounted) {
        return false;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Location permission is required to record proof GPS.'),
        ),
      );

      return false;
    }

    if (permission == LocationPermission.deniedForever) {
      if (!mounted) {
        return false;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Location permission is permanently disabled. '
            'Enable it in your device settings.',
          ),
        ),
      );

      return false;
    }

    return true;
  }

  Future<Position?> _loadCurrentPosition() async {
    final allowed = await _ensureLocationPermission();

    if (!allowed) {
      return null;
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      if (mounted) {
        setState(() {
          _currentPosition = position;
        });
      }

      return position;
    } catch (e) {
      if (!mounted) {
        return null;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to get your current location: $e')),
      );

      return null;
    }
  }

  double? _distanceFromLocation(CampaignLocation location) {
    final position = _currentPosition;

    if (position == null || !location.hasValidCoordinates) {
      return null;
    }

    return Geolocator.distanceBetween(
      position.latitude,
      position.longitude,
      location.latitude,
      location.longitude,
    );
  }

  String _formatDistance(double meters) {
    if (meters < 1000) {
      return '${meters.round()} m away';
    }

    final miles = meters / 1609.344;

    return '${miles.toStringAsFixed(1)} mi away';
  }

  Stream<List<CampaignLocation>> _watchCampaignLocations() {
    return _firestore
        .collection('campaignLocations')
        .where('campaignId', isEqualTo: _campaignId)
        .snapshots()
        .map((snapshot) {
          final locations = snapshot.docs
              .map(CampaignLocation.fromDocument)
              .toList();

          locations.sort((a, b) {
            final aCreated =
                a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);

            final bCreated =
                b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);

            return aCreated.compareTo(bCreated);
          });

          return locations;
        });
  }

  Stream<CampaignCompletion?> _watchCompletion() {
    final completionId = _completionId;

    if (completionId == null || completionId.isEmpty) {
      return const Stream<CampaignCompletion?>.empty();
    }

    return _firestore
        .collection('campaignCompletions')
        .doc(completionId)
        .snapshots()
        .map((snapshot) {
          if (!snapshot.exists) {
            return null;
          }

          return CampaignCompletion.fromDocument(snapshot);
        });
  }

  Future<void> _captureYardSignProof(CampaignLocation location) async {
    final completionId = _completionId;

    final user = FirebaseAuth.instance.currentUser;

    if (completionId == null ||
        completionId.isEmpty ||
        user == null ||
        _capturingProof) {
      return;
    }

    setState(() {
      _capturingProof = true;
      _activeProofKey = location.id;
    });

    try {
      final position = await _loadCurrentPosition();

      if (position == null) {
        throw Exception('Current GPS location is required.');
      }

      final photo = await _photoService.takePhoto();

      if (photo == null) {
        return;
      }

      final photoUrl = await _photoService.uploadCompletionPhoto(
        photo: photo,
        campaignId: _campaignId,
        scalerId: user.uid,
        completionId: completionId,
        proofType: 'installation_photo',
        campaignLocationId: location.id,
      );

      await _campaignService.addYardSignProof(
        completionId: completionId,
        campaignLocationId: location.id,
        photoUrl: photoUrl,
        latitude: position.latitude,
        longitude: position.longitude,
        note: location.instructions,
      );

      await _firestore.collection('campaignLocations').doc(location.id).update({
        'status': 'completed',
        'completedByScalerId': user.uid,
        'completedByScalerEmail': user.email,
        'completedLatitude': position.latitude,
        'completedLongitude': position.longitude,
        'completedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      await _firestore
          .collection('campaignCompletions')
          .doc(completionId)
          .update({
            'status': 'in_progress',
            'updatedAt': FieldValue.serverTimestamp(),
          });

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Installation proof saved for '
            '${location.address ?? 'this location'}.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to save installation proof: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _capturingProof = false;
          _activeProofKey = null;
        });
      }
    }
  }

  Future<void> _captureDumpProof(CompletionProofType proofType) async {
    final completionId = _completionId;

    final user = FirebaseAuth.instance.currentUser;

    if (completionId == null ||
        completionId.isEmpty ||
        user == null ||
        _capturingProof) {
      return;
    }

    final proofKey = CompletionProof.proofTypeValue(proofType);

    setState(() {
      _capturingProof = true;
      _activeProofKey = proofKey;
    });

    try {
      final position = await _loadCurrentPosition();

      if (position == null) {
        throw Exception('Current GPS location is required.');
      }

      final photo = await _photoService.takePhoto();

      if (photo == null) {
        return;
      }

      final photoUrl = await _photoService.uploadCompletionPhoto(
        photo: photo,
        campaignId: _campaignId,
        scalerId: user.uid,
        completionId: completionId,
        proofType: proofKey,
      );

      await _campaignService.addDumpRunPhoto(
        completionId: completionId,
        proofType: proofType,
        photoUrl: photoUrl,
        latitude: position.latitude,
        longitude: position.longitude,
      );

      await _firestore
          .collection('campaignCompletions')
          .doc(completionId)
          .update({
            'status': 'in_progress',
            'updatedAt': FieldValue.serverTimestamp(),
          });

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${_dumpProofLabel(proofType)} saved.')),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to save photo proof: $e')));
    } finally {
      if (mounted) {
        setState(() {
          _capturingProof = false;
          _activeProofKey = null;
        });
      }
    }
  }

  Future<void> _captureEventProof(CampaignLocation location) async {
    final completionId = _completionId;

    final user = FirebaseAuth.instance.currentUser;

    if (completionId == null ||
        completionId.isEmpty ||
        user == null ||
        _capturingProof) {
      return;
    }

    setState(() {
      _capturingProof = true;
      _activeProofKey = location.id;
    });

    try {
      final position = await _loadCurrentPosition();

      if (position == null) {
        throw Exception('Current GPS location is required.');
      }

      final proof = CompletionProof(
        id: _firestore.collection('campaignCompletions').doc().id,
        type: CompletionProofType.gpsRoute,
        campaignLocationId: location.id,
        latitude: position.latitude,
        longitude: position.longitude,
        note: 'Event marketing location verified with device GPS.',
        capturedAt: DateTime.now(),
      );

      await _campaignService.addCompletionProof(
        completionId: completionId,
        proof: proof,
      );

      await _firestore.collection('campaignLocations').doc(location.id).update({
        'status': 'completed',
        'completedByScalerId': user.uid,
        'completedLatitude': position.latitude,
        'completedLongitude': position.longitude,
        'completedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Event GPS proof saved.')));
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to save event proof: $e')));
    } finally {
      if (mounted) {
        setState(() {
          _capturingProof = false;
          _activeProofKey = null;
        });
      }
    }
  }

  bool _hasYardSignProof(CampaignCompletion? completion, String locationId) {
    if (completion == null) {
      return false;
    }

    return completion.proofs.any((proof) {
      return proof.type == CompletionProofType.installationPhoto &&
          proof.campaignLocationId == locationId &&
          proof.hasPhoto;
    });
  }

  bool _hasEventProof(CampaignCompletion? completion, String locationId) {
    if (completion == null) {
      return false;
    }

    return completion.proofs.any((proof) {
      return proof.type == CompletionProofType.gpsRoute &&
          proof.campaignLocationId == locationId &&
          proof.latitude != null &&
          proof.longitude != null;
    });
  }

  String _dumpProofLabel(CompletionProofType proofType) {
    switch (proofType) {
      case CompletionProofType.beforePhoto:
        return 'Before Pickup Photo';

      case CompletionProofType.loadedPhoto:
        return 'Loaded Photo';

      case CompletionProofType.receiptPhoto:
        return 'Dump / Receipt Photo';

      case CompletionProofType.afterPhoto:
        return 'After Photo';

      default:
        return 'Photo';
    }
  }

  IconData _dumpProofIcon(CompletionProofType proofType) {
    switch (proofType) {
      case CompletionProofType.beforePhoto:
        return Icons.photo_camera_outlined;

      case CompletionProofType.loadedPhoto:
        return Icons.local_shipping_outlined;

      case CompletionProofType.receiptPhoto:
        return Icons.receipt_long_outlined;

      case CompletionProofType.afterPhoto:
        return Icons.check_circle_outline;

      default:
        return Icons.camera_alt_outlined;
    }
  }

  bool _dumpProofRequirementsComplete(CampaignCompletion? completion) {
    if (completion == null) {
      return false;
    }

    return completion.hasProof(CompletionProofType.beforePhoto) &&
        completion.hasProof(CompletionProofType.loadedPhoto) &&
        completion.hasProof(CompletionProofType.receiptPhoto) &&
        completion.hasProof(CompletionProofType.afterPhoto);
  }

  Future<void> _submitCompletion({
    required CampaignCompletion? completion,
    required List<CampaignLocation> locations,
  }) async {
    if (_submitting) {
      return;
    }

    final completionId = _completionId;

    if (completionId == null || completionId.isEmpty) {
      return;
    }

    if (_isYardSignCampaign) {
      final requiredLocations = locations
          .where(
            (location) =>
                location.type == CampaignLocationType.yardSignInstallation,
          )
          .toList();

      if (requiredLocations.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('This campaign has no yard sign locations.'),
          ),
        );

        return;
      }

      final missingProof = requiredLocations.any(
        (location) => !_hasYardSignProof(completion, location.id),
      );

      if (missingProof) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Every yard sign location requires an '
              'installation photo before submission.',
            ),
          ),
        );

        return;
      }
    }

    if (_isDumpRun && !_dumpProofRequirementsComplete(completion)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Complete all four dump-run photo requirements '
            'before submitting.',
          ),
        ),
      );

      return;
    }

    if (_isEventMarketing) {
      final eventLocations = locations
          .where(
            (location) => location.type == CampaignLocationType.eventLocation,
          )
          .toList();

      final missingProof = eventLocations.any(
        (location) => !_hasEventProof(completion, location.id),
      );

      if (eventLocations.isEmpty || missingProof) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Event GPS verification is required before submission.'),
          ),
        );

        return;
      }
    }

    setState(() {
      _submitting = true;
    });

    try {
      int completedQuantity = 0;

      for (final location in locations) {
        if (location.status == CampaignLocationStatus.completed) {
          completedQuantity += location.quantity;
        }
      }

      await _campaignService.updateCompletion(
        completionId: completionId,
        updates: {'completedQuantity': completedQuantity},
      );

      await _campaignService.submitCompletion(
        completionId: completionId,
        scalerNotes: _notesController.text.trim(),
      );

      if (_businessId.isNotEmpty) {
        await _firestore.collection('notifications').add({
          'userId': _businessId,
          'type': 'campaign_completion_submitted',
          'title': 'Campaign Work Submitted',
          'message':
              '${FirebaseAuth.instance.currentUser?.email ?? 'A Scaler'} '
              'submitted work for $_campaignName.',
          'campaignId': _campaignId,
          'campaignName': _campaignName,
          'completionId': completionId,
          'scalerId': FirebaseAuth.instance.currentUser?.uid,
          'scalerEmail': FirebaseAuth.instance.currentUser?.email,
          'read': false,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Work submitted for business review.')),
      );

      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to submit completion: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  Widget _locationMap(CampaignLocation location) {
    if (!location.hasValidCoordinates) {
      return const SizedBox.shrink();
    }

    final point = LatLng(location.latitude, location.longitude);

    return SizedBox(
      height: 190,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: FlutterMap(
          options: MapOptions(initialCenter: point, initialZoom: 17),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.scaledcircle.app',
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: point,
                  width: 48,
                  height: 48,
                  child: const Icon(
                    Icons.location_pin,
                    color: Colors.red,
                    size: 44,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _yardSignLocationCard({
    required CampaignLocation location,
    required CampaignCompletion? completion,
  }) {
    final proofComplete = _hasYardSignProof(completion, location.id);

    final distance = _distanceFromLocation(location);

    final capturing = _capturingProof && _activeProofKey == location.id;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  child: Icon(
                    proofComplete ? Icons.check : Icons.signpost_outlined,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    location.address ?? 'Pinned Sign Location',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (proofComplete) const Chip(label: Text('COMPLETE')),
              ],
            ),

            const SizedBox(height: 12),

            Text(
              location.quantity == 1 ? '1 sign' : '${location.quantity} signs',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),

            if (location.instructions != null &&
                location.instructions!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(location.instructions!),
            ],

            if (distance != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.my_location, size: 18),
                  const SizedBox(width: 6),
                  Text(_formatDistance(distance)),
                ],
              ),
            ],

            const SizedBox(height: 14),

            _locationMap(location),

            const SizedBox(height: 14),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: proofComplete || _capturingProof
                    ? null
                    : () {
                        _captureYardSignProof(location);
                      },
                icon: capturing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        proofComplete
                            ? Icons.check_circle
                            : Icons.camera_alt_outlined,
                      ),
                label: Text(
                  proofComplete
                      ? 'Installation Proof Saved'
                      : capturing
                      ? 'Saving Photo...'
                      : 'Take Installation Photo',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dumpProofCard({
    required CampaignCompletion? completion,
    required CompletionProofType type,
    required String description,
  }) {
    final complete = completion?.hasProof(type) ?? false;

    final proofKey = CompletionProof.proofTypeValue(type);

    final capturing = _capturingProof && _activeProofKey == proofKey;

    return Card(
      child: ListTile(
        leading: CircleAvatar(
          child: Icon(complete ? Icons.check : _dumpProofIcon(type)),
        ),
        title: Text(
          _dumpProofLabel(type),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text(complete ? 'Photo proof saved.' : description),
        trailing: complete
            ? const Icon(Icons.check_circle)
            : capturing
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : IconButton(
                tooltip: 'Take photo',
                onPressed: _capturingProof
                    ? null
                    : () {
                        _captureDumpProof(type);
                      },
                icon: const Icon(Icons.camera_alt_outlined),
              ),
        onTap: complete || _capturingProof
            ? null
            : () {
                _captureDumpProof(type);
              },
      ),
    );
  }

  Widget _dumpRunContent({
    required List<CampaignLocation> locations,
    required CampaignCompletion? completion,
  }) {
    final pickupLocations = locations
        .where((location) => location.type == CampaignLocationType.dumpPickup)
        .toList();

    final dropoffLocations = locations
        .where((location) => location.type == CampaignLocationType.dumpDropoff)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Dump Run Locations',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 12),

        ...pickupLocations.map((location) {
          return _simpleLocationCard(location, title: 'Pickup Location');
        }),

        ...dropoffLocations.map((location) {
          return _simpleLocationCard(
            location,
            title: 'Dump / Disposal Location',
          );
        }),

        const SizedBox(height: 24),

        const Text(
          'Required Photo Proof',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 10),

        _dumpProofCard(
          completion: completion,
          type: CompletionProofType.beforePhoto,
          description: 'Photograph the material before loading.',
        ),

        _dumpProofCard(
          completion: completion,
          type: CompletionProofType.loadedPhoto,
          description: 'Photograph the loaded vehicle or trailer.',
        ),

        _dumpProofCard(
          completion: completion,
          type: CompletionProofType.receiptPhoto,
          description: 'Photograph the dump receipt or disposal proof.',
        ),

        _dumpProofCard(
          completion: completion,
          type: CompletionProofType.afterPhoto,
          description: 'Photograph the finished pickup area.',
        ),
      ],
    );
  }

  Widget _simpleLocationCard(
    CampaignLocation location, {
    required String title,
  }) {
    final distance = _distanceFromLocation(location);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 6),

            Text(location.address ?? 'Pinned Location'),

            if (location.instructions != null &&
                location.instructions!.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(location.instructions!),
            ],

            if (distance != null) ...[
              const SizedBox(height: 6),
              Text(_formatDistance(distance)),
            ],

            const SizedBox(height: 12),

            _locationMap(location),
          ],
        ),
      ),
    );
  }

  Widget _eventContent({
    required List<CampaignLocation> locations,
    required CampaignCompletion? completion,
  }) {
    final eventLocations = locations
        .where(
          (location) => location.type == CampaignLocationType.eventLocation,
        )
        .toList();

    return Column(
      children: eventLocations.map((location) {
        final complete = _hasEventProof(completion, location.id);

        final capturing = _capturingProof && _activeProofKey == location.id;

        return Card(
          margin: const EdgeInsets.only(bottom: 16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  location.address ?? 'Event Location',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                if (location.instructions != null &&
                    location.instructions!.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(location.instructions!),
                ],

                const SizedBox(height: 12),

                _locationMap(location),

                const SizedBox(height: 12),

                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: complete || _capturingProof
                        ? null
                        : () {
                            _captureEventProof(location);
                          },
                    icon: capturing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            complete
                                ? Icons.check_circle
                                : Icons.my_location,
                          ),
                    label: Text(
                      complete ? 'Event GPS Verified' : 'Verify Event GPS',
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('You must be logged in.')),
      );
    }

    if (_loadingCompletion) {
      return Scaffold(
        appBar: AppBar(title: Text(_screenTitle), centerTitle: true),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_screenTitle),
        centerTitle: true,
        actions: [
          IconButton(
            tooltip: 'Refresh location',
            onPressed: _loadCurrentPosition,
            icon: const Icon(Icons.my_location),
          ),
        ],
      ),
      body: StreamBuilder<List<CampaignLocation>>(
        stream: _watchCampaignLocations(),
        builder: (context, locationSnapshot) {
          if (locationSnapshot.hasError) {
            return Center(
              child: Text(
                'Unable to load job locations: '
                '${locationSnapshot.error}',
              ),
            );
          }

          if (locationSnapshot.connectionState == ConnectionState.waiting &&
              !locationSnapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final locations = locationSnapshot.data ?? [];

          return StreamBuilder<CampaignCompletion?>(
            stream: _watchCompletion(),
            builder: (context, completionSnapshot) {
              final completion = completionSnapshot.data;

              return ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Text(
                    _campaignName,
                    style: const TextStyle(
                      fontSize: 27,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 8),

                  Text(_campaignData['description']?.toString() ?? ''),

                  const SizedBox(height: 18),

                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          const Icon(Icons.location_searching),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _currentPosition == null
                                  ? 'GPS position not loaded yet.'
                                  : 'GPS active • '
                                        '${_currentPosition!.latitude.toStringAsFixed(5)}, '
                                        '${_currentPosition!.longitude.toStringAsFixed(5)}',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 18),

                  if (_isYardSignCampaign)
                    ...locations
                        .where(
                          (location) =>
                              location.type ==
                              CampaignLocationType.yardSignInstallation,
                        )
                        .map(
                          (location) => _yardSignLocationCard(
                            location: location,
                            completion: completion,
                          ),
                        ),

                  if (_isDumpRun)
                    _dumpRunContent(
                      locations: locations,
                      completion: completion,
                    ),

                  if (_isEventMarketing)
                    _eventContent(locations: locations, completion: completion),

                  if (!_isYardSignCampaign && !_isDumpRun && !_isEventMarketing)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(18),
                        child: Text(
                          'This exact-location campaign type '
                          'does not yet have a specialized '
                          'Scaler completion workflow.',
                        ),
                      ),
                    ),

                  const SizedBox(height: 24),

                  TextFormField(
                    controller: _notesController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Notes for Business',
                      hintText: 'Optional completion notes',
                      border: OutlineInputBorder(),
                    ),
                  ),

                  const SizedBox(height: 22),

                  SizedBox(
                    height: 55,
                    child: ElevatedButton.icon(
                      onPressed:
                          _submitting ||
                              completion?.status ==
                                  CampaignCompletionStatus.submitted
                          ? null
                          : () {
                              _submitCompletion(
                                completion: completion,
                                locations: locations,
                              );
                            },
                      icon: _submitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.fact_check_outlined),
                      label: Text(
                        completion?.status == CampaignCompletionStatus.submitted
                            ? 'Submitted for Review'
                            : _submitting
                            ? 'Submitting...'
                            : 'Submit Work for Review',
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),
                ],
              );
            },
          );
        },
      ),
    );
  }
}
