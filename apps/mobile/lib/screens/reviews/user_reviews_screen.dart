import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../services/review_service.dart';

class UserReviewsScreen extends StatelessWidget {
  final String userId;

  const UserReviewsScreen({super.key, required this.userId});

  @override
  Widget build(BuildContext context) {
    final reviewService = ReviewService();

    return Scaffold(
      appBar: AppBar(title: const Text("Reviews")),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: reviewService.getUserReviews(userId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(child: Text("No reviews yet."));
          }

          final reviews = snapshot.data!.docs;

          double totalRating = 0;

          int five = 0;
          int four = 0;
          int three = 0;
          int two = 0;
          int one = 0;

          for (final review in reviews) {
            final data = review.data();

            final rating = (data['rating'] ?? 0) as num;

            totalRating += rating;

            switch (rating.toInt()) {
              case 5:
                five++;
                break;
              case 4:
                four++;
                break;
              case 3:
                three++;
                break;
              case 2:
                two++;
                break;
              case 1:
                one++;
                break;
            }
          }

          final average = totalRating / reviews.length;

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              _ratingSummary(average, reviews.length),

              const SizedBox(height: 20),

              _ratingBar(5, five, reviews.length),

              _ratingBar(4, four, reviews.length),

              _ratingBar(3, three, reviews.length),

              _ratingBar(2, two, reviews.length),

              _ratingBar(1, one, reviews.length),

              const SizedBox(height: 30),

              const Text(
                "Recent Reviews",
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
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
                          children: List.generate(5, (index) {
                            return Icon(
                              index < (data['rating'] ?? 0)
                                  ? Icons.star
                                  : Icons.star_border,
                              size: 20,
                            );
                          }),
                        ),

                        const SizedBox(height: 10),

                        Text(
                          data['comment']?.toString() ?? "",
                          style: const TextStyle(fontSize: 16),
                        ),

                        const SizedBox(height: 10),

                        Text(
                          "${data['fromUserType'] ?? 'User'} review",
                          style: TextStyle(color: Colors.grey.shade600),
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

  Widget _ratingSummary(double average, int count) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Text(
              average.toStringAsFixed(1),
              style: const TextStyle(fontSize: 48, fontWeight: FontWeight.bold),
            ),

            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (index) {
                return Icon(
                  index < average.round() ? Icons.star : Icons.star_border,
                  size: 28,
                );
              }),
            ),

            const SizedBox(height: 8),

            Text("$count Reviews", style: const TextStyle(fontSize: 16)),
          ],
        ),
      ),
    );
  }

  Widget _ratingBar(int stars, int amount, int total) {
    final percent = total == 0 ? 0.0 : amount / total;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Text("$stars ⭐"),

          const SizedBox(width: 10),

          Expanded(child: LinearProgressIndicator(value: percent)),

          const SizedBox(width: 10),

          Text(amount.toString()),
        ],
      ),
    );
  }
}
