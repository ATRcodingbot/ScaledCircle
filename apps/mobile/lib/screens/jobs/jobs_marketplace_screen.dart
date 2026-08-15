import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/discovery_preferences_service.dart';
import '../preferences/areas_preferences_screen.dart';

import '../notifications/notifications_screen.dart';
import 'job_details_screen.dart';
import 'my_jobs_screen.dart';
import 'scaler_wallet_screen.dart';

class JobsMarketplaceScreen extends StatefulWidget {
  const JobsMarketplaceScreen({
    super.key,
    this.initialIndex = 0,
  });

  final int initialIndex;

  @override
  State<JobsMarketplaceScreen> createState() => _JobsMarketplaceScreenState();
}

class _JobsMarketplaceScreenState extends State<JobsMarketplaceScreen> {
  final searchController = TextEditingController();

  String search = '';
  late int currentIndex;
  bool forYou = true;
  Map<String, dynamic>? preferences;

  @override
  void initState() {
    super.initState();
    currentIndex = widget.initialIndex.clamp(0, 2);
    DiscoveryPreferencesService().load().then((value) {
      if (mounted) setState(() => preferences = value);
    });
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text("You must be logged in.")),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          currentIndex == 0
              ? 'Available Jobs'
              : currentIndex == 1
              ? 'Current Campaigns'
              : 'My Earnings',
        ),
        centerTitle: true,
        actions: [
          StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
                .collection('notifications')
                .where('userId', isEqualTo: user.uid)
                .where('read', isEqualTo: false)
                .snapshots(),
            builder: (context, snapshot) {
              final unreadCount = snapshot.data?.docs.length ?? 0;

              return Stack(
                clipBehavior: Clip.none,
                children: [
                  IconButton(
                    tooltip: 'Notifications',
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const NotificationsScreen(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.notifications_outlined),
                  ),
                  if (unreadCount > 0)
                    Positioned(
                      right: 5,
                      top: 5,
                      child: Container(
                        constraints: const BoxConstraints(
                          minWidth: 18,
                          minHeight: 18,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Center(
                          child: Text(
                            unreadCount > 99 ? '99+' : unreadCount.toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: currentIndex == 0
          ? _buildMarketplace()
          : currentIndex == 1
          ? const MyJobsScreen()
          : const ScalerWalletScreen(),
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (index) {
          setState(() {
            currentIndex = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.work_outline),
            selectedIcon: Icon(Icons.work),
            label: 'Available Jobs',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Current',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Earnings',
          ),
        ],
      ),
    );
  }

  Widget _buildMarketplace() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('For You'), icon: Icon(Icons.auto_awesome)),
              ButtonSegment(value: false, label: Text('Search All Jobs'), icon: Icon(Icons.public)),
            ],
            selected: {forYou},
            onSelectionChanged: (value) => setState(() => forYou = value.first),
          ),
          const SizedBox(height: 8),
          Text(forYou
              ? 'Based on your saved work areas and job preferences.'
              : 'Manual search is not limited by your saved preferences.'),
          const SizedBox(height: 12),
          TextField(
            controller: searchController,
            decoration: const InputDecoration(
              hintText: 'Search campaigns...',
              prefixIcon: Icon(Icons.search),
              border: OutlineInputBorder(),
            ),
            onChanged: (value) {
              setState(() {
                search = value.toLowerCase().trim();
              });
            },
          ),

          const SizedBox(height: 20),

          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('campaigns')
                  .where('status', isEqualTo: 'open')
                  .orderBy('createdAt', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Text(
                        snapshot.error.toString(),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                final docs = snapshot.data?.docs ?? [];

                final campaigns = docs.where((doc) {
                  final data = doc.data() as Map<String, dynamic>;

                  if (forYou && !_matchesSavedPreferences(data)) return false;

                  final campaignName = (data['campaignName'] ?? '')
                      .toString()
                      .toLowerCase();

                  final description = (data['description'] ?? '')
                      .toString()
                      .toLowerCase();

                  final businessEmail = (data['businessEmail'] ?? '')
                      .toString()
                      .toLowerCase();

                  if (search.isEmpty) {
                    return true;
                  }

                  return campaignName.contains(search) ||
                      description.contains(search) ||
                      businessEmail.contains(search);
                }).toList();

                if (campaigns.isEmpty) {
                  if (forYou && preferences == null) {
                    return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.tune, size: 64),
                      const SizedBox(height: 12),
                      const Text('Personalize the jobs you see', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Tell us what jobs you want, where you work, and how far you travel.'),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: () async {
                        await Navigator.push(context, MaterialPageRoute(builder: (_) =>
                          const AreasPreferencesScreen(role: 'scaler')));
                        final value = await DiscoveryPreferencesService().load();
                        if (mounted) setState(() => preferences = value);
                      }, child: const Text('Set My Preferences')),
                      TextButton(onPressed: () => setState(() => forYou = false), child: const Text('Skip — Search All Jobs')),
                    ]));
                  }
                  return const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.work_off_outlined, size: 64),
                        SizedBox(height: 15),
                        Text(
                          'No available jobs.',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          'New campaigns will appear here automatically.',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  itemCount: campaigns.length,
                  itemBuilder: (context, index) {
                    final campaign = campaigns[index];

                    final data = campaign.data() as Map<String, dynamic>;

                    final campaignName =
                        data['campaignName']?.toString() ?? 'Untitled Campaign';

                    final description = data['description']?.toString() ?? '';

                    final homes = data['homes']?.toString() ?? '0';

                    final basePay = data['basePay']?.toString() ?? '0';

                    final bonus = data['bonus']?.toString() ?? '0';

                    final businessEmail =
                        data['businessEmail']?.toString() ?? '';

                    final applications =
                        (data['applications'] as num?)?.toInt() ?? 0;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 16),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  JobDetailsScreen(campaign: campaign),
                            ),
                          );
                        },
                        child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const CircleAvatar(
                                    child: Icon(Icons.campaign),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          campaignName,
                                          style: const TextStyle(
                                            fontSize: 20,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        if (businessEmail.isNotEmpty)
                                          Text(
                                            businessEmail,
                                            style: TextStyle(
                                              color: Colors.grey.shade700,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  const Icon(Icons.arrow_forward_ios, size: 18),
                                ],
                              ),

                              const SizedBox(height: 15),

                              Text(
                                description,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),

                              const SizedBox(height: 15),

                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  Chip(
                                    avatar: const Icon(Icons.home, size: 18),
                                    label: Text('$homes Homes'),
                                  ),
                                  Chip(
                                    avatar: const Icon(
                                      Icons.attach_money,
                                      size: 18,
                                    ),
                                    label: Text('\$$basePay Pay'),
                                  ),
                                  Chip(
                                    avatar: const Icon(
                                      Icons.card_giftcard,
                                      size: 18,
                                    ),
                                    label: Text('\$$bonus Bonus'),
                                  ),
                                  if (applications > 0)
                                    Chip(
                                      avatar: const Icon(
                                        Icons.people_outline,
                                        size: 18,
                                      ),
                                      label: Text(
                                        '$applications Applicant${applications == 1 ? '' : 's'}',
                                      ),
                                    ),
                                ],
                              ),

                              const SizedBox(height: 10),

                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton.icon(
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => JobDetailsScreen(
                                          campaign: campaign,
                                        ),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.visibility_outlined),
                                  label: const Text('View Job'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  bool _matchesSavedPreferences(Map<String, dynamic> campaign) {
    final saved = preferences;
    if (saved == null) return false; // Safe default: prompt instead of distant-job spam.
    final jobType = (campaign['jobType'] ?? campaign['workType'] ?? 'flyer_distribution').toString();
    final jobTypes = List<String>.from(saved['jobTypes'] as List? ?? const []);
    if (jobTypes.isNotEmpty && !jobTypes.contains(jobType)) return false;
    if (jobType == 'door_to_door' && saved['outreachOptIn'] != true) return false;
    if (jobType == 'crew_jobs' && saved['crewOptIn'] != true) return false;
    final place = (campaign['city'] ?? campaign['county'] ?? campaign['locationName'] ?? '')
        .toString().toLowerCase();
    final postal = (campaign['postalCode'] ?? campaign['zipCode'] ?? '').toString().toLowerCase();
    final areas = List<Map<String, dynamic>>.from((saved['areas'] as List? ?? const [])
        .whereType<Map>().map((value) => Map<String, dynamic>.from(value)));
    double? latitude(dynamic value) => value is GeoPoint ? value.latitude :
        value is Map ? (value['latitude'] as num?)?.toDouble() : null;
    double? longitude(dynamic value) => value is GeoPoint ? value.longitude :
        value is Map ? (value['longitude'] as num?)?.toDouble() : null;
    final target = campaign['location'] ?? campaign['center'] ?? campaign['serviceAreaCenter'];
    double? nearest;
    final local = areas.where((area) => area['enabled'] != false).any((area) {
      final places = List<String>.from(area['places'] as List? ?? const [])
          .map((value) => value.toLowerCase());
      final postals = List<String>.from(area['postalCodes'] as List? ?? const [])
          .map((value) => value.toLowerCase());
      if ((place.isNotEmpty && places.contains(place)) ||
          (postal.isNotEmpty && postals.contains(postal))) {
        return true;
      }
      final center = area['center'];
      final values = [latitude(center), longitude(center), latitude(target), longitude(target)];
      if (values.any((value) => value == null)) return false;
      final dLat = (values[2]! - values[0]!) * math.pi / 180;
      final dLon = (values[3]! - values[1]!) * math.pi / 180;
      final a = math.pow(math.sin(dLat / 2), 2) +
          math.cos(values[0]! * math.pi / 180) * math.cos(values[2]! * math.pi / 180) *
          math.pow(math.sin(dLon / 2), 2);
      final miles = 3958.8 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
      nearest = nearest == null ? miles : math.min(nearest!, miles);
      return miles <= ((area['radiusMiles'] as num?)?.toDouble() ?? 20);
    });
    if (local) return true;
    final mode = (saved['travelMode'] ?? 'nearby').toString();
    if (mode == 'anywhere') return true;
    if (nearest == null) return false;
    if ((mode == 'nearby' || mode == 'up_to_miles') &&
        nearest! <= ((saved['maxTravelMiles'] as num?)?.toDouble() ?? 20)) {
      return true;
    }
    final pay = (campaign['basePay'] as num?)?.toDouble() ?? 0;
    return mode == 'worth_drive' && pay >= math.max(100, nearest! * 3);
  }
}
