import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import 'create_review_screen.dart';

class CampaignScalerReviewsScreen extends StatelessWidget {
  final String campaignId;
  final String businessId;

  const CampaignScalerReviewsScreen({
    super.key,
    required this.campaignId,
    required this.businessId,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review Scalers')),

      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance
            .collection('campaigns')
            .doc(campaignId)
            .collection('assignedScalers')
            .snapshots(),

        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(child: Text('No Scalers assigned.'));
          }

          final scalers = snapshot.data!.docs;

          return ListView.builder(
            padding: const EdgeInsets.all(16),

            itemCount: scalers.length,

            itemBuilder: (context, index) {
              final data = scalers[index].data();

              final scalerId = data['scalerId']?.toString() ?? '';

              return Card(
                child: ListTile(
                  leading: const Icon(Icons.person),

                  title: Text('Scaler: $scalerId'),

                  subtitle: const Text('Completed campaign work'),

                  trailing: ElevatedButton(
                    child: const Text('Review'),

                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => CreateReviewScreen(
                            campaignId: campaignId,

                            reviewerId: businessId,

                            reviewerType: 'business',

                            targetId: scalerId,

                            targetType: 'scaler',
                          ),
                        ),
                      );
                    },
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
