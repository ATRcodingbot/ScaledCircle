import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../campaigns/campaign_applicants_screen.dart';
import '../campaigns/campaign_details_screen.dart';
import '../jobs/job_details_screen.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  Future<void> _markAsRead(
    DocumentReference reference,
  ) async {
    await reference.update({
      'read': true,
      'readAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> _markAllAsRead(
    String userId,
  ) async {
    final firestore = FirebaseFirestore.instance;

    final unreadNotifications = await firestore
        .collection('notifications')
        .where(
          'userId',
          isEqualTo: userId,
        )
        .where(
          'read',
          isEqualTo: false,
        )
        .get();

    if (unreadNotifications.docs.isEmpty) {
      return;
    }

    final batch = firestore.batch();

    for (final doc in unreadNotifications.docs) {
      batch.update(
        doc.reference,
        {
          'read': true,
          'readAt': FieldValue.serverTimestamp(),
        },
      );
    }

    await batch.commit();
  }

  Future<void> _openNotification(
    BuildContext context,
    QueryDocumentSnapshot notification,
  ) async {
    final data =
        notification.data() as Map<String, dynamic>;

    final type =
        data['type']?.toString() ?? '';

    final campaignId =
        data['campaignId']?.toString();

    try {
      if (data['read'] != true) {
        await _markAsRead(
          notification.reference,
        );
      }

      if (campaignId == null ||
          campaignId.isEmpty) {
        if (!context.mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              "This notification does not have a campaign attached.",
            ),
          ),
        );

        return;
      }

      final campaign =
          await FirebaseFirestore.instance
              .collection('campaigns')
              .doc(campaignId)
              .get();

      if (!context.mounted) return;

      if (!campaign.exists) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              "This campaign no longer exists.",
            ),
          ),
        );

        return;
      }

      switch (type) {
        case 'application_received':
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) =>
                  CampaignApplicantsScreen(
                campaign: campaign,
              ),
            ),
          );
          break;

        case 'completion_submitted':
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) =>
                  CampaignDetailsScreen(
                campaign: campaign,
              ),
            ),
          );
          break;

        case 'application_accepted':
        case 'application_rejected':
        case 'changes_requested':
        case 'campaign_completed':
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) =>
                  JobDetailsScreen(
                campaign: campaign,
              ),
            ),
          );
          break;

        default:
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                "This notification does not have a destination yet.",
              ),
            ),
          );
      }
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to open notification: $e",
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user =
        FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(
          child: Text(
            "You must be logged in to view notifications.",
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "Notifications",
        ),
        centerTitle: true,
        actions: [
          IconButton(
            tooltip: "Mark all as read",
            onPressed: () async {
              try {
                await _markAllAsRead(
                  user.uid,
                );

                if (!context.mounted) return;

                ScaffoldMessenger.of(context)
                    .showSnackBar(
                  const SnackBar(
                    content: Text(
                      "All notifications marked as read.",
                    ),
                  ),
                );
              } catch (e) {
                if (!context.mounted) return;

                ScaffoldMessenger.of(context)
                    .showSnackBar(
                  SnackBar(
                    content: Text(
                      "Unable to update notifications: $e",
                    ),
                  ),
                );
              }
            },
            icon: const Icon(
              Icons.done_all,
            ),
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('notifications')
            .where(
              'userId',
              isEqualTo: user.uid,
            )
            .orderBy(
              'createdAt',
              descending: true,
            )
            .snapshots(),
        builder: (
          context,
          snapshot,
        ) {
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding:
                    const EdgeInsets.all(20),
                child: Text(
                  snapshot.error.toString(),
                  textAlign:
                      TextAlign.center,
                ),
              ),
            );
          }

          if (snapshot.connectionState ==
              ConnectionState.waiting) {
            return const Center(
              child:
                  CircularProgressIndicator(),
            );
          }

          final notifications =
              snapshot.data?.docs ?? [];

          if (notifications.isEmpty) {
            return const Center(
              child: Padding(
                padding:
                    EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment:
                      MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.notifications_none,
                      size: 64,
                    ),
                    SizedBox(
                      height: 16,
                    ),
                    Text(
                      "No notifications yet.",
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight:
                            FontWeight.bold,
                      ),
                    ),
                    SizedBox(
                      height: 8,
                    ),
                    Text(
                      "Updates about applications, campaigns, and job activity will appear here.",
                      textAlign:
                          TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }

          return ListView.builder(
            padding:
                const EdgeInsets.all(16),
            itemCount:
                notifications.length,
            itemBuilder: (
              context,
              index,
            ) {
              final notification =
                  notifications[index];

              final data =
                  notification.data()
                      as Map<String, dynamic>;

              final type =
                  data['type']
                          ?.toString() ??
                      '';

              if (type ==
                  'application_received') {
                return _applicationCard(
                  context,
                  notification,
                  data,
                );
              }

              return _standardCard(
                context,
                notification,
                data,
              );
            },
          );
        },
      ),
    );
  }

  Widget _applicationCard(
    BuildContext context,
    QueryDocumentSnapshot notification,
    Map<String, dynamic> data,
  ) {
    final message =
        data['message']?.toString() ?? '';

    final createdAt =
        data['createdAt'];

    final isRead =
        data['read'] == true;

    final campaignId =
        data['campaignId']?.toString();

    final scalerEmail =
        data['scalerEmail']?.toString() ??
            _extractScalerEmail(message);

    return FutureBuilder<DocumentSnapshot>(
      future: campaignId == null
          ? null
          : FirebaseFirestore.instance
              .collection('campaigns')
              .doc(campaignId)
              .get(),
      builder: (
        context,
        campaignSnapshot,
      ) {
        String campaignName =
            data['campaignName']
                    ?.toString() ??
                _extractCampaignName(
                  message,
                );

        if (campaignSnapshot.hasData &&
            campaignSnapshot.data!.exists) {
          final campaignData =
              campaignSnapshot.data!.data()
                  as Map<String, dynamic>;

          campaignName =
              campaignData['campaignName']
                      ?.toString() ??
                  campaignName;
        }

        return Card(
          margin: const EdgeInsets.only(
            bottom: 14,
          ),
          child: InkWell(
            borderRadius:
                BorderRadius.circular(12),
            onTap: () {
              _openNotification(
                context,
                notification,
              );
            },
            child: Padding(
              padding:
                  const EdgeInsets.all(18),
              child: Row(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor:
                        Colors.green.shade100,
                    child: Icon(
                      Icons.person_add_alt_1,
                      color:
                          Colors.green.shade800,
                      size: 30,
                    ),
                  ),

                  const SizedBox(
                    width: 16,
                  ),

                  Expanded(
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                "New Scaler Application",
                                style: TextStyle(
                                  fontSize: 19,
                                  fontWeight:
                                      FontWeight.bold,
                                ),
                              ),
                            ),

                            if (!isRead)
                              Container(
                                width: 10,
                                height: 10,
                                decoration:
                                    const BoxDecoration(
                                  color: Colors.blue,
                                  shape:
                                      BoxShape.circle,
                                ),
                              ),
                          ],
                        ),

                        const SizedBox(
                          height: 10,
                        ),

                        Text(
                          scalerEmail,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight:
                                FontWeight.w600,
                          ),
                        ),

                        const SizedBox(
                          height: 4,
                        ),

                        const Text(
                          "applied to",
                          style: TextStyle(
                            fontSize: 14,
                          ),
                        ),

                        const SizedBox(
                          height: 4,
                        ),

                        Text(
                          campaignName,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight:
                                FontWeight.bold,
                          ),
                        ),

                        const SizedBox(
                          height: 14,
                        ),

                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                _formatTimestamp(
                                  createdAt,
                                ),
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors
                                      .grey.shade600,
                                ),
                              ),
                            ),

                            const Text(
                              "View Applicant",
                              style: TextStyle(
                                fontWeight:
                                    FontWeight.w600,
                              ),
                            ),

                            const SizedBox(
                              width: 5,
                            ),

                            const Icon(
                              Icons.arrow_forward,
                              size: 18,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _standardCard(
    BuildContext context,
    QueryDocumentSnapshot notification,
    Map<String, dynamic> data,
  ) {
    final title =
        data['title']?.toString() ??
            'Notification';

    final message =
        data['message']?.toString() ?? '';

    final type =
        data['type']?.toString() ?? '';

    final isRead =
        data['read'] == true;

    final createdAt =
        data['createdAt'];

    return Card(
      margin: const EdgeInsets.only(
        bottom: 12,
      ),
      child: InkWell(
        borderRadius:
            BorderRadius.circular(12),
        onTap: () {
          _openNotification(
            context,
            notification,
          );
        },
        child: Padding(
          padding:
              const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment:
                CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                child: Icon(
                  _iconForType(
                    type,
                  ),
                ),
              ),

              const SizedBox(
                width: 14,
              ),

              Expanded(
                child: Column(
                  crossAxisAlignment:
                      CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight:
                                  isRead
                                      ? FontWeight
                                          .w600
                                      : FontWeight
                                          .bold,
                            ),
                          ),
                        ),

                        if (!isRead)
                          Container(
                            width: 10,
                            height: 10,
                            decoration:
                                const BoxDecoration(
                              shape:
                                  BoxShape.circle,
                              color:
                                  Colors.blue,
                            ),
                          ),
                      ],
                    ),

                    const SizedBox(
                      height: 7,
                    ),

                    Text(
                      message,
                      softWrap: true,
                    ),

                    const SizedBox(
                      height: 12,
                    ),

                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _formatTimestamp(
                              createdAt,
                            ),
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors
                                  .grey.shade600,
                            ),
                          ),
                        ),

                        const Text(
                          "View",
                          style: TextStyle(
                            fontWeight:
                                FontWeight.w600,
                          ),
                        ),

                        const SizedBox(
                          width: 5,
                        ),

                        const Icon(
                          Icons.arrow_forward,
                          size: 17,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _extractScalerEmail(
    String message,
  ) {
    const separator =
        ' applied to ';

    if (!message.contains(separator)) {
      return 'Scaler';
    }

    return message
        .split(separator)
        .first
        .trim();
  }

  String _extractCampaignName(
    String message,
  ) {
    const separator =
        ' applied to ';

    if (!message.contains(separator)) {
      return 'Campaign';
    }

    var name = message
        .split(separator)
        .last
        .trim();

    if (name.endsWith('.')) {
      name = name.substring(
        0,
        name.length - 1,
      );
    }

    return name;
  }

  IconData _iconForType(
    String type,
  ) {
    switch (type) {
      case 'application_accepted':
        return Icons.verified;

      case 'application_rejected':
        return Icons.cancel_outlined;

      case 'application_received':
        return Icons.person_add_alt_1;

      case 'changes_requested':
        return Icons.feedback_outlined;

      case 'completion_submitted':
        return Icons.fact_check_outlined;

      case 'campaign_completed':
        return Icons.task_alt;

      default:
        return Icons.notifications;
    }
  }

  String _formatTimestamp(
    dynamic timestamp,
  ) {
    if (timestamp is! Timestamp) {
      return '';
    }

    final date =
        timestamp.toDate();

    final now =
        DateTime.now();

    final difference =
        now.difference(date);

    if (difference.inMinutes < 1) {
      return 'Just now';
    }

    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    }

    if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    }

    if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    }

    return '${date.month}/${date.day}/${date.year}';
  }
}