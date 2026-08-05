import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../business/edit_campaign_screen.dart';
import 'campaign_applicants_screen.dart';

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
          title: const Text("Approve Completion"),
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
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  true,
                );
              },
              child: const Text("Approve"),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      final firestore =
          FirebaseFirestore.instance;

      final batch = firestore.batch();

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
            'userId': assignedWorkerId,
            'type': 'campaign_completed',
            'title': 'Campaign Completed',
            'message':
                'Your work on $campaignName was approved.',
            'campaignId':
                liveCampaign.id,
            'read': false,
            'createdAt':
                FieldValue.serverTimestamp(),
          },
        );
      }

      await batch.commit();

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Job approved and marked completed.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;

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
              child:
                  const Text("Cancel"),
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
              child:
                  const Text("Send"),
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

      final batch = firestore.batch();

      batch.update(
        liveCampaign.reference,
        {
          'status': 'in_progress',
          'reviewFeedback': feedback,
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
            'read': false,
            'createdAt':
                FieldValue.serverTimestamp(),
          },
        );
      }

      await batch.commit();

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Changes requested. The job has been returned to the Scaler.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;

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
              child:
                  const Text("Cancel"),
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
              child:
                  const Text("Delete"),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      await reference.delete();

      if (!context.mounted) return;

      Navigator.pop(context);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Campaign deleted.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to delete campaign: $e",
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot>(
      stream:
          campaign.reference.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Scaffold(
            appBar: AppBar(
              title: const Text(
                "Campaign Details",
              ),
            ),
            body: Center(
              child: Text(
                snapshot.error.toString(),
              ),
            ),
          );
        }

        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(
              child:
                  CircularProgressIndicator(),
            ),
          );
        }

        final liveCampaign =
            snapshot.data!;

        if (!liveCampaign.exists) {
          return Scaffold(
            appBar: AppBar(
              title: const Text(
                "Campaign Details",
              ),
            ),
            body: const Center(
              child: Text(
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
            data['homes']?.toString() ??
                '0';

        final basePay =
            data['basePay']?.toString() ??
                '0';

        final bonus =
            data['bonus']?.toString() ??
                '0';

        final deadline =
            data['deadline']
                    ?.toString() ??
                'No deadline';

        final status =
            data['status']?.toString() ??
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

        return Scaffold(
          appBar: AppBar(
            title: const Text(
              "Campaign Details",
            ),
            centerTitle: true,
          ),
          body: ListView(
            padding:
                const EdgeInsets.all(20),
            children: [
              Text(
                campaignName,
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight:
                      FontWeight.bold,
                ),
              ),

              const SizedBox(
                height: 10,
              ),

              Chip(
                avatar: Icon(
                  _statusIcon(status),
                  size: 18,
                ),
                label: Text(
                  _statusLabel(status),
                ),
              ),

              const SizedBox(
                height: 20,
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

              if (assignedWorkerEmail !=
                      null &&
                  assignedWorkerEmail
                      .isNotEmpty)
                _infoCard(
                  Icons.person,
                  "Assigned Scaler",
                  assignedWorkerEmail,
                ),

              if (reviewFeedback != null &&
                  reviewFeedback
                      .isNotEmpty)
                _infoCard(
                  Icons
                      .feedback_outlined,
                  "Latest Review Feedback",
                  reviewFeedback,
                ),

              if (status == 'open') ...[
                const SizedBox(
                  height: 10,
                ),

                SizedBox(
                  height: 55,
                  child:
                      ElevatedButton.icon(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              CampaignApplicantsScreen(
                            campaign:
                                liveCampaign,
                          ),
                        ),
                      );
                    },
                    icon: const Icon(
                      Icons
                          .people_alt_outlined,
                    ),
                    label: Text(
                      "View Applicants ($applicationCount)",
                    ),
                  ),
                ),
              ],

              if (status ==
                  'submitted') ...[
                const SizedBox(
                  height: 20,
                ),

                Card(
                  child: Padding(
                    padding:
                        const EdgeInsets.all(
                      20,
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.fact_check,
                          size: 44,
                        ),
                        const SizedBox(
                          height: 10,
                        ),
                        const Text(
                          "Completion Submitted",
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight:
                                FontWeight
                                    .bold,
                          ),
                        ),
                        const SizedBox(
                          height: 8,
                        ),
                        const Text(
                          "The Scaler has submitted this job for your review.",
                          textAlign:
                              TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(
                  height: 20,
                ),

                SizedBox(
                  height: 55,
                  child:
                      ElevatedButton.icon(
                    onPressed: () {
                      _approveCompletion(
                        context,
                        liveCampaign,
                      );
                    },
                    icon: const Icon(
                      Icons.verified,
                    ),
                    label: const Text(
                      "Approve Completion",
                    ),
                  ),
                ),

                const SizedBox(
                  height: 12,
                ),

                SizedBox(
                  height: 55,
                  child:
                      OutlinedButton.icon(
                    onPressed: () {
                      _requestChanges(
                        context,
                        liveCampaign,
                      );
                    },
                    icon: const Icon(
                      Icons
                          .assignment_return,
                    ),
                    label: const Text(
                      "Request Changes",
                    ),
                  ),
                ),
              ],

              if (status ==
                  'completed') ...[
                const SizedBox(
                  height: 20,
                ),

                const Card(
                  child: Padding(
                    padding:
                        EdgeInsets.all(20),
                    child: Column(
                      children: [
                        Icon(
                          Icons.verified,
                          size: 46,
                        ),
                        SizedBox(
                          height: 10,
                        ),
                        Text(
                          "Campaign Completed",
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight:
                                FontWeight
                                    .bold,
                          ),
                        ),
                        SizedBox(
                          height: 8,
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
                height: 30,
              ),

              if (status == 'open')
                SizedBox(
                  height: 55,
                  child:
                      ElevatedButton.icon(
                    icon: const Icon(
                      Icons.edit,
                    ),
                    label: const Text(
                      "Edit Campaign",
                    ),
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              EditCampaignScreen(
                            campaign:
                                liveCampaign,
                          ),
                        ),
                      );
                    },
                  ),
                ),

              if (status == 'open')
                const SizedBox(
                  height: 15,
                ),

              SizedBox(
                height: 55,
                child:
                    ElevatedButton.icon(
                  style:
                      ElevatedButton.styleFrom(
                    backgroundColor:
                        Colors.red,
                    foregroundColor:
                        Colors.white,
                  ),
                  icon: const Icon(
                    Icons.delete,
                  ),
                  label: const Text(
                    "Delete Campaign",
                  ),
                  onPressed: () {
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
        bottom: 14,
      ),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(value),
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
        return Icons
            .assignment_turned_in;
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