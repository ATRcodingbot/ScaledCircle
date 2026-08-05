import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class JobDetailsScreen extends StatelessWidget {
  final DocumentSnapshot campaign;

  const JobDetailsScreen({
    super.key,
    required this.campaign,
  });

  Future<void> applyForCampaign(
    BuildContext context,
  ) async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "You must be logged in to apply for a campaign.",
          ),
        ),
      );
      return;
    }

    final firestore = FirebaseFirestore.instance;

    final applicationId =
        "${campaign.id}_${user.uid}";

    final applicationReference = firestore
        .collection('applications')
        .doc(applicationId);

    try {
      await firestore.runTransaction(
        (transaction) async {
          final campaignSnapshot =
              await transaction.get(
            campaign.reference,
          );

          final applicationSnapshot =
              await transaction.get(
            applicationReference,
          );

          if (!campaignSnapshot.exists) {
            throw Exception(
              "This campaign no longer exists.",
            );
          }

          final campaignData =
              campaignSnapshot.data()
                  as Map<String, dynamic>;

          final campaignStatus =
              campaignData['status']
                      ?.toString() ??
                  'open';

          if (campaignStatus != 'open') {
            throw Exception(
              "This campaign is no longer accepting applications.",
            );
          }

          if (applicationSnapshot.exists) {
            throw Exception(
              "You already applied for this campaign.",
            );
          }

          final campaignName =
              campaignData['campaignName']
                      ?.toString() ??
                  'Untitled Campaign';

          final businessId =
              campaignData['businessId']
                  ?.toString();

          final scalerEmail =
              user.email ?? 'Scaler';

          transaction.set(
            applicationReference,
            {
              'campaignId': campaign.id,
              'campaignName': campaignName,
              'businessId': businessId,
              'businessEmail':
                  campaignData['businessEmail'],
              'scalerId': user.uid,
              'scalerEmail': scalerEmail,
              'status': 'pending',
              'appliedAt':
                  FieldValue.serverTimestamp(),
            },
          );

          transaction.update(
            campaign.reference,
            {
              'applications':
                  FieldValue.increment(1),
            },
          );

          if (businessId != null &&
              businessId.isNotEmpty) {
            final notificationReference =
                firestore
                    .collection(
                      'notifications',
                    )
                    .doc();

            transaction.set(
              notificationReference,
              {
                'userId': businessId,
                'type':
                    'application_received',
                'title':
                    'New Scaler Application',
                'message':
                    '$scalerEmail applied to $campaignName.',
                'campaignId':
                    campaign.id,
                'campaignName':
                    campaignName,
                'scalerId':
                    user.uid,
                'scalerEmail':
                    scalerEmail,
                'read': false,
                'createdAt':
                    FieldValue
                        .serverTimestamp(),
              },
            );
          }
        },
      );

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Application submitted successfully.",
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to apply: $e",
          ),
        ),
      );
    }
  }

  Future<void> startJob(
    BuildContext context,
  ) async {
    final user =
        FirebaseAuth.instance.currentUser;

    if (user == null) return;

    try {
      final snapshot =
          await campaign.reference.get();

      if (!snapshot.exists) {
        throw Exception(
          "This campaign no longer exists.",
        );
      }

      final data =
          snapshot.data()
              as Map<String, dynamic>;

      if (data['assignedWorkerId'] !=
          user.uid) {
        throw Exception(
          "This campaign is not assigned to you.",
        );
      }

      await campaign.reference.update({
        'status': 'in_progress',
        'startedAt':
            FieldValue.serverTimestamp(),
      });

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Job started.",
          ),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to start job: $e",
          ),
        ),
      );
    }
  }

  Future<void> submitJob(
    BuildContext context,
  ) async {
    final user =
        FirebaseAuth.instance.currentUser;

    if (user == null) return;

    final firestore =
        FirebaseFirestore.instance;

    try {
      final snapshot =
          await campaign.reference.get();

      if (!snapshot.exists) {
        throw Exception(
          "This campaign no longer exists.",
        );
      }

      final data =
          snapshot.data()
              as Map<String, dynamic>;

      if (data['assignedWorkerId'] !=
          user.uid) {
        throw Exception(
          "This campaign is not assigned to you.",
        );
      }

      final businessId =
          data['businessId']?.toString();

      final campaignName =
          data['campaignName']
                  ?.toString() ??
              'Untitled Campaign';

      final scalerEmail =
          user.email ?? 'Scaler';

      final batch =
          firestore.batch();

      batch.update(
        campaign.reference,
        {
          'status': 'submitted',
          'submittedAt':
              FieldValue.serverTimestamp(),
          'reviewFeedback':
              FieldValue.delete(),
        },
      );

      if (businessId != null &&
          businessId.isNotEmpty) {
        final notificationReference =
            firestore
                .collection(
                  'notifications',
                )
                .doc();

        batch.set(
          notificationReference,
          {
            'userId': businessId,
            'type':
                'completion_submitted',
            'title':
                'Completion Submitted',
            'message':
                '$scalerEmail submitted $campaignName for review.',
            'campaignId':
                campaign.id,
            'campaignName':
                campaignName,
            'scalerId':
                user.uid,
            'scalerEmail':
                scalerEmail,
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
            "Job submitted for review.",
          ),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to submit job: $e",
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser =
        FirebaseAuth.instance.currentUser;

    return StreamBuilder<DocumentSnapshot>(
      stream:
          campaign.reference.snapshots(),
      builder: (
        context,
        snapshot,
      ) {
        if (snapshot.hasError) {
          return Scaffold(
            appBar: AppBar(
              title: const Text(
                "Job Details",
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
                "Job Details",
              ),
            ),
            body: const Center(
              child: Text(
                "This job no longer exists.",
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

        final businessEmail =
            data['businessEmail']
                    ?.toString() ??
                'Not provided';

        final homes =
            data['homes']?.toString() ??
                '0';

        final basePay =
            data['basePay']?.toString() ??
                '0';

        final bonus =
            data['bonus']?.toString() ??
                '0';

        final status =
            data['status']?.toString() ??
                'open';

        final deadline =
            data['deadline']?.toString() ??
                'Not specified';

        final reviewFeedback =
            data['reviewFeedback']
                ?.toString();

        final assignedWorkerId =
            data['assignedWorkerId']
                ?.toString();

        final isAssignedScaler =
            currentUser != null &&
            assignedWorkerId ==
                currentUser.uid;

        return Scaffold(
          appBar: AppBar(
            title: const Text(
              "Job Details",
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
                  fontSize: 28,
                  fontWeight:
                      FontWeight.bold,
                ),
              ),

              const SizedBox(height: 8),

              Text(
                businessEmail,
                style: TextStyle(
                  color:
                      Colors.grey.shade700,
                ),
              ),

              const SizedBox(height: 24),

              Card(
                child: Padding(
                  padding:
                      const EdgeInsets.all(
                    20,
                  ),
                  child: Column(
                    crossAxisAlignment:
                        CrossAxisAlignment
                            .start,
                    children: [
                      const Text(
                        "Job Description",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight:
                              FontWeight
                                  .bold,
                        ),
                      ),
                      const SizedBox(
                        height: 10,
                      ),
                      Text(description),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 15),

              Row(
                children: [
                  Expanded(
                    child: Card(
                      child: Padding(
                        padding:
                            const EdgeInsets
                                .all(18),
                        child: Column(
                          children: [
                            const Icon(
                              Icons
                                  .attach_money,
                            ),
                            const SizedBox(
                              height: 8,
                            ),
                            Text(
                              "\$$basePay",
                              style:
                                  const TextStyle(
                                fontSize: 24,
                                fontWeight:
                                    FontWeight
                                        .bold,
                              ),
                            ),
                            const Text(
                              "Base Pay",
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
                            const EdgeInsets
                                .all(18),
                        child: Column(
                          children: [
                            const Icon(
                              Icons
                                  .card_giftcard,
                            ),
                            const SizedBox(
                              height: 8,
                            ),
                            Text(
                              "\$$bonus",
                              style:
                                  const TextStyle(
                                fontSize: 24,
                                fontWeight:
                                    FontWeight
                                        .bold,
                              ),
                            ),
                            const Text(
                              "Bonus",
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 15),

              Card(
                child: ListTile(
                  leading:
                      const Icon(Icons.home),
                  title:
                      const Text("Homes"),
                  subtitle:
                      Text(homes),
                ),
              ),

              const SizedBox(height: 12),

              Card(
                child: ListTile(
                  leading: const Icon(
                    Icons.calendar_today,
                  ),
                  title: const Text(
                    "Deadline",
                  ),
                  subtitle:
                      Text(deadline),
                ),
              ),

              const SizedBox(height: 12),

              Card(
                child: ListTile(
                  leading:
                      const Icon(Icons.flag),
                  title:
                      const Text("Status"),
                  subtitle: Text(
                    _statusLabel(status),
                  ),
                ),
              ),

              if (status ==
                      'in_progress' &&
                  reviewFeedback != null &&
                  reviewFeedback
                      .isNotEmpty) ...[
                const SizedBox(height: 20),

                Card(
                  color:
                      Colors.orange.shade50,
                  child: Padding(
                    padding:
                        const EdgeInsets
                            .all(20),
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment
                              .start,
                      children: [
                        const Row(
                          children: [
                            Icon(
                              Icons
                                  .feedback_outlined,
                              color:
                                  Colors.orange,
                            ),
                            SizedBox(
                              width: 10,
                            ),
                            Text(
                              "Changes Requested",
                              style:
                                  TextStyle(
                                fontSize: 20,
                                fontWeight:
                                    FontWeight
                                        .bold,
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(
                          height: 12,
                        ),

                        const Text(
                          "The business owner asked you to make these changes:",
                          style: TextStyle(
                            fontWeight:
                                FontWeight
                                    .w600,
                          ),
                        ),

                        const SizedBox(
                          height: 10,
                        ),

                        Text(
                          reviewFeedback,
                          style:
                              const TextStyle(
                            fontSize: 16,
                          ),
                        ),

                        const SizedBox(
                          height: 12,
                        ),

                        const Text(
                          "Complete the requested changes, then submit the job again for review.",
                        ),
                      ],
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 30),

              if (status == 'open' &&
                  currentUser != null)
                _applicationSection(
                  context,
                  liveCampaign,
                  currentUser,
                ),

              if (status == 'accepted' &&
                  isAssignedScaler)
                SizedBox(
                  height: 55,
                  child:
                      ElevatedButton.icon(
                    onPressed: () =>
                        startJob(context),
                    icon: const Icon(
                      Icons.play_arrow,
                    ),
                    label: const Text(
                      "Start Job",
                    ),
                  ),
                ),

              if (status ==
                      'in_progress' &&
                  isAssignedScaler) ...[
                Card(
                  child: Padding(
                    padding:
                        const EdgeInsets
                            .all(20),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.location_on,
                          size: 42,
                        ),
                        const SizedBox(
                          height: 10,
                        ),
                        const Text(
                          "Job In Progress",
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
                          "GPS tracking and proof-of-work verification will be added here next.",
                          textAlign:
                              TextAlign
                                  .center,
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                SizedBox(
                  height: 55,
                  child:
                      ElevatedButton.icon(
                    onPressed: () =>
                        submitJob(context),
                    icon: const Icon(
                      Icons.upload_file,
                    ),
                    label: Text(
                      reviewFeedback !=
                                  null &&
                              reviewFeedback
                                  .isNotEmpty
                          ? "Resubmit Completion"
                          : "Submit Completion",
                    ),
                  ),
                ),
              ],

              if (status ==
                      'submitted' &&
                  isAssignedScaler)
                const Card(
                  child: Padding(
                    padding:
                        EdgeInsets.all(20),
                    child: Column(
                      children: [
                        Icon(
                          Icons
                              .hourglass_top,
                          size: 42,
                        ),
                        SizedBox(
                          height: 10,
                        ),
                        Text(
                          "Submitted for Review",
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
                          "The business will review the completed work before the job is marked complete.",
                          textAlign:
                              TextAlign
                                  .center,
                        ),
                      ],
                    ),
                  ),
                ),

              if (status ==
                      'completed' &&
                  isAssignedScaler)
                const Card(
                  child: Padding(
                    padding:
                        EdgeInsets.all(20),
                    child: Column(
                      children: [
                        Icon(
                          Icons.verified,
                          size: 42,
                        ),
                        SizedBox(
                          height: 10,
                        ),
                        Text(
                          "Job Completed",
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight:
                                FontWeight
                                    .bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _applicationSection(
    BuildContext context,
    DocumentSnapshot liveCampaign,
    User user,
  ) {
    final applicationId =
        "${liveCampaign.id}_${user.uid}";

    final applicationReference =
        FirebaseFirestore.instance
            .collection(
              'applications',
            )
            .doc(applicationId);

    return StreamBuilder<DocumentSnapshot>(
      stream:
          applicationReference.snapshots(),
      builder: (
        context,
        snapshot,
      ) {
        if (snapshot.connectionState ==
            ConnectionState.waiting) {
          return const SizedBox(
            height: 55,
            child: Center(
              child:
                  CircularProgressIndicator(),
            ),
          );
        }

        if (snapshot.hasError) {
          return Text(
            snapshot.error.toString(),
          );
        }

        if (!snapshot.hasData ||
            !snapshot.data!.exists) {
          return SizedBox(
            height: 55,
            child:
                ElevatedButton.icon(
              onPressed: () =>
                  applyForCampaign(context),
              icon: const Icon(
                Icons.send,
              ),
              label: const Text(
                "Apply for Campaign",
              ),
            ),
          );
        }

        final applicationData =
            snapshot.data!.data()
                as Map<String, dynamic>;

        final applicationStatus =
            applicationData['status']
                    ?.toString() ??
                'pending';

        if (applicationStatus ==
            'pending') {
          return const Card(
            child: Padding(
              padding:
                  EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(
                    Icons.hourglass_top,
                    size: 40,
                  ),
                  SizedBox(
                    height: 10,
                  ),
                  Text(
                    "Application Pending",
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
                    "The business is reviewing your application.",
                    textAlign:
                        TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        if (applicationStatus ==
            'rejected') {
          return const Card(
            child: Padding(
              padding:
                  EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(
                    Icons.cancel_outlined,
                    size: 40,
                  ),
                  SizedBox(
                    height: 10,
                  ),
                  Text(
                    "Application Not Selected",
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        if (applicationStatus ==
            'accepted') {
          return const Card(
            child: Padding(
              padding:
                  EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(
                    Icons.verified,
                    size: 40,
                  ),
                  SizedBox(
                    height: 10,
                  ),
                  Text(
                    "Application Accepted",
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return const SizedBox.shrink();
      },
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
}