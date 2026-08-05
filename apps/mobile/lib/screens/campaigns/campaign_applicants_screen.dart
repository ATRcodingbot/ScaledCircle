import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class CampaignApplicantsScreen extends StatelessWidget {
  final DocumentSnapshot campaign;

  const CampaignApplicantsScreen({
    super.key,
    required this.campaign,
  });

  Future<void> _acceptApplicant(
    BuildContext context,
    QueryDocumentSnapshot application,
  ) async {
    final applicationData =
        application.data() as Map<String, dynamic>;

    final scalerId =
        applicationData['scalerId']?.toString();

    final scalerEmail =
        applicationData['scalerEmail']?.toString();

    if (scalerId == null || scalerId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "This application is missing a Scaler ID.",
          ),
        ),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text("Accept Scaler"),
          content: Text(
            "Accept ${scalerEmail ?? 'this Scaler'} for this campaign?",
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
              child: const Text("Accept"),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      final firestore = FirebaseFirestore.instance;

      final pendingApplications = await firestore
          .collection('applications')
          .where(
            'campaignId',
            isEqualTo: campaign.id,
          )
          .get();

      final batch = firestore.batch();

      for (final doc in pendingApplications.docs) {
        if (doc.id == application.id) {
          batch.update(
            doc.reference,
            {
              'status': 'accepted',
              'acceptedAt':
                  FieldValue.serverTimestamp(),
            },
          );
        } else {
          batch.update(
            doc.reference,
            {
              'status': 'rejected',
              'rejectedAt':
                  FieldValue.serverTimestamp(),
            },
          );
        }
      }

      batch.update(
        campaign.reference,
        {
          'status': 'accepted',
          'assignedWorkerId': scalerId,
          'assignedWorkerEmail': scalerEmail,
          'acceptedAt':
              FieldValue.serverTimestamp(),
        },
      );

      final notificationRef =
          firestore.collection('notifications').doc();

      batch.set(
        notificationRef,
        {
          'userId': scalerId,
          'type': 'application_accepted',
          'title': 'Application Accepted',
          'message':
              'Your application for ${applicationData['campaignName'] ?? 'this campaign'} was accepted.',
          'campaignId': campaign.id,
          'read': false,
          'createdAt':
              FieldValue.serverTimestamp(),
        },
      );

      await batch.commit();

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Scaler accepted successfully.",
          ),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to accept applicant: $e",
          ),
        ),
      );
    }
  }

  Future<void> _rejectApplicant(
    BuildContext context,
    QueryDocumentSnapshot application,
  ) async {
    final applicationData =
        application.data() as Map<String, dynamic>;

    final scalerId =
        applicationData['scalerId']?.toString();

    final campaignName =
        applicationData['campaignName']?.toString() ??
            'this campaign';

    try {
      await application.reference.update({
        'status': 'rejected',
        'rejectedAt': FieldValue.serverTimestamp(),
      });

      if (scalerId != null && scalerId.isNotEmpty) {
        await FirebaseFirestore.instance
            .collection('notifications')
            .add({
          'userId': scalerId,
          'type': 'application_rejected',
          'title': 'Application Update',
          'message':
              'Your application for $campaignName was not selected.',
          'campaignId': campaign.id,
          'read': false,
          'createdAt':
              FieldValue.serverTimestamp(),
        });
      }

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Application rejected.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to reject applicant: $e",
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Campaign Applicants"),
        centerTitle: true,
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('applications')
            .where(
              'campaignId',
              isEqualTo: campaign.id,
            )
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

          if (snapshot.connectionState ==
              ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          final applications =
              snapshot.data?.docs ?? [];

          if (applications.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  "No Scalers have applied yet.",
                  style: TextStyle(
                    fontSize: 18,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                "${applications.length} Applicant${applications.length == 1 ? '' : 's'}",
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 20),

              ...applications.map(
                (application) {
                  final data =
                      application.data()
                          as Map<String, dynamic>;

                  final scalerEmail =
                      data['scalerEmail']
                              ?.toString() ??
                          'Unknown Scaler';

                  final status =
                      data['status']
                              ?.toString() ??
                          'pending';

                  return Card(
                    margin:
                        const EdgeInsets.only(
                      bottom: 15,
                    ),
                    child: Padding(
                      padding:
                          const EdgeInsets.all(
                        18,
                      ),
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment
                                .start,
                        children: [
                          Row(
                            children: [
                              const CircleAvatar(
                                child: Icon(
                                  Icons.person,
                                ),
                              ),

                              const SizedBox(
                                width: 12,
                              ),

                              Expanded(
                                child: Text(
                                  scalerEmail,
                                  style:
                                      const TextStyle(
                                    fontSize: 18,
                                    fontWeight:
                                        FontWeight
                                            .bold,
                                  ),
                                ),
                              ),

                              Chip(
                                label: Text(
                                  _statusLabel(
                                    status,
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(
                            height: 16,
                          ),

                          if (status ==
                              'pending')
                            Row(
                              children: [
                                Expanded(
                                  child:
                                      OutlinedButton
                                          .icon(
                                    onPressed: () {
                                      _rejectApplicant(
                                        context,
                                        application,
                                      );
                                    },
                                    icon: const Icon(
                                      Icons.close,
                                    ),
                                    label:
                                        const Text(
                                      "Reject",
                                    ),
                                  ),
                                ),

                                const SizedBox(
                                  width: 12,
                                ),

                                Expanded(
                                  child:
                                      ElevatedButton
                                          .icon(
                                    onPressed: () {
                                      _acceptApplicant(
                                        context,
                                        application,
                                      );
                                    },
                                    icon: const Icon(
                                      Icons.check,
                                    ),
                                    label:
                                        const Text(
                                      "Accept",
                                    ),
                                  ),
                                ),
                              ],
                            ),

                          if (status ==
                              'accepted')
                            const Text(
                              "This Scaler was selected for the campaign.",
                            ),

                          if (status ==
                              'rejected')
                            const Text(
                              "This application was not selected.",
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }

  static String _statusLabel(
    String status,
  ) {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }
}