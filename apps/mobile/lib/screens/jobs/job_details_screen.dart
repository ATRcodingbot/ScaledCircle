import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';

import '../../services/completion_payout_service.dart';
import '../../services/completion_tracking_service.dart';
import '../../widgets/home_completion_counter.dart';
import 'job_tracking_screen.dart';

class JobDetailsScreen extends StatefulWidget {
  final DocumentSnapshot campaign;

  const JobDetailsScreen({super.key, required this.campaign});

  @override
  State<JobDetailsScreen> createState() => _JobDetailsScreenState();
}

class _JobDetailsScreenState extends State<JobDetailsScreen> {
  CollectionReference<Map<String, dynamic>> get _zonesCollection {
    return FirebaseFirestore.instance.collection('campaignZones');
  }

  Future<void> applyForCampaign() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must be logged in to apply.')),
      );

      return;
    }

    final firestore = FirebaseFirestore.instance;

    final applicationRef = firestore
        .collection('applications')
        .doc('${widget.campaign.id}_${user.uid}');

    try {
      await firestore.runTransaction((transaction) async {
        final campaignSnapshot = await transaction.get(
          widget.campaign.reference,
        );

        final applicationSnapshot = await transaction.get(applicationRef);

        if (!campaignSnapshot.exists) {
          throw Exception('Campaign no longer exists.');
        }

        final data = campaignSnapshot.data() as Map<String, dynamic>;

        final status = data['status']?.toString() ?? 'open';

        if (status != 'open') {
          throw Exception('Campaign is not accepting applications.');
        }

        if (applicationSnapshot.exists) {
          throw Exception('You already applied.');
        }

        final campaignName =
            data['campaignName']?.toString() ?? 'Untitled Campaign';

        final businessId = data['businessId']?.toString();

        transaction.set(applicationRef, {
          'campaignId': widget.campaign.id,
          'campaignName': campaignName,
          'businessId': businessId,
          'businessEmail': data['businessEmail'],
          'scalerId': user.uid,
          'scalerEmail': user.email ?? 'Scaler',
          'status': 'pending',
          'appliedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });

        transaction.update(widget.campaign.reference, {
          'applications': FieldValue.increment(1),
        });

        if (businessId != null && businessId.isNotEmpty) {
          final notification = firestore.collection('notifications').doc();

          transaction.set(notification, {
            'userId': businessId,
            'type': 'application_received',
            'title': 'New Scaler Application',
            'message': '${user.email ?? 'Scaler'} applied to $campaignName',
            'campaignId': widget.campaign.id,
            'campaignName': campaignName,
            'scalerId': user.uid,
            'scalerEmail': user.email ?? 'Scaler',
            'read': false,
            'createdAt': FieldValue.serverTimestamp(),
          });
        }
      });

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Application submitted successfully.')),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to apply: $e')));
    }
  }

  Future<QueryDocumentSnapshot<Map<String, dynamic>>?>
  _getAssignedZone() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return null;
    }

    final snapshot = await _zonesCollection
        .where('campaignId', isEqualTo: widget.campaign.id)
        .where('assignedScalerId', isEqualTo: user.uid)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) {
      return null;
    }

    return snapshot.docs.first;
  }

  Future<void> startZoneJob() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    try {
      final zone = await _getAssignedZone();

      if (zone == null) {
        throw Exception('No assigned zone found.');
      }

      final data = zone.data();

      final assignedScaler = data['assignedScalerId']?.toString();

      if (assignedScaler != user.uid) {
        throw Exception('Zone is not assigned to you.');
      }

      final status = data['status']?.toString() ?? 'assigned';

      if (status != 'assigned' && status != 'accepted') {
        throw Exception('Zone cannot be started.');
      }

      await zone.reference.update({
        'status': 'in_progress',
        'startedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${data['zoneName'] ?? 'Zone'} started.')),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to start zone: $e')));
    }
  }

  Future<XFile?> pickInstallationPhoto() async {
    if (!mounted) {
      return null;
    }

    final picker = ImagePicker();

    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheetContext) {
        return SafeArea(
          child: Wrap(
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: const Text('Take Photo'),
                onTap: () {
                  Navigator.pop(sheetContext, ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: const Text('Choose From Gallery'),
                onTap: () {
                  Navigator.pop(sheetContext, ImageSource.gallery);
                },
              ),
            ],
          ),
        );
      },
    );

    if (!mounted || source == null) {
      return null;
    }

    return picker.pickImage(source: source, imageQuality: 85);
  }

  Future<void> submitJob({required XFile installationPhoto}) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    try {
      final storage = FirebaseStorage.instance;

      final photoRef = storage
          .ref()
          .child('installation_proofs')
          .child(widget.campaign.id)
          .child('${DateTime.now().millisecondsSinceEpoch}.jpg');

      await photoRef.putData(
        await installationPhoto.readAsBytes(),
        SettableMetadata(contentType: 'image/jpeg'),
      );

      final photoUrl = await photoRef.getDownloadURL();

      final firestore = FirebaseFirestore.instance;

      final zone = await _getAssignedZone();

      if (zone == null) {
        throw Exception('No assigned zone found.');
      }

      final zoneSnapshot = await zone.reference.get();

      if (!zoneSnapshot.exists) {
        throw Exception('Zone no longer exists.');
      }

      final zoneData = zoneSnapshot.data()!;

      if (zoneData['assignedScalerId']?.toString() != user.uid) {
        throw Exception('This zone is not assigned to you.');
      }

      final zoneStatus = zoneData['status']?.toString() ?? 'assigned';

      if (zoneStatus != 'in_progress') {
        throw Exception('Start the zone before submitting.');
      }

      if (zoneData['gpsTracking'] == true) {
        throw Exception('Stop GPS tracking before submitting.');
      }

      final routeId = zoneData['routeId']?.toString();

      if (routeId == null || routeId.isEmpty) {
        throw Exception('GPS route required.');
      }

      final routeReference = firestore
          .collection('campaignRoutes')
          .doc(routeId);

      final routeSnapshot = await routeReference.get();

      if (!routeSnapshot.exists) {
        throw Exception('GPS route not found.');
      }

      final routeData = routeSnapshot.data();

      if (routeData == null) {
        throw Exception('Invalid GPS route.');
      }

      final rawPoints = routeData['points'];

      if (rawPoints is! List) {
        throw Exception('Invalid route points.');
      }

      final routePoints = <LatLng>[];

      for (final point in rawPoints) {
        if (point is Map) {
          final latitude = point['latitude'];

          final longitude = point['longitude'];

          if (latitude is num && longitude is num) {
            routePoints.add(LatLng(latitude.toDouble(), longitude.toDouble()));
          }
        }
      }

      if (routePoints.length < 2) {
        throw Exception('Not enough GPS points.');
      }

      final completion = await CompletionTrackingService().calculateCompletion(
        zoneId: zone.id,
        routePoints: routePoints,
      );

      final assignedHomes = (completion['assignedHomes'] as num?)?.toInt() ?? 0;

      final completedHomes =
          (completion['completedHomes'] as num?)?.toInt() ?? 0;

      final completionPercentage =
          (completion['completionPercentage'] as num?)?.toDouble() ?? 0;

      final eligible = completion['eligibleForPayment'] == true;

      if (assignedHomes <= 0) {
        throw Exception('Invalid home count.');
      }

      final campaignSnapshot = await widget.campaign.reference.get();

      if (!campaignSnapshot.exists) {
        throw Exception('Campaign no longer exists.');
      }

      final campaignData = campaignSnapshot.data() as Map<String, dynamic>;

      final businessId = campaignData['businessId']?.toString();

      if (businessId == null || businessId.isEmpty) {
        throw Exception('Missing business account.');
      }

      final zoneName = zoneData['zoneName']?.toString() ?? 'Zone';

      final payout = await CompletionPayoutService().createPendingPayout(
        businessId: businessId,
        scalerId: user.uid,
        campaignId: widget.campaign.id,
        zoneId: zone.id,
        assignedHomes: assignedHomes,
        completedHomes: completedHomes,
        basePay:
            double.tryParse(zoneData['suggestedBasePay']?.toString() ?? '0') ??
            0,
        completionBonus:
            double.tryParse(campaignData['bonus']?.toString() ?? '0') ?? 0,
      );

      final payoutAmount = (payout['totalPayout'] as num?)?.toDouble() ?? 0;

      final payoutId = payout['payoutId']?.toString() ?? zone.id;

      final batch = firestore.batch();

      batch.update(zone.reference, {
        'status': 'submitted',

        'installationPhotoUrl': photoUrl,

        'installationPhotoSubmittedAt': FieldValue.serverTimestamp(),

        'submittedAt': FieldValue.serverTimestamp(),

        'routeId': routeReference.id,

        'completedHomes': completedHomes,

        'assignedHomes': assignedHomes,

        'completionPercentage': completionPercentage,

        'eligibleForPayment': eligible,

        'paymentStatus': 'pending_review',

        'pendingPayoutId': payoutId,

        'payoutAmount': payoutAmount,

        'gpsTracking': false,

        'updatedAt': FieldValue.serverTimestamp(),
      });

      batch.set(firestore.collection('notifications').doc(), {
        'userId': businessId,

        'type': 'zone_completion_submitted',

        'title': 'Zone Completion Submitted',

        'message': '${user.email ?? 'Scaler'} submitted $zoneName',

        'campaignId': widget.campaign.id,

        'zoneId': zone.id,

        'payoutId': payoutId,

        'payoutAmount': payoutAmount,

        'read': false,

        'createdAt': FieldValue.serverTimestamp(),
      });

      await batch.commit();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$zoneName submitted successfully.')),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Submit failed: $e')));
    }
  }

  Widget _assignedZoneSummary(User? user) {
    if (user == null) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _zonesCollection
          .where('campaignId', isEqualTo: widget.campaign.id)
          .where('assignedScalerId', isEqualTo: user.uid)
          .limit(1)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final zones = snapshot.data?.docs ?? [];

        if (zones.isEmpty) {
          return const SizedBox.shrink();
        }

        final data = zones.first.data();

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  data['zoneName']?.toString() ?? 'Assigned Zone',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 10),

                Text('Homes: ${data['estimatedHomes'] ?? 0}'),

                Text('Distance: ${data['estimatedWalkingMiles'] ?? 0} miles'),

                Text(
                  'Status: ${_statusLabel(data['status']?.toString() ?? 'assigned')}',
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _assignedZoneActions(User? user) {
    if (user == null) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _zonesCollection
          .where('campaignId', isEqualTo: widget.campaign.id)
          .where('assignedScalerId', isEqualTo: user.uid)
          .limit(1)
          .snapshots(),
      builder: (context, snapshot) {
        final zones = snapshot.data?.docs ?? [];

        if (zones.isEmpty) {
          return const SizedBox.shrink();
        }

        final zone = zones.first;

        final data = zone.data();

        final status = data['status']?.toString() ?? 'assigned';

        final zoneName = data['zoneName']?.toString() ?? 'Zone';

        if (status == 'assigned' || status == 'accepted') {
          return SizedBox(
            width: double.infinity,
            height: 55,
            child: ElevatedButton.icon(
              onPressed: startZoneJob,
              icon: const Icon(Icons.play_arrow),
              label: Text('Start $zoneName'),
            ),
          );
        }

        if (status == 'in_progress') {
          return Column(
            children: [
              HomeCompletionCounter(
                zoneId: zone.id,

                assignedHomes: (data['estimatedHomes'] as num?)?.toInt() ?? 0,

                completedHomes: (data['completedHomes'] as num?)?.toInt() ?? 0,

                basePay: (data['suggestedBasePay'] as num?)?.toDouble() ?? 0,
              ),

              const SizedBox(height: 20),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 55),
                ),

                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => JobTrackingScreen(
                        campaign: widget.campaign,
                        zone: zone,
                      ),
                    ),
                  );
                },

                icon: const Icon(Icons.my_location),

                label: const Text('Open GPS Tracker'),
              ),

              const SizedBox(height: 20),

              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 55),
                ),

                onPressed: () async {
                  final photo = await pickInstallationPhoto();

                  if (!mounted || photo == null) {
                    return;
                  }

                  await submitJob(installationPhoto: photo);
                },

                icon: const Icon(Icons.upload),

                label: Text('Submit $zoneName'),
              ),
            ],
          );
        }

        if (status == 'submitted') {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.hourglass_top),

              title: Text('$zoneName Submitted'),

              subtitle: const Text('Waiting for business review.'),
            ),
          );
        }

        if (status == 'completed') {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.verified),

              title: Text('$zoneName Completed'),
            ),
          );
        }

        return const SizedBox.shrink();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;

    return StreamBuilder<DocumentSnapshot>(
      stream: widget.campaign.reference.snapshots(),

      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final campaign = snapshot.data!;

        if (!campaign.exists) {
          return const Scaffold(
            body: Center(child: Text('Campaign no longer exists.')),
          );
        }

        final data = campaign.data() as Map<String, dynamic>;

        final campaignName =
            data['campaignName']?.toString() ?? 'Untitled Campaign';

        final description = data['description']?.toString() ?? '';

        final status = data['status']?.toString() ?? 'open';

        return Scaffold(
          appBar: AppBar(title: const Text('Job Details')),

          body: ListView(
            padding: const EdgeInsets.all(20),

            children: [
              Text(
                campaignName,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 20),

              _assignedZoneSummary(currentUser),

              const SizedBox(height: 20),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),

                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [
                      const Text(
                        'Description',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 10),

                      Text(description),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              if (status == 'open' && currentUser != null)
                _applicationSection(campaign, currentUser),

              const SizedBox(height: 15),

              _assignedZoneActions(currentUser),
            ],
          ),
        );
      },
    );
  }

  Widget _applicationSection(DocumentSnapshot campaign, User user) {
    final ref = FirebaseFirestore.instance
        .collection('applications')
        .doc('${campaign.id}_${user.uid}');

    return StreamBuilder<DocumentSnapshot>(
      stream: ref.snapshots(),

      builder: (context, snapshot) {
        if (!snapshot.hasData || !snapshot.data!.exists) {
          return ElevatedButton(
            onPressed: applyForCampaign,

            child: const Text('Apply For Campaign'),
          );
        }

        final data = snapshot.data!.data() as Map<String, dynamic>;

        final status = data['status']?.toString() ?? 'pending';

        return Card(
          child: ListTile(
            leading: Icon(
              status == 'accepted' ? Icons.verified : Icons.hourglass_top,
            ),

            title: Text('Application ${_statusLabel(status)}'),
          ),
        );
      },
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'open':
        return 'Open';

      case 'assigned':
        return 'Assigned';

      case 'accepted':
        return 'Accepted';

      case 'in_progress':
        return 'In Progress';

      case 'submitted':
        return 'Submitted';

      case 'completed':
        return 'Completed';

      default:
        return status;
    }
  }
}
