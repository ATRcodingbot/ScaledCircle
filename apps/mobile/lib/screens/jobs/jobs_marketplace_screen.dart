import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../notifications/notifications_screen.dart';
import 'job_details_screen.dart';
import 'my_jobs_screen.dart';
import 'scaler_wallet_screen.dart';

class JobsMarketplaceScreen extends StatefulWidget {
  const JobsMarketplaceScreen({super.key});

  @override
  State<JobsMarketplaceScreen> createState() => _JobsMarketplaceScreenState();
}

class _JobsMarketplaceScreenState extends State<JobsMarketplaceScreen> {
  final searchController = TextEditingController();

  String search = '';
  int currentIndex = 0;

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
              ? 'My Jobs'
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
            label: 'My Jobs',
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
}
