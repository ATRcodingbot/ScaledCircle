import 'package:flutter/material.dart';

import '../../services/review_service.dart';

class CreateReviewScreen extends StatefulWidget {
  final String campaignId;

  final String reviewerId;

  final String reviewerType;

  final String targetId;

  final String targetType;

  const CreateReviewScreen({
    super.key,
    required this.campaignId,
    required this.reviewerId,
    required this.reviewerType,
    required this.targetId,
    required this.targetType,
  });

  @override
  State<CreateReviewScreen> createState() => _CreateReviewScreenState();
}

class _CreateReviewScreenState extends State<CreateReviewScreen> {
  final ReviewService _reviewService = ReviewService();

  final TextEditingController _commentController = TextEditingController();

  int _rating = 5;

  bool _saving = false;

  bool _alreadyReviewed = false;

  @override
  void initState() {
    super.initState();

    _checkExistingReview();
  }

  Future<void> _checkExistingReview() async {
    final exists = await _reviewService.hasReviewed(
      campaignId: widget.campaignId,
      fromUserId: widget.reviewerId,
      toUserId: widget.targetId,
    );

    if (!mounted) return;

    setState(() {
      _alreadyReviewed = exists;
    });
  }

  Future<void> _submitReview() async {
    final comment = _commentController.text.trim();

    if (comment.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("Please write a comment.")));

      return;
    }

    setState(() {
      _saving = true;
    });

    try {
      await _reviewService.createReview(
        campaignId: widget.campaignId,

        fromUserId: widget.reviewerId,

        fromUserType: widget.reviewerType,

        toUserId: widget.targetId,

        toUserType: widget.targetType,

        rating: _rating,

        comment: comment,
      );

      if (!mounted) return;

      Navigator.pop(context);

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("Review submitted.")));
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text("Unable to submit review: $e")));
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Leave Review")),

      body: Padding(
        padding: const EdgeInsets.all(20),

        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,

          children: [
            Text(
              _alreadyReviewed ? "Update Your Review" : "Rate Experience",

              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 12),

            Row(
              children: List.generate(5, (index) {
                final star = index + 1;

                return IconButton(
                  onPressed: () {
                    setState(() {
                      _rating = star;
                    });
                  },

                  icon: Icon(
                    star <= _rating ? Icons.star : Icons.star_border,

                    size: 38,
                  ),
                );
              }),
            ),

            const SizedBox(height: 20),

            TextField(
              controller: _commentController,

              maxLines: 5,

              decoration: const InputDecoration(
                labelText: "Comment",

                hintText: "Share your experience",

                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,

              child: ElevatedButton(
                onPressed: _saving ? null : _submitReview,

                child: _saving
                    ? const SizedBox(
                        height: 22,

                        width: 22,

                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        _alreadyReviewed ? "Update Review" : "Submit Review",
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _commentController.dispose();

    super.dispose();
  }
}
