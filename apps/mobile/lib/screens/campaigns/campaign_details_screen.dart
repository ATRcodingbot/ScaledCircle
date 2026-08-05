import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../business/edit_campaign_screen.dart';
import 'campaign_applicants_screen.dart';
import '../business/campaign_zones_screen.dart';

class CampaignDetailsScreen extends StatelessWidget {
  final DocumentSnapshot campaign;

  const CampaignDetailsScreen({
    super.key,
    required this.campaign,
  });

  Future<void> _approveCompletion(
    BuildContext context,
    DocumentSnapshot liveCampaign,
  ) async {
    final data =
        liveCampaign.data() as Map<String, dynamic>;

    final assignedWorkerId =
        data['assignedWorkerId']?.toString();

    final campaignName =
        data['campaignName']?.toString() ??
            'Untitled Campaign';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text(
            "Approve Completion",
          ),
          content: const Text(
            "Approve this Scaler's submitted work and mark the job as completed?",
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  false,
                );
              },
              child: const Text(
                "Cancel",
              ),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  true,
                );
              },
              child: const Text(
                "Approve",
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      final firestore =
          FirebaseFirestore.instance;

      final batch =
          firestore.batch();

      batch.update(
        liveCampaign.reference,
        {
          'status': 'completed',
          'completedAt':
              FieldValue.serverTimestamp(),
          'reviewFeedback':
              FieldValue.delete(),
        },
      );

      if (assignedWorkerId != null &&
          assignedWorkerId.isNotEmpty) {
        final notificationReference =
            firestore
                .collection('notifications')
                .doc();

        batch.set(
          notificationReference,
          {
            'userId':
                assignedWorkerId,
            'type':
                'campaign_completed',
            'title':
                'Campaign Completed',
            'message':
                'Your work on $campaignName was approved.',
            'campaignId':
                liveCampaign.id,
            'campaignName':
                campaignName,
            'read': false,
            'createdAt':
                FieldValue.serverTimestamp(),
          },
        );
      }

      await batch.commit();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Job approved and marked completed.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to approve completion: $e",
          ),
        ),
      );
    }
  }

  Future<void> _requestChanges(
    BuildContext context,
    DocumentSnapshot liveCampaign,
  ) async {
    final data =
        liveCampaign.data() as Map<String, dynamic>;

    final assignedWorkerId =
        data['assignedWorkerId']?.toString();

    final campaignName =
        data['campaignName']?.toString() ??
            'Untitled Campaign';

    final feedbackController =
        TextEditingController();

    final feedback =
        await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text(
            "Request Changes",
          ),
          content: TextField(
            controller:
                feedbackController,
            maxLines: 4,
            decoration:
                const InputDecoration(
              labelText:
                  "What needs to be corrected?",
              hintText:
                  "Explain what the Scaler needs to fix...",
              border:
                  OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                );
              },
              child: const Text(
                "Cancel",
              ),
            ),
            ElevatedButton(
              onPressed: () {
                final text =
                    feedbackController
                        .text
                        .trim();

                if (text.isEmpty) {
                  return;
                }

                Navigator.pop(
                  dialogContext,
                  text,
                );
              },
              child: const Text(
                "Send",
              ),
            ),
          ],
        );
      },
    );

    feedbackController.dispose();

    if (feedback == null ||
        feedback.isEmpty) {
      return;
    }

    try {
      final firestore =
          FirebaseFirestore.instance;

      final batch =
          firestore.batch();

      batch.update(
        liveCampaign.reference,
        {
          'status':
              'in_progress',
          'reviewFeedback':
              feedback,
          'changesRequestedAt':
              FieldValue.serverTimestamp(),
        },
      );

      if (assignedWorkerId != null &&
          assignedWorkerId.isNotEmpty) {
        final notificationReference =
            firestore
                .collection('notifications')
                .doc();

        batch.set(
          notificationReference,
          {
            'userId':
                assignedWorkerId,
            'type':
                'changes_requested',
            'title':
                'Changes Requested',
            'message':
                'Changes were requested for $campaignName: $feedback',
            'campaignId':
                liveCampaign.id,
            'campaignName':
                campaignName,
            'read': false,
            'createdAt':
                FieldValue.serverTimestamp(),
          },
        );
      }

      await batch.commit();

      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Changes requested. The job has been returned to the Scaler.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to request changes: $e",
          ),
        ),
      );
    }
  }

  Future<void> _deleteCampaign(
    BuildContext context,
    DocumentReference reference,
  ) async {
    final confirmed =
        await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text(
            "Delete Campaign",
          ),
          content: const Text(
            "Are you sure you want to permanently delete this campaign?",
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  false,
                );
              },
              child: const Text(
                "Cancel",
              ),
            ),
            ElevatedButton(
              style:
                  ElevatedButton.styleFrom(
                backgroundColor:
                    Colors.red,
                foregroundColor:
                    Colors.white,
              ),
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  true,
                );
              },
              child: const Text(
                "Delete",
              ),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    try {
      await reference.delete();

      if (!context.mounted) {
        return;
      }

      Navigator.pop(context);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Campaign deleted.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to delete campaign: $e",
          ),
        ),
      );
    }
  }

  List<LatLng> _parsePoints(
    dynamic rawPoints,
  ) {
    if (rawPoints is! List) {
      return [];
    }

    final points =
        <LatLng>[];

    for (final item in rawPoints) {
      if (item is! Map) {
        continue;
      }

      final latitude =
          item['latitude'];

      final longitude =
          item['longitude'];

      if (latitude is num &&
          longitude is num) {
        points.add(
          LatLng(
            latitude.toDouble(),
            longitude.toDouble(),
          ),
        );
      }
    }

    return points;
  }

  LatLng _calculateCenter(
    List<LatLng> points,
  ) {
    if (points.isEmpty) {
      return const LatLng(
        39.2904,
        -76.6122,
      );
    }

    double totalLatitude = 0;
    double totalLongitude = 0;

    for (final point in points) {
      totalLatitude +=
          point.latitude;

      totalLongitude +=
          point.longitude;
    }

    return LatLng(
      totalLatitude /
          points.length,
      totalLongitude /
          points.length,
    );
  }

  bool _isPointInsidePolygon(
    LatLng point,
    List<LatLng> polygon,
  ) {
    if (polygon.length < 3) {
      return false;
    }

    bool inside = false;

    int j =
        polygon.length - 1;

    for (int i = 0;
        i < polygon.length;
        i++) {
      final current =
          polygon[i];

      final previous =
          polygon[j];

      final currentLatitude =
          current.latitude;

      final currentLongitude =
          current.longitude;

      final previousLatitude =
          previous.latitude;

      final previousLongitude =
          previous.longitude;

      final pointLatitude =
          point.latitude;

      final pointLongitude =
          point.longitude;

      final crossesLatitude =
          (currentLatitude >
                  pointLatitude) !=
              (previousLatitude >
                  pointLatitude);

      if (crossesLatitude) {
        final longitudeAtCrossing =
            (
                  previousLongitude -
                      currentLongitude
                ) *
                    (
                      pointLatitude -
                          currentLatitude
                    ) /
                    (
                      previousLatitude -
                          currentLatitude
                    ) +
                currentLongitude;

        if (pointLongitude <
            longitudeAtCrossing) {
          inside = !inside;
        }
      }

      j = i;
    }

    return inside;
  }

  RouteVerification _calculateVerification(
    List<LatLng> serviceArea,
    List<LatLng> routePoints,
  ) {
    if (serviceArea.length < 3 ||
        routePoints.isEmpty) {
      return RouteVerification(
        totalPoints:
            routePoints.length,
        insidePoints: 0,
        outsidePoints:
            routePoints.length,
        compliancePercent: 0,
        outsideLocations:
            routePoints,
        canVerify: false,
      );
    }

    int insidePoints = 0;

    final outsideLocations =
        <LatLng>[];

    for (final point in routePoints) {
      final inside =
          _isPointInsidePolygon(
        point,
        serviceArea,
      );

      if (inside) {
        insidePoints++;
      } else {
        outsideLocations.add(
          point,
        );
      }
    }

    final outsidePoints =
        routePoints.length -
            insidePoints;

    final compliancePercent =
        routePoints.isEmpty
            ? 0.0
            : (
                  insidePoints /
                      routePoints.length
                ) *
                100;

    return RouteVerification(
      totalPoints:
          routePoints.length,
      insidePoints:
          insidePoints,
      outsidePoints:
          outsidePoints,
      compliancePercent:
          compliancePercent,
      outsideLocations:
          outsideLocations,
      canVerify: true,
    );
  }

  String _verificationLabel(
    RouteVerification verification,
  ) {
    if (!verification.canVerify) {
      return "Not Verified";
    }

    if (verification.compliancePercent >=
        90) {
      return "Strong Route Match";
    }

    if (verification.compliancePercent >=
        70) {
      return "Review Recommended";
    }

    return "Low Route Match";
  }

  IconData _verificationIcon(
    RouteVerification verification,
  ) {
    if (!verification.canVerify) {
      return Icons.help_outline;
    }

    if (verification.compliancePercent >=
        90) {
      return Icons.verified;
    }

    if (verification.compliancePercent >=
        70) {
      return Icons.warning_amber;
    }

    return Icons.error_outline;
  }

  String _formatTimestamp(
    dynamic value,
  ) {
    if (value is! Timestamp) {
      return 'Not available';
    }

    final date =
        value.toDate();

    final hour =
        date.hour % 12 == 0
            ? 12
            : date.hour % 12;

    final minute =
        date.minute
            .toString()
            .padLeft(
              2,
              '0',
            );

    final period =
        date.hour >= 12
            ? 'PM'
            : 'AM';

    return '${date.month}/${date.day}/${date.year} '
        '$hour:$minute $period';
  }

  Widget _buildVerificationCard(
    RouteVerification verification,
    bool simulated,
  ) {
    return Card(
      child: Padding(
        padding:
            const EdgeInsets.all(
          20,
        ),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  _verificationIcon(
                    verification,
                  ),
                  size: 30,
                ),

                const SizedBox(
                  width: 10,
                ),

                Expanded(
                  child: Text(
                    _verificationLabel(
                      verification,
                    ),
                    style:
                        const TextStyle(
                      fontSize: 20,
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(
              height: 18,
            ),

            if (verification.canVerify) ...[
              Text(
                "${verification.compliancePercent.toStringAsFixed(1)}%",
                style:
                    const TextStyle(
                  fontSize: 36,
                  fontWeight:
                      FontWeight.bold,
                ),
              ),

              const SizedBox(
                height: 4,
              ),

              const Text(
                "Recorded GPS points inside assigned campaign area",
              ),

              const SizedBox(
                height: 18,
              ),

              LinearProgressIndicator(
                value:
                    verification
                            .compliancePercent /
                        100,
                minHeight: 10,
              ),

              const SizedBox(
                height: 18,
              ),

              Row(
                children: [
                  Expanded(
                    child:
                        _statBox(
                      "Total",
                      verification
                          .totalPoints
                          .toString(),
                      Icons.gps_fixed,
                    ),
                  ),

                  const SizedBox(
                    width: 10,
                  ),

                  Expanded(
                    child:
                        _statBox(
                      "Inside",
                      verification
                          .insidePoints
                          .toString(),
                      Icons.check_circle_outline,
                    ),
                  ),

                  const SizedBox(
                    width: 10,
                  ),

                  Expanded(
                    child:
                        _statBox(
                      "Outside",
                      verification
                          .outsidePoints
                          .toString(),
                      Icons.outbound_outlined,
                    ),
                  ),
                ],
              ),
            ] else
              const Text(
                "A campaign polygon and recorded GPS route are both required before route compliance can be calculated.",
              ),

            if (simulated) ...[
              const SizedBox(
                height: 18,
              ),

              Container(
                width:
                    double.infinity,
                padding:
                    const EdgeInsets.all(
                  12,
                ),
                decoration:
                    BoxDecoration(
                  color:
                      Colors.orange.shade50,
                  borderRadius:
                      BorderRadius.circular(
                    8,
                  ),
                  border:
                      Border.all(
                    color:
                        Colors.orange.shade300,
                  ),
                ),
                child:
                    const Row(
                  crossAxisAlignment:
                      CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.science_outlined,
                      color:
                          Colors.orange,
                    ),
                    SizedBox(
                      width: 10,
                    ),
                    Expanded(
                      child: Text(
                        "Development Test Route — these coordinates were generated by the simulation tool and are not real field GPS evidence.",
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(
              height: 14,
            ),

            const Text(
              "This score measures the percentage of recorded GPS points located inside the assigned polygon. It does not by itself prove that every home or street was serviced.",
              style: TextStyle(
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statBox(
    String title,
    String value,
    IconData icon,
  ) {
    return Container(
      padding:
          const EdgeInsets.all(
        12,
      ),
      decoration:
          BoxDecoration(
        border:
            Border.all(
          color:
              Colors.grey.shade300,
        ),
        borderRadius:
            BorderRadius.circular(
          10,
        ),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            size: 22,
          ),

          const SizedBox(
            height: 6,
          ),

          Text(
            value,
            style:
                const TextStyle(
              fontSize: 20,
              fontWeight:
                  FontWeight.bold,
            ),
          ),

          const SizedBox(
            height: 3,
          ),

          Text(
            title,
            style:
                const TextStyle(
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProofOfWorkSection(
    DocumentSnapshot liveCampaign,
    List<LatLng> serviceArea,
  ) {
    final routeReference =
        FirebaseFirestore.instance
            .collection(
              'campaignRoutes',
            )
            .doc(
              liveCampaign.id,
            );

    return StreamBuilder<DocumentSnapshot>(
      stream:
          routeReference.snapshots(),
      builder: (
        context,
        routeSnapshot,
      ) {
        if (routeSnapshot.hasError) {
          return Card(
            child: Padding(
              padding:
                  const EdgeInsets.all(
                20,
              ),
              child: Text(
                "Unable to load GPS proof: ${routeSnapshot.error}",
              ),
            ),
          );
        }

        if (routeSnapshot.connectionState ==
            ConnectionState.waiting) {
          return const Card(
            child: Padding(
              padding:
                  EdgeInsets.all(
                20,
              ),
              child: Center(
                child:
                    CircularProgressIndicator(),
              ),
            ),
          );
        }

        if (!routeSnapshot.hasData ||
            !routeSnapshot.data!.exists) {
          return const Card(
            child: Padding(
              padding:
                  EdgeInsets.all(
                20,
              ),
              child: Column(
                children: [
                  Icon(
                    Icons.gps_off,
                    size: 44,
                  ),
                  SizedBox(
                    height: 10,
                  ),
                  Text(
                    "No GPS Route Recorded",
                    style:
                        TextStyle(
                      fontSize: 20,
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                  SizedBox(
                    height: 8,
                  ),
                  Text(
                    "The Scaler has not recorded GPS proof for this campaign.",
                    textAlign:
                        TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        final routeData =
            routeSnapshot.data!.data()
                as Map<String, dynamic>;

        final routePoints =
            _parsePoints(
          routeData['points'],
        );

        final pointCount =
            (routeData['pointCount']
                        as num?)
                    ?.toInt() ??
                routePoints.length;

        final startedAt =
            routeData['startedAt'];

        final endedAt =
            routeData['endedAt'];

        final simulated =
            routeData['simulated'] ==
                true;

        final verification =
            _calculateVerification(
          serviceArea,
          routePoints,
        );

        final allPoints =
            <LatLng>[
          ...serviceArea,
          ...routePoints,
        ];

        final center =
            _calculateCenter(
          allPoints,
        );

        final outsideMarkers =
            verification
                .outsideLocations
                .asMap()
                .entries
                .map(
          (entry) {
            return Marker(
              point:
                  entry.value,
              width: 28,
              height: 28,
              child:
                  const Icon(
                Icons.warning,
                color:
                    Colors.red,
                size: 24,
              ),
            );
          },
        ).toList();

        return Column(
          children: [
            _buildVerificationCard(
              verification,
              simulated,
            ),

            const SizedBox(
              height: 16,
            ),

            Card(
              clipBehavior:
                  Clip.antiAlias,
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding:
                        EdgeInsets.fromLTRB(
                      18,
                      18,
                      18,
                      12,
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.fact_check_outlined,
                        ),
                        SizedBox(
                          width: 10,
                        ),
                        Text(
                          "GPS Proof of Work",
                          style:
                              TextStyle(
                            fontSize: 20,
                            fontWeight:
                                FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),

                  SizedBox(
                    height: 340,
                    child:
                        FlutterMap(
                      options:
                          MapOptions(
                        initialCenter:
                            center,
                        initialZoom:
                            16,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                          userAgentPackageName:
                              "com.scaledcircle.app",
                        ),

                        if (serviceArea.length >= 3)
                          PolygonLayer(
                            polygons: [
                              Polygon(
                                points:
                                    serviceArea,
                                borderStrokeWidth:
                                    3,
                                color:
                                    Colors.blue.withValues(
                                  alpha:
                                      0.15,
                                ),
                                borderColor:
                                    Colors.blue,
                              ),
                            ],
                          ),

                        if (routePoints.length >= 2)
                          PolylineLayer(
                            polylines: [
                              Polyline(
                                points:
                                    routePoints,
                                strokeWidth:
                                    5,
                                color:
                                    Colors.green,
                              ),
                            ],
                          ),

                        MarkerLayer(
                          markers: [
                            if (routePoints.isNotEmpty)
                              Marker(
                                point:
                                    routePoints.first,
                                width:
                                    40,
                                height:
                                    40,
                                child:
                                    const Icon(
                                  Icons.play_circle_fill,
                                  color:
                                      Colors.green,
                                  size:
                                      34,
                                ),
                              ),

                            if (routePoints.length >= 2)
                              Marker(
                                point:
                                    routePoints.last,
                                width:
                                    40,
                                height:
                                    40,
                                child:
                                    const Icon(
                                  Icons.flag_circle,
                                  color:
                                      Colors.red,
                                  size:
                                      34,
                                ),
                              ),

                            ...outsideMarkers,
                          ],
                        ),
                      ],
                    ),
                  ),

                  Padding(
                    padding:
                        const EdgeInsets.all(
                      18,
                    ),
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Text(
                          "$pointCount GPS point${pointCount == 1 ? '' : 's'} recorded",
                          style:
                              const TextStyle(
                            fontWeight:
                                FontWeight.bold,
                            fontSize:
                                16,
                          ),
                        ),

                        const SizedBox(
                          height: 10,
                        ),

                        Text(
                          "Tracking started: ${_formatTimestamp(startedAt)}",
                        ),

                        const SizedBox(
                          height: 4,
                        ),

                        Text(
                          "Tracking ended: ${_formatTimestamp(endedAt)}",
                        ),

                        const SizedBox(
                          height: 14,
                        ),

                        const Row(
                          children: [
                            Icon(
                              Icons.square,
                              color:
                                  Colors.blue,
                              size:
                                  14,
                            ),
                            SizedBox(
                              width:
                                  6,
                            ),
                            Text(
                              "Blue = assigned campaign area",
                            ),
                          ],
                        ),

                        const SizedBox(
                          height: 6,
                        ),

                        const Row(
                          children: [
                            Icon(
                              Icons.horizontal_rule,
                              color:
                                  Colors.green,
                            ),
                            SizedBox(
                              width:
                                  6,
                            ),
                            Text(
                              "Green = Scaler GPS route",
                            ),
                          ],
                        ),

                        if (verification
                                .outsidePoints >
                            0) ...[
                          const SizedBox(
                            height: 6,
                          ),

                          const Row(
                            children: [
                              Icon(
                                Icons.warning,
                                color:
                                    Colors.red,
                                size:
                                    18,
                              ),
                              SizedBox(
                                width:
                                    6,
                              ),
                              Text(
                                "Red = GPS point outside assigned area",
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    return StreamBuilder<DocumentSnapshot>(
      stream:
          campaign.reference.snapshots(),
      builder: (
        context,
        snapshot,
      ) {
        if (snapshot.hasError) {
          return Scaffold(
            appBar:
                AppBar(
              title:
                  const Text(
                "Campaign Details",
              ),
            ),
            body:
                Center(
              child:
                  Text(
                snapshot.error.toString(),
              ),
            ),
          );
        }

        if (!snapshot.hasData) {
          return const Scaffold(
            body:
                Center(
              child:
                  CircularProgressIndicator(),
            ),
          );
        }

        final liveCampaign =
            snapshot.data!;

        if (!liveCampaign.exists) {
          return Scaffold(
            appBar:
                AppBar(
              title:
                  const Text(
                "Campaign Details",
              ),
            ),
            body:
                const Center(
              child:
                  Text(
                "This campaign no longer exists.",
              ),
            ),
          );
        }

        final data =
            liveCampaign.data()
                as Map<String, dynamic>;

        final campaignName =
            data['campaignName']
                    ?.toString() ??
                'Untitled Campaign';

        final description =
            data['description']
                    ?.toString() ??
                '';

        final homes =
            data['homes']
                    ?.toString() ??
                '0';

        final basePay =
            data['basePay']
                    ?.toString() ??
                '0';

        final bonus =
            data['bonus']
                    ?.toString() ??
                '0';

        final deadline =
            data['deadline']
                    ?.toString() ??
                'No deadline';

        final status =
            data['status']
                    ?.toString() ??
                'open';

        final assignedWorkerEmail =
            data['assignedWorkerEmail']
                ?.toString();

        final reviewFeedback =
            data['reviewFeedback']
                ?.toString();

        final applicationCount =
            (data['applications']
                        as num?)
                    ?.toInt() ??
                0;

        final serviceArea =
            _parsePoints(
          data['serviceArea'],
        );

        return Scaffold(
          appBar:
              AppBar(
            title:
                const Text(
              "Campaign Details",
            ),
            centerTitle:
                true,
          ),
          body:
              ListView(
            padding:
                const EdgeInsets.all(
              20,
            ),
            children: [
              Text(
                campaignName,
                style:
                    const TextStyle(
                  fontSize:
                      30,
                  fontWeight:
                      FontWeight.bold,
                ),
              ),

              const SizedBox(
                height:
                    10,
              ),

              Chip(
                avatar:
                    Icon(
                  _statusIcon(
                    status,
                  ),
                  size:
                      18,
                ),
                label:
                    Text(
                  _statusLabel(
                    status,
                  ),
                ),
              ),

              const SizedBox(
                height:
                    20,
              ),

              _infoCard(
                Icons.description,
                "Description",
                description,
              ),

              _infoCard(
                Icons.home,
                "Homes",
                homes,
              ),

              _infoCard(
                Icons.attach_money,
                "Base Pay",
                "\$$basePay",
              ),

              _infoCard(
                Icons.star,
                "Bonus",
                "\$$bonus",
              ),

              _infoCard(
                Icons.calendar_today,
                "Deadline",
                deadline,
              ),

              if (assignedWorkerEmail != null &&
                  assignedWorkerEmail.isNotEmpty)
                _infoCard(
                  Icons.person,
                  "Assigned Scaler",
                  assignedWorkerEmail,
                ),

              if (reviewFeedback != null &&
                  reviewFeedback.isNotEmpty)
                _infoCard(
                  Icons.feedback_outlined,
                  "Latest Review Feedback",
                  reviewFeedback,
                ),

if (status == 'open') ...[
  const SizedBox(
    height: 10,
  ),

  SizedBox(
    height: 55,
    child: ElevatedButton.icon(
      onPressed: () async {
        await Navigator.push<bool>(
          context,
          MaterialPageRoute(
            builder: (_) =>
                CampaignZonesScreen(
              campaign: liveCampaign,
            ),
          ),
        );
      },
      icon: const Icon(
        Icons.map_outlined,
      ),
      label: const Text(
        'Manage Campaign Zones',
      ),
    ),
  ),

  const SizedBox(
    height: 12,
  ),

  SizedBox(
    height: 55,
    child: OutlinedButton.icon(
      onPressed: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) =>
                CampaignApplicantsScreen(
              campaign: liveCampaign,
            ),
          ),
        );
      },
      icon: const Icon(
        Icons.people_alt_outlined,
      ),
      label: Text(
        'View Applicants ($applicationCount)',
      ),
    ),
  ),
],

              if (status ==
                  'submitted') ...[
                const SizedBox(
                  height:
                      20,
                ),

                const Card(
                  child:
                      Padding(
                    padding:
                        EdgeInsets.all(
                      20,
                    ),
                    child:
                        Column(
                      children: [
                        Icon(
                          Icons.fact_check,
                          size:
                              44,
                        ),
                        SizedBox(
                          height:
                              10,
                        ),
                        Text(
                          "Completion Submitted",
                          style:
                              TextStyle(
                            fontSize:
                                20,
                            fontWeight:
                                FontWeight.bold,
                          ),
                        ),
                        SizedBox(
                          height:
                              8,
                        ),
                        Text(
                          "Review the Scaler's GPS verification and route before approving the campaign.",
                          textAlign:
                              TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(
                  height:
                      20,
                ),

                _buildProofOfWorkSection(
                  liveCampaign,
                  serviceArea,
                ),

                const SizedBox(
                  height:
                      20,
                ),

                SizedBox(
                  height:
                      55,
                  child:
                      ElevatedButton.icon(
                    onPressed:
                        () {
                      _approveCompletion(
                        context,
                        liveCampaign,
                      );
                    },
                    icon:
                        const Icon(
                      Icons.verified,
                    ),
                    label:
                        const Text(
                      "Approve Completion",
                    ),
                  ),
                ),

                const SizedBox(
                  height:
                      12,
                ),

                SizedBox(
                  height:
                      55,
                  child:
                      OutlinedButton.icon(
                    onPressed:
                        () {
                      _requestChanges(
                        context,
                        liveCampaign,
                      );
                    },
                    icon:
                        const Icon(
                      Icons.assignment_return,
                    ),
                    label:
                        const Text(
                      "Request Changes",
                    ),
                  ),
                ),
              ],

              if (status ==
                  'completed') ...[
                const SizedBox(
                  height:
                      20,
                ),

                const Card(
                  child:
                      Padding(
                    padding:
                        EdgeInsets.all(
                      20,
                    ),
                    child:
                        Column(
                      children: [
                        Icon(
                          Icons.verified,
                          size:
                              46,
                        ),
                        SizedBox(
                          height:
                              10,
                        ),
                        Text(
                          "Campaign Completed",
                          style:
                              TextStyle(
                            fontSize:
                                20,
                            fontWeight:
                                FontWeight.bold,
                          ),
                        ),
                        SizedBox(
                          height:
                              8,
                        ),
                        Text(
                          "The submitted work has been approved.",
                        ),
                      ],
                    ),
                  ),
                ),
              ],

              const SizedBox(
                height:
                    30,
              ),

              if (status ==
                  'open')
                SizedBox(
                  height:
                      55,
                  child:
                      ElevatedButton.icon(
                    icon:
                        const Icon(
                      Icons.edit,
                    ),
                    label:
                        const Text(
                      "Edit Campaign",
                    ),
                    onPressed:
                        () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder:
                              (_) =>
                                  EditCampaignScreen(
                            campaign:
                                liveCampaign,
                          ),
                        ),
                      );
                    },
                  ),
                ),

              if (status ==
                  'open')
                const SizedBox(
                  height:
                      15,
                ),

              SizedBox(
                height:
                    55,
                child:
                    ElevatedButton.icon(
                  style:
                      ElevatedButton.styleFrom(
                    backgroundColor:
                        Colors.red,
                    foregroundColor:
                        Colors.white,
                  ),
                  icon:
                      const Icon(
                    Icons.delete,
                  ),
                  label:
                      const Text(
                    "Delete Campaign",
                  ),
                  onPressed:
                      () {
                    _deleteCampaign(
                      context,
                      liveCampaign.reference,
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _infoCard(
    IconData icon,
    String title,
    String value,
  ) {
    return Card(
      margin:
          const EdgeInsets.only(
        bottom:
            14,
      ),
      child:
          ListTile(
        leading:
            Icon(
          icon,
        ),
        title:
            Text(
          title,
        ),
        subtitle:
            Text(
          value,
        ),
      ),
    );
  }

  String _statusLabel(
    String status,
  ) {
    switch (status) {
      case 'open':
        return 'Open';

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

  IconData _statusIcon(
    String status,
  ) {
    switch (status) {
      case 'open':
        return Icons.public;

      case 'accepted':
        return Icons.assignment_turned_in;

      case 'in_progress':
        return Icons.play_circle;

      case 'submitted':
        return Icons.hourglass_top;

      case 'completed':
        return Icons.verified;

      default:
        return Icons.flag;
    }
  }
}

class RouteVerification {
  final int totalPoints;
  final int insidePoints;
  final int outsidePoints;
  final double compliancePercent;
  final List<LatLng> outsideLocations;
  final bool canVerify;

  const RouteVerification({
    required this.totalPoints,
    required this.insidePoints,
    required this.outsidePoints,
    required this.compliancePercent,
    required this.outsideLocations,
    required this.canVerify,
  });
}