import 'package:cloud_firestore/cloud_firestore.dart';
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
  bool _loadingReview = true;
  Map<String, dynamic>? _existingReview;

  @override
  void initState() {
    super.initState();
    _loadExistingReview();
  }

  Future<void> _loadExistingReview() async {
    try {
      final review = await _reviewService.getReview(
        campaignId: widget.campaignId,
        fromUserId: widget.reviewerId,
        toUserId: widget.targetId,
      );

      if (!mounted) return;

      setState(() {
        _existingReview = review;
        _loadingReview = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _loadingReview = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to check this review: $error')),
      );
    }
  }

  Future<void> _submitReview() async {
    final comment = _commentController.text.trim();

    if (comment.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please write a comment.')),
      );
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

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Review submitted and permanently locked.')),
      );
      Navigator.pop(context);
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to submit review: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  bool get _reportWindowOpen {
    final createdAt = _existingReview?['createdAt'];

    if (createdAt is! Timestamp) {
      return false;
    }

    return DateTime.now().isBefore(
      createdAt.toDate().add(const Duration(hours: 72)),
    );
  }

  Future<void> _showReportDialog() async {
    final reviewId = _existingReview?['id']?.toString();

    if (reviewId == null || reviewId.isEmpty) return;

    final detailsController = TextEditingController();
    String reason = 'suspected_fraud';
    bool submitting = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Report Fraud or Scam'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'This sends a private report for review. It does not edit '
                      'or remove the permanent public review.',
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: reason,
                      decoration: const InputDecoration(
                        labelText: 'Reason',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'suspected_fraud',
                          child: Text('Suspected fraud'),
                        ),
                        DropdownMenuItem(
                          value: 'suspected_scam',
                          child: Text('Suspected scam'),
                        ),
                        DropdownMenuItem(
                          value: 'safety_concern',
                          child: Text('Safety concern'),
                        ),
                        DropdownMenuItem(
                          value: 'other',
                          child: Text('Other serious issue'),
                        ),
                      ],
                      onChanged: submitting
                          ? null
                          : (value) {
                              if (value != null) {
                                setDialogState(() {
                                  reason = value;
                                });
                              }
                            },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: detailsController,
                      enabled: !submitting,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'What happened?',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: submitting
                      ? null
                      : () => Navigator.pop(dialogContext),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: submitting
                      ? null
                      : () async {
                          final details = detailsController.text.trim();

                          if (details.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Please describe the issue.'),
                              ),
                            );
                            return;
                          }

                          setDialogState(() {
                            submitting = true;
                          });

                          try {
                            final alreadyReported =
                                await _reviewService.reportReview(
                              reviewId: reviewId,
                              reason: reason,
                              details: details,
                            );

                            if (!dialogContext.mounted) return;
                            Navigator.pop(dialogContext);

                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  alreadyReported
                                      ? 'You already reported this review.'
                                      : 'Report submitted for review.',
                                ),
                              ),
                            );
                          } catch (error) {
                            if (!dialogContext.mounted) return;
                            setDialogState(() {
                              submitting = false;
                            });
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Unable to submit report: $error'),
                              ),
                            );
                          }
                        },
                  child: submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Submit Report'),
                ),
              ],
            );
          },
        );
      },
    );

    detailsController.dispose();
  }

  Widget _lockedReview() {
    final rating = (_existingReview?['rating'] as num?)?.toInt() ?? 0;
    final comment = _existingReview?['comment']?.toString() ?? '';

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Row(
          children: [
            Icon(Icons.lock_outline),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Submitted Review',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: List.generate(
            5,
            (index) => Icon(
              index < rating ? Icons.star : Icons.star_border,
              size: 36,
              color: Colors.amber.shade700,
            ),
          ),
        ),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Text(comment, style: const TextStyle(fontSize: 16)),
          ),
        ),
        const SizedBox(height: 12),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.verified_outlined),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'This verified review is permanent because the campaign '
                    'payment was completed.',
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (_reportWindowOpen)
          OutlinedButton.icon(
            onPressed: _showReportDialog,
            icon: const Icon(Icons.report_gmailerrorred_outlined),
            label: const Text('Report Fraud or Scam'),
          )
        else
          Text(
            'The 72-hour fraud and scam reporting window is closed.',
            style: TextStyle(color: Colors.grey.shade700),
            textAlign: TextAlign.center,
          ),
      ],
    );
  }

  Widget _newReview() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'Rate Experience',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Text(
          'Reviews can be submitted once after payment and cannot be edited.',
          style: TextStyle(color: Colors.grey.shade700),
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
                color: Colors.amber.shade700,
              ),
            );
          }),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _commentController,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Comment',
            hintText: 'Share your experience',
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
                : const Text('Submit Permanent Review'),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review')),
      body: _loadingReview
          ? const Center(child: CircularProgressIndicator())
          : _existingReview != null
              ? _lockedReview()
              : _newReview(),
    );
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }
}
