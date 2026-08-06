import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'job_tracking_screen.dart';

class JobDetailsScreen extends StatelessWidget {
  final DocumentSnapshot campaign;

  const JobDetailsScreen({super.key, required this.campaign});

  CollectionReference<Map<String, dynamic>> get _zonesCollection {
    return FirebaseFirestore.instance.collection('campaignZones');
  }

  Future<void> applyForCampaign(BuildContext context) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('You must be logged in to apply for a campaign.'),
        ),
      );
      return;
    }

    final firestore = FirebaseFirestore.instance;

    final applicationId = '${campaign.id}_${user.uid}';

    final applicationReference = firestore
        .collection('applications')
        .doc(applicationId);

    try {
      await firestore.runTransaction((transaction) async {
        final campaignSnapshot = await transaction.get(campaign.reference);

        final applicationSnapshot = await transaction.get(applicationReference);

        if (!campaignSnapshot.exists) {
          throw Exception('This campaign no longer exists.');
        }

        final campaignData = campaignSnapshot.data() as Map<String, dynamic>;

        final campaignStatus = campaignData['status']?.toString() ?? 'open';

        if (campaignStatus != 'open') {
          throw Exception('This campaign is no longer accepting applications.');
        }

        if (applicationSnapshot.exists) {
          throw Exception('You already applied for this campaign.');
        }

        final campaignName =
            campaignData['campaignName']?.toString() ?? 'Untitled Campaign';

        final businessId = campaignData['businessId']?.toString();

        final scalerEmail = user.email ?? 'Scaler';

        transaction.set(applicationReference, {
          'campaignId': campaign.id,
          'campaignName': campaignName,
          'businessId': businessId,
          'businessEmail': campaignData['businessEmail'],
          'scalerId': user.uid,
          'scalerEmail': scalerEmail,
          'status': 'pending',
          'appliedAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });

        transaction.update(campaign.reference, {
          'applications': FieldValue.increment(1),
        });

        if (businessId != null && businessId.isNotEmpty) {
          final notificationReference = firestore
              .collection('notifications')
              .doc();

          transaction.set(notificationReference, {
            'userId': businessId,
            'type': 'application_received',
            'title': 'New Scaler Application',
            'message': '$scalerEmail applied to $campaignName.',
            'campaignId': campaign.id,
            'campaignName': campaignName,
            'scalerId': user.uid,
            'scalerEmail': scalerEmail,
            'read': false,
            'createdAt': FieldValue.serverTimestamp(),
          });
        }
      });

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Application submitted successfully.')),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

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
        .where('campaignId', isEqualTo: campaign.id)
        .where('assignedScalerId', isEqualTo: user.uid)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) {
      return null;
    }

    return snapshot.docs.first;
  }

  Future<void> startJob(BuildContext context) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    try {
      final zone = await _getAssignedZone();

      if (zone == null) {
        throw Exception('You do not have an assigned zone for this campaign.');
      }

      final zoneData = zone.data();

      final assignedScalerId = zoneData['assignedScalerId']?.toString();

      if (assignedScalerId != user.uid) {
        throw Exception('This zone is not assigned to you.');
      }

      final zoneStatus = zoneData['status']?.toString() ?? 'assigned';

      if (zoneStatus != 'assigned' && zoneStatus != 'accepted') {
        throw Exception('This zone cannot be started from its current status.');
      }

      await zone.reference.update({
        'status': 'in_progress',
        'startedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!context.mounted) {
        return;
      }

      final zoneName = zoneData['zoneName']?.toString() ?? 'Zone';

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$zoneName started.')));
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to start zone: $e')));
    }
  }

  Future<void> submitJob(BuildContext context) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    final firestore = FirebaseFirestore.instance;

    try {
      final zone = await _getAssignedZone();

      if (zone == null) {
        throw Exception('You do not have an assigned zone for this campaign.');
      }

      final zoneSnapshot = await zone.reference.get();

      if (!zoneSnapshot.exists) {
        throw Exception('This zone no longer exists.');
      }

      final zoneData = zoneSnapshot.data()!;

      if (zoneData['assignedScalerId']?.toString() != user.uid) {
        throw Exception('This zone is not assigned to you.');
      }

      final zoneStatus = zoneData['status']?.toString() ?? 'assigned';

      if (zoneStatus != 'in_progress') {
        throw Exception('Start the zone before submitting completion.');
      }

      final gpsTracking = zoneData['gpsTracking'] == true;

      if (gpsTracking) {
        throw Exception(
          'Stop and save GPS tracking before submitting this zone.',
        );
      }

      final routeId = zoneData['routeId']?.toString();

      if (routeId == null || routeId.isEmpty) {
        throw Exception(
          'A saved GPS route is required before submitting this zone.',
        );
      }

      final routeReference = firestore
          .collection('campaignRoutes')
          .doc(routeId);

      final routeSnapshot = await routeReference.get();

      if (!routeSnapshot.exists) {
        throw Exception(
          'The saved GPS route could not be found. Open the GPS tracker and save the route again.',
        );
      }

      final routeData = routeSnapshot.data();

      if (routeData == null) {
        throw Exception('The saved GPS route is invalid.');
      }

      if (routeData['zoneId']?.toString() != zone.id) {
        throw Exception('The saved GPS route does not belong to this zone.');
      }

      final routePointCount = (routeData['pointCount'] as num?)?.toInt() ?? 0;

      if (routePointCount < 2) {
        throw Exception('The saved GPS route does not contain enough points.');
      }

      final routeIsSimulated = routeData['simulated'] == true;

      final campaignSnapshot = await campaign.reference.get();

      if (!campaignSnapshot.exists) {
        throw Exception('This campaign no longer exists.');
      }

      final campaignData = campaignSnapshot.data() as Map<String, dynamic>;

      final businessId = campaignData['businessId']?.toString();

      final campaignName =
          campaignData['campaignName']?.toString() ?? 'Untitled Campaign';

      final zoneName = zoneData['zoneName']?.toString() ?? 'Assigned Zone';

      final scalerEmail = user.email ?? 'Scaler';

      final batch = firestore.batch();

      batch.update(zone.reference, {
        'status': 'submitted',
        'submittedAt': FieldValue.serverTimestamp(),
        'routeId': routeReference.id,
        'gpsTracking': false,
        'gpsRoutePointCount': routePointCount,
        'gpsRouteSimulated': routeIsSimulated,
        'gpsTrackingEndedAt': FieldValue.serverTimestamp(),
        'submittedRouteId': routeReference.id,
        'submittedRoutePointCount': routePointCount,
        'submittedRouteSimulated': routeIsSimulated,
        'reviewFeedback': FieldValue.delete(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      batch.set(routeReference, {
        'tracking': false,
        'submitted': true,
        'submittedAt': FieldValue.serverTimestamp(),
        'pointCount': routePointCount,
        'simulated': routeIsSimulated,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));

      if (businessId != null && businessId.isNotEmpty) {
        final notificationReference = firestore
            .collection('notifications')
            .doc();

        batch.set(notificationReference, {
          'userId': businessId,
          'type': 'zone_completion_submitted',
          'title': 'Zone Completion Submitted',
          'message': '$scalerEmail submitted $zoneName for review.',
          'campaignId': campaign.id,
          'campaignName': campaignName,
          'zoneId': zone.id,
          'zoneName': zoneName,
          'routeId': routeReference.id,
          'routePointCount': routePointCount,
          'routeSimulated': routeIsSimulated,
          'scalerId': user.uid,
          'scalerEmail': scalerEmail,
          'read': false,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$zoneName submitted for review with '
            '$routePointCount GPS points.',
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to submit zone: $e')));
    }
  }

  Widget _assignedZoneSummary(User? currentUser) {
    if (currentUser == null) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _zonesCollection
          .where('campaignId', isEqualTo: campaign.id)
          .where('assignedScalerId', isEqualTo: currentUser.uid)
          .limit(1)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Unable to load assigned zone: ${snapshot.error}'),
            ),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        final zones = snapshot.data?.docs ?? [];

        if (zones.isEmpty) {
          return const SizedBox.shrink();
        }

        final data = zones.first.data();

        final zoneName = data['zoneName']?.toString() ?? 'Assigned Zone';

        final zoneStatus = data['status']?.toString() ?? 'assigned';

        final estimatedHomes = (data['estimatedHomes'] as num?)?.toInt() ?? 0;

        final walkingMiles = (data['estimatedWalkingMiles'] as num?)
            ?.toDouble();

        final estimatedMinutes = (data['estimatedMinutes'] as num?)?.toInt();

        final suggestedPay = (data['suggestedBasePay'] as num?)?.toDouble();

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const CircleAvatar(child: Icon(Icons.map_outlined)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Your Assigned Zone',
                            style: TextStyle(fontSize: 13),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            zoneName,
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Chip(label: Text(_statusLabel(zoneStatus))),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _zoneSummaryMetric(
                        icon: Icons.home_outlined,
                        label: 'Estimated Homes',
                        value: estimatedHomes > 0
                            ? estimatedHomes.toString()
                            : 'Pending',
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _zoneSummaryMetric(
                        icon: Icons.directions_walk,
                        label: 'Walking Distance',
                        value: walkingMiles == null
                            ? 'Pending'
                            : '${walkingMiles.toStringAsFixed(1)} mi',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _zoneSummaryMetric(
                        icon: Icons.schedule,
                        label: 'Estimated Time',
                        value: estimatedMinutes == null
                            ? 'Pending'
                            : _formatDuration(estimatedMinutes),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _zoneSummaryMetric(
                        icon: Icons.payments_outlined,
                        label: 'Recommended Pay',
                        value: suggestedPay == null
                            ? 'Pending'
                            : '\$${suggestedPay.toStringAsFixed(0)}',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _zoneSummaryMetric({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Icon(icon, size: 22),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _assignedZoneActions(BuildContext context, User? currentUser) {
    if (currentUser == null) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _zonesCollection
          .where('campaignId', isEqualTo: campaign.id)
          .where('assignedScalerId', isEqualTo: currentUser.uid)
          .limit(1)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Unable to load zone controls: ${snapshot.error}'),
            ),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 55,
            child: Center(child: CircularProgressIndicator()),
          );
        }

        final zones = snapshot.data?.docs ?? [];

        if (zones.isEmpty) {
          return const SizedBox.shrink();
        }

        final zone = zones.first;

        final data = zone.data();

        final zoneName = data['zoneName']?.toString() ?? 'Assigned Zone';

        final zoneStatus = data['status']?.toString() ?? 'assigned';

        final reviewFeedback = data['reviewFeedback']?.toString();

        if (zoneStatus == 'assigned' || zoneStatus == 'accepted') {
          return SizedBox(
            width: double.infinity,
            height: 55,
            child: ElevatedButton.icon(
              onPressed: () {
                startJob(context);
              },
              icon: const Icon(Icons.play_arrow),
              label: Text('Start $zoneName'),
            ),
          );
        }

        if (zoneStatus == 'in_progress') {
          return Column(
            children: [
              if (reviewFeedback != null && reviewFeedback.isNotEmpty) ...[
                Card(
                  color: Colors.orange.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.feedback_outlined, color: Colors.orange),
                            SizedBox(width: 10),
                            Text(
                              'Changes Requested',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(reviewFeedback),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      const Icon(Icons.gps_fixed, size: 42),
                      const SizedBox(height: 10),
                      Text(
                        '$zoneName In Progress',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Record your GPS route while working this assigned zone.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => JobTrackingScreen(
                                  campaign: campaign,
                                  zone: zone,
                                ),
                              ),
                            );
                          },
                          icon: const Icon(Icons.my_location),
                          label: const Text('Open GPS Tracker'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 55,
                child: ElevatedButton.icon(
                  onPressed: () {
                    submitJob(context);
                  },
                  icon: const Icon(Icons.upload_file),
                  label: Text(
                    reviewFeedback != null && reviewFeedback.isNotEmpty
                        ? 'Resubmit $zoneName'
                        : 'Submit $zoneName',
                  ),
                ),
              ),
            ],
          );
        }

        if (zoneStatus == 'submitted') {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  const Icon(Icons.hourglass_top, size: 42),
                  const SizedBox(height: 10),
                  Text(
                    '$zoneName Submitted',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'The business is reviewing your zone.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        if (zoneStatus == 'completed') {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  const Icon(Icons.verified, size: 42),
                  const SizedBox(height: 10),
                  Text(
                    '$zoneName Completed',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
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
      stream: campaign.reference.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Scaffold(
            appBar: AppBar(title: const Text('Job Details')),
            body: Center(child: Text(snapshot.error.toString())),
          );
        }

        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final liveCampaign = snapshot.data!;

        if (!liveCampaign.exists) {
          return Scaffold(
            appBar: AppBar(title: const Text('Job Details')),
            body: const Center(child: Text('This job no longer exists.')),
          );
        }

        final data = liveCampaign.data() as Map<String, dynamic>;

        final campaignName =
            data['campaignName']?.toString() ?? 'Untitled Campaign';

        final description = data['description']?.toString() ?? '';

        final businessEmail =
            data['businessEmail']?.toString() ?? 'Not provided';

        final basePay = data['basePay']?.toString() ?? '0';

        final bonus = data['bonus']?.toString() ?? '0';

        final status = data['status']?.toString() ?? 'open';

        final deadline = _deadlineLabel(data);

        return Scaffold(
          appBar: AppBar(title: const Text('Job Details'), centerTitle: true),
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
              const SizedBox(height: 8),
              Text(
                businessEmail,
                style: TextStyle(color: Colors.grey.shade700),
              ),
              const SizedBox(height: 16),
              _assignedZoneSummary(currentUser),
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Job Description',
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
              const SizedBox(height: 15),
              Row(
                children: [
                  Expanded(
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          children: [
                            const Icon(Icons.attach_money),
                            const SizedBox(height: 8),
                            Text(
                              '\$$basePay',
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const Text('Campaign Base Pay'),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          children: [
                            const Icon(Icons.card_giftcard),
                            const SizedBox(height: 8),
                            Text(
                              '\$$bonus',
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const Text('Bonus'),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 15),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.calendar_today),
                  title: const Text('Deadline'),
                  subtitle: Text(deadline),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.flag),
                  title: const Text('Campaign Status'),
                  subtitle: Text(_statusLabel(status)),
                ),
              ),
              const SizedBox(height: 30),
              if (status == 'open' && currentUser != null)
                _applicationSection(context, liveCampaign, currentUser),
              const SizedBox(height: 12),
              _assignedZoneActions(context, currentUser),
            ],
          ),
        );
      },
    );
  }

  Widget _applicationSection(
    BuildContext context,
    DocumentSnapshot liveCampaign,
    User user,
  ) {
    final applicationId = '${liveCampaign.id}_${user.uid}';

    final applicationReference = FirebaseFirestore.instance
        .collection('applications')
        .doc(applicationId);

    return StreamBuilder<DocumentSnapshot>(
      stream: applicationReference.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 55,
            child: Center(child: CircularProgressIndicator()),
          );
        }

        if (snapshot.hasError) {
          return Text(snapshot.error.toString());
        }

        if (!snapshot.hasData || !snapshot.data!.exists) {
          return SizedBox(
            height: 55,
            child: ElevatedButton.icon(
              onPressed: () {
                applyForCampaign(context);
              },
              icon: const Icon(Icons.send),
              label: const Text('Apply for Campaign'),
            ),
          );
        }

        final applicationData = snapshot.data!.data() as Map<String, dynamic>;

        final applicationStatus =
            applicationData['status']?.toString() ?? 'pending';

        final assignedZoneName = applicationData['assignedZoneName']
            ?.toString();

        if (applicationStatus == 'pending') {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(Icons.hourglass_top, size: 40),
                  SizedBox(height: 10),
                  Text(
                    'Application Pending',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'The business is reviewing your application.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        if (applicationStatus == 'rejected') {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(Icons.cancel_outlined, size: 40),
                  SizedBox(height: 10),
                  Text(
                    'Application Not Selected',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          );
        }

        if (applicationStatus == 'accepted') {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  const Icon(Icons.verified, size: 40),
                  const SizedBox(height: 10),
                  const Text(
                    'Application Accepted',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  if (assignedZoneName != null &&
                      assignedZoneName.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Assigned to $assignedZoneName'),
                  ],
                ],
              ),
            ),
          );
        }

        return const SizedBox.shrink();
      },
    );
  }

  String _deadlineLabel(Map<String, dynamic> data) {
    final deadlineAt = data['deadlineAt'];

    if (deadlineAt is Timestamp) {
      final date = deadlineAt.toDate();

      final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;

      final minute = date.minute.toString().padLeft(2, '0');

      final period = date.hour >= 12 ? 'PM' : 'AM';

      return '${date.month}/${date.day}/${date.year} '
          '$hour:$minute $period';
    }

    return data['deadline']?.toString() ?? 'Not specified';
  }

  String _formatDuration(int minutes) {
    if (minutes < 60) {
      return '$minutes min';
    }

    final hours = minutes ~/ 60;

    final remainingMinutes = minutes % 60;

    if (remainingMinutes == 0) {
      return '$hours hr';
    }

    return '$hours hr $remainingMinutes min';
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'open':
        return 'Open';

      case 'unassigned':
        return 'Unassigned';

      case 'assigned':
        return 'Assigned';

      case 'accepted':
        return 'Accepted';

      case 'in_progress':
        return 'In Progress';

      case 'submitted':
        return 'Submitted for Review';

      case 'completed':
        return 'Completed';

      default:
        return status;
    }
  }
}
