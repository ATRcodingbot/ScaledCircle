import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../models/notification_destination.dart';
import '../../navigation/context_back_button.dart';

import '../campaigns/campaign_applicants_screen.dart';
import '../jobs/scaler_wallet_screen.dart';
import '../business/weather_alerts_screen.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({
    super.key,
    this.currentUserId,
    this.notificationsStream,
  });
  final String? currentUserId;
  final Stream<QuerySnapshot>? notificationsStream;

  Future<void> _markAsRead(DocumentReference reference) async {
    await reference.update({
      'read': true,
      'readAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> _markAllAsRead(String userId) async {
    final firestore = FirebaseFirestore.instance;

    final snapshot = await firestore
        .collection('notifications')
        .where('userId', isEqualTo: userId)
        .where('read', isEqualTo: false)
        .get();

    if (snapshot.docs.isEmpty) {
      return;
    }

    final batch = firestore.batch();

    for (final doc in snapshot.docs) {
      batch.update(doc.reference, {
        'read': true,
        'readAt': FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  Future<void> _openNotification(
    BuildContext context,
    QueryDocumentSnapshot notification,
  ) async {
    final data = notification.data() as Map<String, dynamic>;
    final target = notificationDestination(data);
    if (target == null) return;
    try {
      if (data['read'] != true) await _markAsRead(notification.reference);
      if (!context.mounted) return;
      if (target.kind == 'earnings') {
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ScalerWalletScreen()),
        );
      } else if (target.kind == 'weather') {
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const WeatherAlertsScreen()),
        );
      } else if (target.kind == 'route') {
        // Keep Notifications on the real Navigator stack for visible/system Back.
        await Navigator.of(context).pushNamed(target.route!);
      } else if (target.kind == 'applicants') {
        final campaign = await FirebaseFirestore.instance
            .collection('campaigns')
            .doc(target.campaignId)
            .get();
        if (!context.mounted) return;
        if (!campaign.exists) {
          _showMessage(context, 'This campaign is no longer available.');
          return;
        }
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => CampaignApplicantsScreen(campaign: campaign),
          ),
        );
      }
    } catch (_) {
      if (context.mounted) {
        _showMessage(context, "We couldn't open this notification. Try again.");
      }
    }
  }

  void _showMessage(BuildContext context, String message) {
    if (!context.mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final userId = currentUserId ?? FirebaseAuth.instance.currentUser?.uid;

    if (userId == null) {
      return const Scaffold(
        body: Center(
          child: Text('You must be logged in to view notifications.'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: const ContextBackButton(),
        title: const Text('Notifications'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all),
            tooltip: 'Mark all as read',
            onPressed: () async {
              await _markAllAsRead(userId);

              if (!context.mounted) {
                return;
              }

              _showMessage(context, 'All notifications marked as read.');
            },
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream:
            notificationsStream ??
            FirebaseFirestore.instance
                .collection('notifications')
                .where('userId', isEqualTo: userId)
                .orderBy('createdAt', descending: true)
                .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text(snapshot.error.toString()));
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final notifications = snapshot.data?.docs ?? [];

          if (notifications.isEmpty) {
            return const Center(child: Text('No notifications yet.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: notifications.length,
            itemBuilder: (context, index) {
              final notification = notifications[index];

              final data = notification.data() as Map<String, dynamic>;

              return _notificationCard(context, notification, data);
            },
          );
        },
      ),
    );
  }

  Widget _notificationCard(
    BuildContext context,
    QueryDocumentSnapshot notification,
    Map<String, dynamic> data,
  ) {
    final title = data['title']?.toString() ?? 'Notification';

    final message = data['message']?.toString() ?? '';

    final type = data['type']?.toString() ?? '';

    final read = data['read'] == true;

    final createdAt = data['createdAt'];

    final target = notificationDestination(data);
    final action = target?.label;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: target == null
            ? null
            : () => _openNotification(context, notification),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: _backgroundColor(type),
                child: Icon(_icon(type)),
              ),

              const SizedBox(width: 14),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: read
                                  ? FontWeight.w500
                                  : FontWeight.bold,
                            ),
                          ),
                        ),

                        if (!read)
                          const CircleAvatar(
                            radius: 5,
                            backgroundColor: Colors.blue,
                          ),
                      ],
                    ),

                    const SizedBox(height: 8),

                    Text(message),

                    const SizedBox(height: 10),

                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _formatTimestamp(createdAt),
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),

                        if (action != null) ...[
                          Text(
                            action,
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),

                          const SizedBox(width: 5),

                          const Icon(Icons.arrow_forward, size: 18),
                        ],
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

  Color? _backgroundColor(String type) {
    switch (type) {
      case 'zone_completion_submitted':
        return Colors.green.shade100;

      case 'changes_requested':
        return Colors.orange.shade100;

      case 'weather_opportunity':
        return Colors.orange.shade100;

      case 'application_rejected':
        return Colors.red.shade100;

      default:
        return null;
    }
  }

  IconData _icon(String type) {
    switch (type) {
      case 'zone_completion_submitted':
        return Icons.fact_check_outlined;

      case 'application_received':
        return Icons.person_add;

      case 'application_accepted':
      case 'job_assignment':
        return Icons.verified;

      case 'job_room_message':
        return Icons.chat_bubble_outline;

      case 'material_logistics_locked':
        return Icons.lock_outline;

      case 'material_change_proposed':
      case 'material_change_accept':
      case 'material_change_decline':
      case 'material_change_confirmed':
        return Icons.rule_folder_outlined;

      case 'job_readiness_acknowledged':
        return Icons.check_circle_outline;

      case 'material_received':
        return Icons.inventory_2_outlined;

      case 'material_issue_reported':
        return Icons.report_problem_outlined;

      case 'application_rejected':
        return Icons.cancel;

      case 'changes_requested':
        return Icons.feedback;

      case 'campaign_completed':
        return Icons.task_alt;

      case 'payout_approved':
        return Icons.account_balance_wallet_outlined;

      case 'weather_opportunity':
        return Icons.thunderstorm;

      default:
        return Icons.notifications;
    }
  }

  String _formatTimestamp(dynamic timestamp) {
    if (timestamp is! Timestamp) {
      return '';
    }

    final date = timestamp.toDate();

    final difference = DateTime.now().difference(date);

    if (difference.inMinutes < 1) {
      return 'Just now';
    }

    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    }

    if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    }

    return '${date.month}/${date.day}/${date.year}';
  }
}
