import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../models/campaign_model.dart';
import '../../../services/campaign_service.dart';
import '../../business/profile/business_profile_screen.dart';
import '../../reviews/create_review_screen.dart';
import '../completion/submit_completion_screen.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class ScalerCampaignDetailsScreen extends StatefulWidget {
  final CampaignModel campaign;

  const ScalerCampaignDetailsScreen({
    super.key,
    required this.campaign,
  });

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
        const SnackBar(
          content: Text("Business information unavailable."),
        ),
      );

      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BusinessProfileScreen(
          businessId: businessId,
        ),
      ),
    );
  }

  // ============================================================
  // SUBMIT COMPLETION
  // ============================================================

  void _openSubmitCompletion() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SubmitCompletionScreen(
          campaignId: widget.campaign.id,
          businessId: widget.campaign.businessId,
        ),
      ),
    );
  }

  // ============================================================
  // APPLY
  // ============================================================

  Future<void> _applyForCampaign() async {
  final user = FirebaseAuth.instance.currentUser;

  if (user == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text("You must be logged in."),
      ),
    );

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

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(e.toString()),
      ),
    );

  } finally {
    if (mounted) {
      setState(() {
        _applying = false;
      });
    }
  }
}

  List<LatLng> _parseServiceArea(dynamic data) {

  if (data == null) {
    return [];
  }


  if (data is! List) {
    return [];
  }


  return data.map((point) {

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
Widget _buildCampaignMap(
    List<Map<String,dynamic>> zones,
) {

  final List<LatLng> points = [];


  for(final zone in zones){

    points.addAll(
      _parseServiceArea(
        zone['serviceArea'],
      ),
    );

  }


  if(points.length < 3){

    return const Card(
      child: Padding(
        padding: EdgeInsets.all(18),
        child: Text(
          "Campaign map unavailable",
        ),
      ),
    );

  }


  final center =
      points[points.length ~/ 2];


  return Card(

    clipBehavior: Clip.antiAlias,


    child: SizedBox(

      height:320,


      child: FlutterMap(

        options: MapOptions(

          initialCenter:center,

          initialZoom:15,

        ),


        children:[


          TileLayer(

            urlTemplate:
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

            userAgentPackageName:
            'com.scaledcircle.app',

          ),



          PolygonLayer(

            polygons:[

              Polygon(

                points:points,

                borderStrokeWidth:3,

                color:
                Colors.blue.withValues(alpha:0.15),

                borderColor:
                Colors.blue,

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
        const SnackBar(
          content: Text("Business information unavailable."),
        ),
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

  String _getZoneName(
    Map<String, dynamic> zone,
    int index,
  ) {
    final value =
        zone["zoneName"] ??
        zone["name"] ??
        zone["label"] ??
        zone["title"];

    if (value != null &&
        value.toString().trim().isNotEmpty) {
      return value.toString();
    }

    return "Zone ${index + 1}";
  }

  int _totalHomes(
    List<Map<String, dynamic>> zones,
  ) {
    return zones.fold<int>(
      0,
      (total, zone) =>
          total + _getEstimatedHomes(zone),
    );
  }

  // ============================================================
  // BUILD
  // ============================================================

  @override
  Widget build(BuildContext context) {
    final campaign = widget.campaign;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Campaign Details"),
      ),

      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ====================================================
          // CAMPAIGN HEADER
          // ====================================================

          Text(
            campaign.campaignName,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
            ),
          ),

          const SizedBox(height: 10),

          Text(
            campaign.description,
            style: const TextStyle(
              fontSize: 16,
              height: 1.4,
            ),
          ),

          const SizedBox(height: 20),

          // ====================================================
          // BUSINESS PROFILE
          // ====================================================

          SizedBox(
            height: 55,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.business),
              label: const Text(
                "View Business Profile",
              ),
              onPressed: _openBusinessProfile,
            ),
          ),

          const SizedBox(height: 28),

          // ====================================================
          // EARNINGS
          // ====================================================

          _sectionTitle(
            Icons.payments_outlined,
            "Earnings",
          ),

          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
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
              ),
            ),
          ),

          const SizedBox(height: 28),

          // ====================================================
          // CAMPAIGN AREA / WORKLOAD
          // ====================================================

          _sectionTitle(
            Icons.map_outlined,
            "Campaign Area",
          ),

          const SizedBox(height: 12),

          _info(
            Icons.location_on,
            campaign.address,
          ),

          _info(
            Icons.groups,
            "${campaign.scalerCount} Scalers Needed",
          ),

          const SizedBox(height: 8),

          StreamBuilder<List<Map<String, dynamic>>>(
            stream: _campaignService.getCampaignZones(
              campaign.id,
            ),

            builder: (context, snapshot) {
              if (snapshot.connectionState ==
                  ConnectionState.waiting) {
                return const Card(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(
                      child: CircularProgressIndicator(),
                    ),
                  ),
                );
              }

              if (snapshot.hasError) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Row(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.warning_amber,
                        ),

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

              final zones =
                  snapshot.data ??
                  <Map<String, dynamic>>[];

              if (zones.isEmpty) {
                return const Card(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Row(
                      children: [
                        Icon(Icons.map_outlined),

                        SizedBox(width: 12),

                        Expanded(
                          child: Text(
                            "No campaign zones are available.",
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }

              final estimatedHomes =
                  _totalHomes(zones);

              return Column(
                children: [
                  // ============================================
                  // WORKLOAD SUMMARY
                  // ============================================

                  Card(
                    child: Padding(
                      padding:
                          const EdgeInsets.all(18),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: _stat(
                                  icon:
                                      Icons.home_outlined,
                                  value:
                                      estimatedHomes > 0
                                          ? estimatedHomes
                                                .toString()
                                          : "—",
                                  label:
                                      "Estimated Homes",
                                ),
                              ),

                              Container(
                                height: 55,
                                width: 1,
                                color:
                                    Theme.of(context)
                                        .dividerColor,
                              ),

                              Expanded(
                                child: _stat(
                                  icon:
                                      Icons.layers_outlined,
                                  value:
                                      zones.length
                                          .toString(),
                                  label: zones.length == 1
                                      ? "Zone"
                                      : "Zones",
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

                  Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(
                      minHeight: 170,
                    ),
                    decoration: BoxDecoration(
                      borderRadius:
                          BorderRadius.circular(16),
                      border: Border.all(
                        color:
                            Theme.of(context)
                                .dividerColor,
                      ),
                    ),
                    child: Padding(
                      padding:
                          const EdgeInsets.all(20),
                      child: Column(
                        mainAxisAlignment:
                            MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.map_outlined,
                            size: 42,
                          ),

                          const SizedBox(height: 10),

                          Text(
                            "${zones.length} campaign ${zones.length == 1 ? "zone" : "zones"} mapped",
                            textAlign:
                                TextAlign.center,
                            style:
                                const TextStyle(
                              fontSize: 16,
                              fontWeight:
                                  FontWeight.bold,
                            ),
                          ),

                          const SizedBox(height: 6),

                          _buildCampaignMap(zones),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // ============================================
                  // ZONE LIST
                  // ============================================

                  Card(
                    child: Padding(
                      padding:
                          const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Posted Zones",
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight:
                                  FontWeight.bold,
                            ),
                          ),

                          const SizedBox(height: 12),

                          for (
                            int i = 0;
                            i < zones.length;
                            i++
                          ) ...[
                            _zoneRow(
                              name:
                                  _getZoneName(
                                zones[i],
                                i,
                              ),
                              estimatedHomes:
                                  _getEstimatedHomes(
                                zones[i],
                              ),
                            ),

                            if (i <
                                zones.length - 1)
                              const Divider(
                                height: 22,
                              ),
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

          _sectionTitle(
            Icons.verified_outlined,
            "Verification Requirements",
          ),

          const SizedBox(height: 14),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  _check(
                    "Before Photo",
                    campaign.beforePhotoRequired,
                  ),

                  const SizedBox(height: 12),

                  _check(
                    "After Photo",
                    campaign.afterPhotoRequired,
                  ),

                  const SizedBox(height: 12),

                  _check(
                    "Business Approval",
                    campaign
                        .businessApprovalRequired,
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 40),

          // ====================================================
          // ACTION
          // ====================================================

          if (campaign.status == "completed")
            SizedBox(
              height: 55,
              child: ElevatedButton.icon(
                icon:
                    const Icon(Icons.star_outline),
                label:
                    const Text("Review Business"),
                onPressed: _openBusinessReview,
              ),
            )
          else if (campaign.status == "assigned")
            SizedBox(
              height: 55,
              child: ElevatedButton.icon(
                icon: const Icon(
                  Icons.assignment_turned_in,
                ),
                label:
                    const Text("Submit Completion"),
                onPressed:
                    _openSubmitCompletion,
              ),
            )
          else
            SizedBox(
              height: 55,
              child: ElevatedButton(
                onPressed:
                    _applying
                        ? null
                        : _applyForCampaign,
                child: _applying
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child:
                            CircularProgressIndicator(
                          strokeWidth: 2,
                        ),
                      )
                    : const Text(
                        "Apply For Campaign",
                      ),
              ),
            ),

          const SizedBox(height: 30),
        ],
      ),
    );
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  Widget _sectionTitle(
    IconData icon,
    String title,
  ) {
    return Row(
      children: [
        Icon(icon),

        const SizedBox(width: 10),

        Text(
          title,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }

  Widget _info(
    IconData icon,
    String text, {
    bool bold = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: 8,
      ),
      child: Row(
        children: [
          Icon(icon),

          const SizedBox(width: 12),

          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontWeight:
                    bold
                        ? FontWeight.bold
                        : FontWeight.normal,
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
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),

        const SizedBox(height: 3),

        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
          ),
        ),
      ],
    );
  }


  Widget _zoneRow({
    required String name,
    required int estimatedHomes,
  }) {
    return Row(
      children: [
        const CircleAvatar(
          radius: 18,
          child: Icon(
            Icons.location_on_outlined,
            size: 20,
          ),
        ),

        const SizedBox(width: 12),

        Expanded(
          child: Column(
            crossAxisAlignment:
                CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 3),

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

  Widget _check(
    String label,
    bool enabled,
  ) {
    return Row(
      children: [
        Icon(
          enabled
              ? Icons.check_circle
              : Icons.cancel,
        ),

        const SizedBox(width: 10),

        Expanded(
          child: Text(label),
        ),
      ],
    );
  }
}