import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../campaigns/campaign_details_screen.dart';
import '../notifications/notifications_screen.dart';
import 'create_campaign_screen.dart';

class BusinessDashboard extends StatelessWidget {
  const BusinessDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(
          child: Text("You must be logged in."),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text("Scaled Circle"),
        centerTitle: true,
        actions: [
          StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
                .collection('notifications')
                .where(
                  'userId',
                  isEqualTo: user.uid,
                )
                .where(
                  'read',
                  isEqualTo: false,
                )
                .snapshots(),
            builder: (context, snapshot) {
              final unreadCount =
                  snapshot.data?.docs.length ?? 0;

              return Stack(
                clipBehavior: Clip.none,
                children: [
                  IconButton(
                    tooltip: "Notifications",
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              const NotificationsScreen(),
                        ),
                      );
                    },
                    icon: const Icon(
                      Icons.notifications_outlined,
                    ),
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
                        padding: const EdgeInsets.symmetric(
                          horizontal: 5,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius:
                              BorderRadius.circular(10),
                        ),
                        child: Center(
                          child: Text(
                            unreadCount > 99
                                ? "99+"
                                : unreadCount.toString(),
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
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: StreamBuilder<QuerySnapshot>(
          stream: FirebaseFirestore.instance
              .collection('campaigns')
              .where(
                'businessId',
                isEqualTo: user.uid,
              )
              .orderBy(
                'createdAt',
                descending: true,
              )
              .snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(
                child: Text(
                  snapshot.error.toString(),
                ),
              );
            }

            if (snapshot.connectionState ==
                ConnectionState.waiting) {
              return const Center(
                child: CircularProgressIndicator(),
              );
            }

            final campaigns =
                snapshot.data?.docs ?? [];

            final activeCampaigns =
                campaigns.where((campaign) {
              final data =
                  campaign.data()
                      as Map<String, dynamic>;

              final status =
                  data['status']?.toString() ?? '';

              return status != 'completed';
            }).toList();

            final submittedCampaigns =
                campaigns.where((campaign) {
              final data =
                  campaign.data()
                      as Map<String, dynamic>;

              return data['status'] == 'submitted';
            }).toList();

            return ListView(
              children: [
                const Text(
                  "Welcome Back!",
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 20),

                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text(
                      "Create Campaign",
                    ),
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              const CreateCampaignScreen(),
                        ),
                      );
                    },
                  ),
                ),

                const SizedBox(height: 30),

                Row(
                  children: [
                    Expanded(
                      child: Card(
                        child: Padding(
                          padding:
                              const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              Text(
                                activeCampaigns.length
                                    .toString(),
                                style: const TextStyle(
                                  fontSize: 34,
                                  fontWeight:
                                      FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                "Active Campaigns",
                                textAlign:
                                    TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: Card(
                        child: Padding(
                          padding:
                              const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              Text(
                                submittedCampaigns
                                    .length
                                    .toString(),
                                style: const TextStyle(
                                  fontSize: 34,
                                  fontWeight:
                                      FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                "Needs Review",
                                textAlign:
                                    TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                if (submittedCampaigns.isNotEmpty) ...[
                  const SizedBox(height: 25),

                  const Text(
                    "Needs Review",
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 15),

                  ...submittedCampaigns.map(
                    (campaign) {
                      final data =
                          campaign.data()
                              as Map<String, dynamic>;

                      return Card(
                        margin:
                            const EdgeInsets.only(
                          bottom: 12,
                        ),
                        child: ListTile(
                          leading: const Icon(
                            Icons.fact_check_outlined,
                          ),
                          title: Text(
                            data['campaignName']
                                    ?.toString() ??
                                'Untitled Campaign',
                            style: const TextStyle(
                              fontWeight:
                                  FontWeight.bold,
                            ),
                          ),
                          subtitle: const Text(
                            "Scaler submitted work for review",
                          ),
                          trailing: const Icon(
                            Icons.arrow_forward_ios,
                            size: 18,
                          ),
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    CampaignDetailsScreen(
                                  campaign: campaign,
                                ),
                              ),
                            );
                          },
                        ),
                      );
                    },
                  ),
                ],

                const SizedBox(height: 25),

                const Text(
                  "My Campaigns",
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 15),

                if (campaigns.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text(
                        "No campaigns yet.",
                      ),
                    ),
                  ),

                ...campaigns.map(
                  (campaign) {
                    final data =
                        campaign.data()
                            as Map<String, dynamic>;

                    final status =
                        data['status']?.toString() ??
                            '';

                    final applications =
                        (data['applications'] as num?)
                                ?.toInt() ??
                            0;

                    return Card(
                      margin:
                          const EdgeInsets.only(
                        bottom: 15,
                      ),
                      child: ListTile(
                        leading: const Icon(
                          Icons.campaign,
                          color: Colors.blue,
                        ),
                        title: Text(
                          data['campaignName']
                                  ?.toString() ??
                              '',
                          style: const TextStyle(
                            fontWeight:
                                FontWeight.bold,
                          ),
                        ),
                        subtitle: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 5),

                            Text(
                              data['description']
                                      ?.toString() ??
                                  '',
                              maxLines: 2,
                              overflow:
                                  TextOverflow.ellipsis,
                            ),

                            const SizedBox(height: 5),

                            Text(
                              "${data['homes'] ?? 0} homes • \$${data['basePay'] ?? 0}",
                              style: const TextStyle(
                                fontWeight:
                                    FontWeight.w500,
                              ),
                            ),

                            if (status == 'open' &&
                                applications > 0) ...[
                              const SizedBox(
                                height: 5,
                              ),
                              Text(
                                "$applications Scaler${applications == 1 ? '' : 's'} applied",
                                style: const TextStyle(
                                  fontWeight:
                                      FontWeight.w600,
                                ),
                              ),
                            ],
                          ],
                        ),
                        trailing: const Icon(
                          Icons.arrow_forward_ios,
                          size: 18,
                        ),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  CampaignDetailsScreen(
                                campaign: campaign,
                              ),
                            ),
                          );
                        },
                      ),
                    );
                  },
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}