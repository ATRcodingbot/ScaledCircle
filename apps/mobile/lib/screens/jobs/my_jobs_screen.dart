import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'job_details_screen.dart';

class MyJobsScreen extends StatelessWidget {
  const MyJobsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(
          child: Text("You must be logged in to view your jobs."),
        ),
      );
    }

    return Scaffold(
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('campaigns')
            .where(
              'assignedWorkerId',
              isEqualTo: user.uid,
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

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          final jobs = snapshot.data?.docs ?? [];

          final activeJobs = jobs.where((job) {
            final data = job.data() as Map<String, dynamic>;
            final status = data['status']?.toString() ?? '';

            return status == 'accepted' ||
                status == 'in_progress' ||
                status == 'submitted';
          }).toList();

          final completedJobs = jobs.where((job) {
            final data = job.data() as Map<String, dynamic>;
            return data['status'] == 'completed';
          }).toList();

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                "Active Jobs",
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 15),

              if (activeJobs.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Text(
                      "You don't have any active jobs yet.",
                    ),
                  ),
                ),

              ...activeJobs.map(
                (job) => _jobCard(
                  context,
                  job,
                ),
              ),

              const SizedBox(height: 30),

              const Text(
                "Completed Jobs",
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 15),

              if (completedJobs.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Text(
                      "No completed jobs yet.",
                    ),
                  ),
                ),

              ...completedJobs.map(
                (job) => _jobCard(
                  context,
                  job,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _jobCard(
    BuildContext context,
    QueryDocumentSnapshot job,
  ) {
    final data = job.data() as Map<String, dynamic>;

    final campaignName =
        data['campaignName']?.toString() ?? 'Untitled Campaign';

    final description =
        data['description']?.toString() ?? '';

    final homes =
        data['homes']?.toString() ?? '0';

    final basePay =
        data['basePay']?.toString() ?? '0';

    final bonus =
        data['bonus']?.toString() ?? '0';

    final status =
        data['status']?.toString() ?? '';

    final reviewFeedback =
        data['reviewFeedback']?.toString();

    final hasChangesRequested =
        status == 'in_progress' &&
        reviewFeedback != null &&
        reviewFeedback.isNotEmpty;

    return Card(
      margin: const EdgeInsets.only(bottom: 15),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => JobDetailsScreen(
                campaign: job,
              ),
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      campaignName,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),

                  const SizedBox(width: 10),

                  _statusChip(
                    status,
                    hasChangesRequested,
                  ),
                ],
              ),

              const SizedBox(height: 8),

              Text(
                description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),

              if (hasChangesRequested) ...[
                const SizedBox(height: 12),

                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: Colors.orange.shade200,
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.feedback_outlined,
                        color: Colors.orange,
                        size: 20,
                      ),

                      const SizedBox(width: 8),

                      Expanded(
                        child: Text(
                          reviewFeedback,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 15),

              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Chip(
                    avatar: const Icon(
                      Icons.home,
                      size: 18,
                    ),
                    label: Text(
                      "$homes Homes",
                    ),
                  ),
                  Chip(
                    avatar: const Icon(
                      Icons.attach_money,
                      size: 18,
                    ),
                    label: Text(
                      "\$$basePay",
                    ),
                  ),
                  Chip(
                    avatar: const Icon(
                      Icons.card_giftcard,
                      size: 18,
                    ),
                    label: Text(
                      "Bonus \$$bonus",
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
                          campaign: job,
                        ),
                      ),
                    );
                  },
                  icon: Icon(
                    hasChangesRequested
                        ? Icons.feedback_outlined
                        : Icons.arrow_forward,
                  ),
                  label: Text(
                    _actionLabel(
                      status,
                      hasChangesRequested,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusChip(
    String status,
    bool hasChangesRequested,
  ) {
    return Chip(
      avatar: Icon(
        hasChangesRequested
            ? Icons.warning_amber_rounded
            : _statusIcon(status),
        size: 18,
      ),
      label: Text(
        hasChangesRequested
            ? "Changes Requested"
            : _statusLabel(status),
      ),
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'accepted':
        return 'Accepted';
      case 'in_progress':
        return 'In Progress';
      case 'submitted':
        return 'Submitted';
      case 'completed':
        return 'Completed';
      default:
        return status;
    }
  }

  String _actionLabel(
    String status,
    bool hasChangesRequested,
  ) {
    if (hasChangesRequested) {
      return 'Changes Requested';
    }

    switch (status) {
      case 'accepted':
        return 'Start Job';
      case 'in_progress':
        return 'Continue Job';
      case 'submitted':
        return 'View Submission';
      case 'completed':
        return 'View Completed Job';
      default:
        return 'View Job';
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'accepted':
        return Icons.assignment_turned_in;
      case 'in_progress':
        return Icons.play_circle_outline;
      case 'submitted':
        return Icons.hourglass_top;
      case 'completed':
        return Icons.verified;
      default:
        return Icons.work_outline;
    }
  }
}