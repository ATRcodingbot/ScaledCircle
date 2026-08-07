import 'package:flutter/material.dart';

import '../../services/review_service.dart';

class UserReviewsScreen extends StatelessWidget {
  final String userId;
  final String userType;

  const UserReviewsScreen({
    super.key,
    required this.userId,
    required this.userType,
  });

  @override
  Widget build(BuildContext context) {
    final ReviewService reviewService = ReviewService();

    return Scaffold(
      appBar: AppBar(title: const Text("Reputation")),

      body: StreamBuilder(
        stream: reviewService.getUserReviews(userId),

        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,

                children: [
                  const Icon(Icons.star_border, size: 60),

                  const SizedBox(height: 15),

                  Text(
                    "No reviews yet.",
                    style: TextStyle(fontSize: 18, color: Colors.grey.shade700),
                  ),
                ],
              ),
            );
          }

          final reviews = snapshot.data!.docs;

          double totalRating = 0;

          Map<int, int> ratingCount = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};

          for (final review in reviews) {
            final data = review.data();

            final rating = (data['rating'] ?? 0) as int;

            totalRating += rating;

            ratingCount[rating] = (ratingCount[rating] ?? 0) + 1;
          }

          final average = totalRating / reviews.length;

          return ListView(
            padding: const EdgeInsets.all(20),

            children: [
              _buildSummary(average, reviews.length),

              const SizedBox(height: 25),

              const Text(
                "Rating Breakdown",

                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 10),

              ...ratingCount.entries.toList().reversed.map(
                (entry) => _ratingRow(entry.key, entry.value, reviews.length),
              ),

              const SizedBox(height: 30),

              const Text(
                "Recent Feedback",

                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 15),

              ...reviews.map((review) {
                final data = review.data();

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),

                  child: Padding(
                    padding: const EdgeInsets.all(16),

                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,

                      children: [
                        Row(
                          children: [
                            Text(
                              "${data['rating']} ⭐",
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),

                            const Spacer(),

                            Text(
                              data['fromUserType']?.toString().toUpperCase() ??
                                  "",
                            ),
                          ],
                        ),

                        const SizedBox(height: 10),

                        Text(
                          data['comment']?.toString() ?? "",

                          style: const TextStyle(fontSize: 16),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSummary(double rating, int total) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),

        child: Column(
          children: [
            Text(
              rating.toStringAsFixed(1),

              style: const TextStyle(fontSize: 48, fontWeight: FontWeight.bold),
            ),

            const Text("⭐ Average Rating"),

            const SizedBox(height: 10),

            Text("$total Reviews", style: const TextStyle(fontSize: 18)),
          ],
        ),
      ),
    );
  }

  Widget _ratingRow(int stars, int count, int total) {
    final percent = total == 0 ? 0.0 : count / total;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),

      child: Row(
        children: [
          Text("$stars ⭐"),

          const SizedBox(width: 10),

          Expanded(child: LinearProgressIndicator(value: percent)),

          const SizedBox(width: 10),

          Text(count.toString()),
        ],
      ),
    );
  }
}
