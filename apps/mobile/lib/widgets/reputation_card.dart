import 'package:flutter/material.dart';

import '../screens/reviews/user_reviews_screen.dart';
import '../services/reputation_service.dart';
import '../theme/app_theme.dart';

class ReputationCard extends StatelessWidget {
  final String userId;
  final String userType;
  final String title;

  final ReputationService _reputationService = ReputationService();

  ReputationCard({
    super.key,
    required this.userId,
    required this.userType,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Map<String, dynamic>>(
      stream: _reputationService.watchUserReputation(userId),
      builder: (context, snapshot) {
        final data = snapshot.data ?? {};
        final rating = (data['rating'] ?? 0).toDouble();
        final reviewCount = (data['reviewCount'] ?? 0).toInt();
        final completedCount = (data['completedCount'] ?? 0).toInt();

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.verified_user_outlined,
                      size: 32,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Text(
                      rating.toStringAsFixed(1),
                      style: const TextStyle(
                        fontSize: 38,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(
                      Icons.star_rounded,
                      size: 34,
                      color: Color(0xFFFFD54F),
                    ),
                  ],
                ),
                Text(
                  '$reviewCount reviews',
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 10),
                Text(
                  '$completedCount completed campaigns',
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.rate_review_outlined),
                    label: const Text('View Reviews'),
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => UserReviewsScreen(
                            userId: userId,
                            userType: userType,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
