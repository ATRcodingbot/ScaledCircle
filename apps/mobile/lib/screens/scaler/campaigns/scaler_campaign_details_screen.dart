import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../models/campaign_model.dart';
import '../../../services/campaign_service.dart';
import '../../business/profile/business_profile_screen.dart';
import '../../reviews/create_review_screen.dart';
import '../completion/submit_completion_screen.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../jobs/job_room_screen.dart';

class ScalerCampaignDetailsScreen extends StatefulWidget {
  final CampaignModel campaign;

  const ScalerCampaignDetailsScreen({super.key, required this.campaign});

  @override
  State<ScalerCampaignDetailsScreen> createState() =>
      _ScalerCampaignDetailsScreenState();
}

class _ScalerCampaignDetailsScreenState
    extends State<ScalerCampaignDetailsScreen> {
  final CampaignService _campaignService = CampaignService();

  bool _applying = false;

  // ============================================================
  // BUSINESS PROFILE
  // ============================================================

  void _openBusinessProfile() {
    final businessId = widget.campaign.businessId;

    if (businessId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Business information unavailable.")),
      );

      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BusinessProfileScreen(businessId: businessId),
      ),
    );
  }

  // ============================================================
  // SUBMIT COMPLETION
  // ============================================================

  Future<void> _openSubmitCompletion() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    try {
      final zonesSnapshot = await FirebaseFirestore.instance
          .collection("campaignZones")
          .where("campaignId", isEqualTo: widget.campaign.id)
          .get();
      final assignedZones = zonesSnapshot.docs.where((zone) {
        return zone.data()["assignedScalerId"]?.toString() == user.uid;
      }).toList();

      if (assignedZones.isEmpty) {
        throw Exception("No campaign zone is assigned to you.");
      }

      QueryDocumentSnapshot<Map<String, dynamic>>? selectedZone;

      for (final zone in assignedZones) {
        final routeId = zone.data()["routeId"]?.toString();

        if (routeId != null && routeId.isNotEmpty) {
          selectedZone = zone;
          break;
        }
      }

      if (selectedZone == null) {
        throw Exception("Complete and save GPS tracking before submitting.");
      }

      final zoneData = selectedZone.data();
      final routeId = zoneData["routeId"]!.toString();
      final routeSnapshot = await FirebaseFirestore.instance
          .collection("campaignRoutes")
          .doc(routeId)
          .get();
      final routeData = routeSnapshot.data();
      final routePoints = routeData?["points"];

      if (!routeSnapshot.exists ||
          routeData == null ||
          routeData["tracking"] == true ||
          routePoints is! List ||
          routePoints.length < 2) {
        throw Exception("Stop and save a valid GPS route before submitting.");
      }

      if (!mounted) {
        return;
      }

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => SubmitCompletionScreen(
            campaignId: widget.campaign.id,
            businessId: widget.campaign.businessId,
            zoneId: selectedZone!.id,
            zoneName: zoneData["zoneName"]?.toString() ?? "Zone",
            routeId: routeId,
            gpsPointCount: routePoints.length,
            routeSimulated: routeData["simulated"] == true,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Unable to submit completion: $error")),
      );
    }
  }

  // ============================================================
  // APPLY
  // ============================================================

  Future<void> _applyForCampaign() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("You must be logged in.")));

      return;
    }

    setState(() {
      _applying = true;
    });

    try {
      await _campaignService.applyToCampaign(
        campaignId: widget.campaign.id,
        scalerId: user.uid,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Application submitted! Waiting for business approval.",
          ),
        ),
      );

      // Stay on page instead of leaving
      setState(() {
        _applying = false;
      });
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) {
        setState(() {
          _applying = false;
        });
      }
    }
  }

  Widget _buildCampaignAction(CampaignModel campaign) {
    if (campaign.status == "completed") {
      return SizedBox(
        height: 55,
        child: ElevatedButton.icon(
          icon: const Icon(Icons.star_outline),
          label: const Text("Review Business"),
          onPressed: _openBusinessReview,
        ),
      );
    }

    if (campaign.status == "assigned") {
      return SizedBox(
        height: 55,
        child: ElevatedButton.icon(
          icon: const Icon(Icons.assignment_turned_in),
          label: const Text("Submit Completion"),
          onPressed: _openSubmitCompletion,
        ),
      );
    }

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return SizedBox(
        height: 55,
        child: ElevatedButton(
          onPressed: _applyForCampaign,
          child: const Text("Apply For Campaign"),
        ),
      );
    }

    final assignedZonesStream = FirebaseFirestore.instance
        .collection("campaignZones")
        .where("campaignId", isEqualTo: campaign.id)
        .snapshots();

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: assignedZonesStream,
      builder: (context, zoneSnapshot) {
        if (zoneSnapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox(
            height: 55,
            child: Center(child: CircularProgressIndicator()),
          );
        }

        final assignedToCurrentScaler =
            zoneSnapshot.data?.docs.any((zone) {
              return zone.data()["assignedScalerId"]?.toString() == user.uid;
            }) ??
            false;

        if (assignedToCurrentScaler) {
          return SizedBox(
            height: 55,
            child: ElevatedButton(
              onPressed: null,
              child: const Text("Accepted / Assigned"),
            ),
          );
        }

        final applicationStream = FirebaseFirestore.instance
            .collection("campaigns")
            .doc(campaign.id)
            .collection("applications")
            .doc(user.uid)
            .snapshots();

        return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: applicationStream,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return SizedBox(
                height: 55,
                child: ElevatedButton(
                  onPressed: null,
                  child: const Text("Application Status Unavailable"),
                ),
              );
            }

            if (snapshot.connectionState == ConnectionState.waiting) {
              return const SizedBox(
                height: 55,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            final status = snapshot.data?.data()?["status"]?.toString();
            final assignedZoneId = snapshot.data
                ?.data()?['assignedZoneId']
                ?.toString();
            QueryDocumentSnapshot<Map<String, dynamic>>? assignedGroupZone;
            if (assignedZoneId != null) {
              for (final zone in zoneSnapshot.data?.docs ?? const []) {
                if (zone.id == assignedZoneId &&
                    zone.data()['groupAssignmentId'] != null) {
                  assignedGroupZone = zone;
                  break;
                }
              }
            }

            switch (status) {
              case "pending":
                return SizedBox(
                  height: 55,
                  child: ElevatedButton(
                    onPressed: null,
                    child: const Text("Application Pending"),
                  ),
                );
              case "accepted":
                if (assignedGroupZone != null) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'YOUR GROUP JOB',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        'Total worker pool: \$${(campaign.workerPoolCents / 100).toStringAsFixed(2)}',
                      ),
                      Text(
                        'Your scheduled share: \$${((campaign.scheduledShareCents > 0 ? campaign.scheduledShareCents : campaign.workerPoolCents ~/ campaign.scalerCount) / 100).toStringAsFixed(2)}',
                      ),
                      const Text(
                        'Open the private Job Room for meetup, materials, chat, and readiness.',
                      ),
                      FilledButton.icon(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                JobRoomScreen(zoneId: assignedGroupZone!.id),
                          ),
                        ),
                        icon: const Icon(Icons.meeting_room_outlined),
                        label: const Text('Open Job Room'),
                      ),
                    ],
                  );
                }
                return const SizedBox(
                  height: 55,
                  child: ElevatedButton(
                    onPressed: null,
                    child: Text("Accepted / Assigned"),
                  ),
                );
              case "rejected":
                return SizedBox(
                  height: 55,
                  child: ElevatedButton(
                    onPressed: null,
                    child: const Text("Application Declined"),
                  ),
                );
              case "completed":
                return SizedBox(
                  height: 55,
                  child: ElevatedButton(
                    onPressed: null,
                    child: const Text("Campaign Completed"),
                  ),
                );
              default:
                return SizedBox(
                  height: 55,
                  child: ElevatedButton(
                    onPressed: _applying ? null : _applyForCampaign,
                    child: _applying
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text("Apply For Campaign"),
                  ),
                );
            }
          },
        );
      },
    );
  }

  List<LatLng> _parseServiceArea(dynamic data) {
    if (data == null) {
      return [];
    }

    if (data is! List) {
      return [];
    }

    return data
        .map((point) {
          if (point is Map) {
            return LatLng(
              (point['latitude'] ?? point['lat']).toDouble(),
              (point['longitude'] ?? point['lng']).toDouble(),
            );
          }

          return null;
        })
        .whereType<LatLng>()
        .toList();
  }

  Widget _buildCampaignMap(List<Map<String, dynamic>> zones) {
    final List<LatLng> points = [];

    for (final zone in zones) {
      points.addAll(_parseServiceArea(zone["serviceArea"]));
    }

    if (points.length < 3) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(18),
          child: Text("Campaign map unavailable."),
        ),
      );
    }

    final center = points[points.length ~/ 2];

    return Card(
      clipBehavior: Clip.antiAlias,

      child: SizedBox(
        height: 320,

        child: FlutterMap(
          options: MapOptions(initialCenter: center, initialZoom: 15),

          children: [
            TileLayer(
              urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

              userAgentPackageName: "com.scaledcircle.app",
            ),

            PolygonLayer(
              polygons: [
                Polygon(
                  points: points,

                  borderStrokeWidth: 3,

                  color: Colors.blue.withValues(alpha: 0.15),

                  borderColor: Colors.blue,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  // ============================================================
  // BUSINESS REVIEW
  // ============================================================

  Future<void> _openBusinessReview() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    final businessId = widget.campaign.businessId;

    if (businessId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Business information unavailable.")),
      );

      return;
    }

    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreateReviewScreen(
          campaignId: widget.campaign.id,
          reviewerId: user.uid,
          reviewerType: "scaler",
          targetId: businessId,
          targetType: "business",
        ),
      ),
    );
  }

  // ============================================================
  // ZONE HELPERS
  // ============================================================

  int _getEstimatedHomes(Map<String, dynamic> zone) {
    final value =
        zone["estimatedHomes"] ??
        zone["homeCount"] ??
        zone["homes"] ??
        zone["estimatedHouseholds"];

    if (value is int) {
      return value;
    }

    if (value is double) {
      return value.round();
    }

    if (value is num) {
      return value.toInt();
    }

    if (value is String) {
      return int.tryParse(value) ?? 0;
    }

    return 0;
  }

  String _getZoneName(Map<String, dynamic> zone, int index) {
    final value =
        zone["zoneName"] ?? zone["name"] ?? zone["label"] ?? zone["title"];

    if (value != null && value.toString().trim().isNotEmpty) {
      return value.toString();
    }

    return "Zone ${index + 1}";
  }

  int _totalHomes(List<Map<String, dynamic>> zones) {
    return zones.fold<int>(
      0,
      (total, zone) => total + _getEstimatedHomes(zone),
    );
  }

  // ============================================================
  // BUILD
  // ============================================================

  @override
  Widget build(BuildContext context) {
    final campaign = widget.campaign;

    return Scaffold(
      appBar: AppBar(title: const Text("Campaign Details")),

      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ====================================================
          // CAMPAIGN HEADER
          // ====================================================
          Text(
            campaign.campaignName,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 10),

          Text(
            campaign.description,
            style: const TextStyle(fontSize: 16, height: 1.4),
          ),
          if (campaign.materialLogistics.isNotEmpty) ...[
            const SizedBox(height: 16),
            _materialPlanCard(campaign.materialLogistics),
          ],

          const SizedBox(height: 20),

          // ====================================================
          // BUSINESS PROFILE
          // ====================================================
          SizedBox(
            height: 55,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.business),
              label: const Text("View Business Profile"),
              onPressed: _openBusinessProfile,
            ),
          ),

          const SizedBox(height: 28),

          // ====================================================
          // EARNINGS
          // ====================================================
          _sectionTitle(Icons.payments_outlined, "Earnings"),

          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  if (campaign.scalerCount > 1) ...[
                    _info(
                      Icons.groups_outlined,
                      "GROUP OPPORTUNITY",
                      bold: true,
                    ),
                    _info(
                      Icons.account_balance_wallet_outlined,
                      "\$${(campaign.workerPoolCents / 100).toStringAsFixed(2)} Total group worker pool",
                    ),
                    _info(
                      Icons.group_add_outlined,
                      "${campaign.scalerCount} Scalers requested",
                    ),
                    _info(
                      Icons.groups_2_outlined,
                      "${campaign.assignedScalerCount} / ${campaign.scalerCount} group slots filled",
                    ),
                    _info(
                      Icons.payments_outlined,
                      "\$${((campaign.scheduledShareCents > 0 ? campaign.scheduledShareCents : campaign.workerPoolCents ~/ campaign.scalerCount) / 100).toStringAsFixed(2)} Initial scheduled share",
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 10),
                      child: Text(
                        'Your scheduled share is fixed before acceptance. No-show pay is not guaranteed; final pay may increase only after verified contribution and settlement, and total group pay cannot exceed the funded worker pool.',
                      ),
                    ),
                    const Divider(height: 28),
                  ],
                  if (campaign.scalerCount == 1) ...[
                    _info(
                      Icons.payments,
                      "\$${campaign.basePay.toStringAsFixed(2)} Base Pay",
                    ),
                    _info(
                      Icons.card_giftcard,
                      "\$${campaign.bonus.toStringAsFixed(2)} Completion Bonus",
                    ),
                    const Divider(height: 28),
                    _info(
                      Icons.account_balance_wallet,
                      "\$${(campaign.basePay + campaign.bonus).toStringAsFixed(2)} Potential Earnings",
                      bold: true,
                    ),
                  ],

                ],
              ),
            ),
          ),

          const SizedBox(height: 28),

          // ====================================================
          // CAMPAIGN AREA / WORKLOAD
          // ====================================================
          _sectionTitle(Icons.map_outlined, "Campaign Area"),

          const SizedBox(height: 12),

          _info(Icons.location_on, campaign.address),

          _info(Icons.groups, "${campaign.scalerCount} Scalers Needed"),

          const SizedBox(height: 8),

          StreamBuilder<List<Map<String, dynamic>>>(
            stream: _campaignService.getCampaignZones(campaign.id),

            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Card(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                );
              }

              if (snapshot.hasError) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.warning_amber),

                        const SizedBox(width: 12),

                        Expanded(
                          child: Text(
                            "Campaign area could not be loaded.\n\n${snapshot.error}",
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }

              final zones = snapshot.data ?? <Map<String, dynamic>>[];

              if (zones.isEmpty) {
                return const Card(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Row(
                      children: [
                        Icon(Icons.map_outlined),

                        SizedBox(width: 12),

                        Expanded(
                          child: Text("No campaign zones are available."),
                        ),
                      ],
                    ),
                  ),
                );
              }

              final estimatedHomes = _totalHomes(zones);

              return Column(
                children: [
                  // ============================================
                  // WORKLOAD SUMMARY
                  // ============================================
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: _stat(
                                  icon: Icons.home_outlined,
                                  value: estimatedHomes > 0
                                      ? estimatedHomes.toString()
                                      : "—",
                                  label: "Estimated Homes",
                                ),
                              ),

                              Container(
                                height: 55,
                                width: 1,
                                color: Theme.of(context).dividerColor,
                              ),

                              Expanded(
                                child: _stat(
                                  icon: Icons.layers_outlined,
                                  value: zones.length.toString(),
                                  label: zones.length == 1 ? "Zone" : "Zones",
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // ============================================
                  // MAP PLACEHOLDER
                  //
                  // We will replace this with the SAME map
                  // implementation used by the business mapper.
                  // ============================================
                  _buildCampaignMap(zones),

                  const SizedBox(height: 12),

                  // ============================================
                  // ZONE LIST
                  // ============================================
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Posted Zones",
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                            ),
                          ),

                          const SizedBox(height: 12),

                          for (int i = 0; i < zones.length; i++) ...[
                            _zoneRow(
                              name: _getZoneName(zones[i], i),
                              estimatedHomes: _getEstimatedHomes(zones[i]),
                            ),

                            if (i < zones.length - 1) const Divider(height: 22),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),

          const SizedBox(height: 28),

          // ====================================================
          // VERIFICATION
          // ====================================================
          _sectionTitle(Icons.verified_outlined, "Verification Requirements"),

          const SizedBox(height: 14),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  _check("Before Photo", campaign.beforePhotoRequired),

                  const SizedBox(height: 12),

                  _check("After Photo", campaign.afterPhotoRequired),

                  const SizedBox(height: 12),

                  _check(
                    "Business Approval",
                    campaign.businessApprovalRequired,
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 40),

          // ====================================================
          // ACTION
          // ====================================================
          _buildCampaignAction(campaign),

          const SizedBox(height: 30),
        ],
      ),
    );
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  Widget _sectionTitle(IconData icon, String title) {
    return Row(
      children: [
        Icon(icon),

        const SizedBox(width: 10),

        Text(
          title,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  Widget _info(IconData icon, String text, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon),

          const SizedBox(width: 12),

          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontWeight: bold ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _stat({
    required IconData icon,
    required String value,
    required String label,
  }) {
    return Column(
      children: [
        Icon(icon),

        const SizedBox(height: 8),

        Text(
          value,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 3),

        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12),
        ),
      ],
    );
  }

  Widget _zoneRow({required String name, required int estimatedHomes}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,

      children: [
        const CircleAvatar(
          radius: 18,

          child: Icon(Icons.location_on_outlined, size: 20),
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,

            children: [
              Text(
                name,

                maxLines: 1,

                overflow: TextOverflow.ellipsis,

                style: const TextStyle(fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 4),

              Text(
                estimatedHomes > 0
                    ? "$estimatedHomes estimated homes"
                    : "Estimated homes unavailable",
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _materialPlanCard(Map<String, dynamic> logistics) {
    final type =
        logistics['fulfillmentType']?.toString() ?? 'no_materials_required';
    final label = switch (type) {
      'scaler_pickup_print_shop' => 'Printing Shop Pickup',
      'scaler_pickup_business' => 'Business Pickup',
      'business_delivery' => 'Business Delivery',
      _ => 'No Physical Materials Required',
    };
    final location = logistics['location']?.toString();
    final shop = logistics['printingShopName']?.toString();
    final instructions = logistics['instructions']?.toString();
    final scheduled = _materialDate(logistics['scheduledAt']);
    final scheduleLabel = scheduled == null
        ? null
        : '${scheduled.month}/${scheduled.day}/${scheduled.year} '
              '${scheduled.hour.toString().padLeft(2, '0')}:'
              '${scheduled.minute.toString().padLeft(2, '0')}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'MATERIALS',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text('Fulfillment: $label'),
            if (shop != null && shop.isNotEmpty) Text('Printing shop: $shop'),
            if (location != null && location.isNotEmpty)
              Text('Location: $location'),
            if (scheduleLabel != null) Text('Date/time: $scheduleLabel'),
            if (instructions != null && instructions.isNotEmpty)
              Text('Instructions: $instructions'),
            const SizedBox(height: 8),
            const Text(
              'These material terms become locked when you accept the assignment.',
            ),
          ],
        ),
      ),
    );
  }

  DateTime? _materialDate(dynamic value) {
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    if (value is Map) {
      final seconds = value['seconds'] ?? value['_seconds'];
      if (seconds is num) {
        return DateTime.fromMillisecondsSinceEpoch(seconds.toInt() * 1000);
      }
    }
    try {
      final dynamic date = value?.toDate();
      return date is DateTime ? date : null;
    } catch (_) {
      return null;
    }
  }

  Widget _check(String label, bool enabled) {
    return Row(
      children: [
        Icon(enabled ? Icons.check_circle : Icons.cancel),

        const SizedBox(width: 10),

        Expanded(child: Text(label)),
      ],
    );
  }
}
