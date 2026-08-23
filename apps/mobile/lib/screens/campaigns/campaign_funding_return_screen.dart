import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';
import 'campaign_details_screen.dart';

class CampaignFundingReturnScreen extends StatefulWidget {
  const CampaignFundingReturnScreen({super.key, required this.campaignId});

  final String campaignId;

  @override
  State<CampaignFundingReturnScreen> createState() =>
      _CampaignFundingReturnScreenState();
}

class _CampaignFundingReturnScreenState
    extends State<CampaignFundingReturnScreen> {
  Timer? _boundedWait;
  bool _takingLonger = false;

  @override
  void initState() {
    super.initState();
    _boundedWait = Timer(const Duration(seconds: 45), () {
      if (mounted) setState(() => _takingLonger = true);
    });
  }

  @override
  void dispose() {
    _boundedWait?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      initialData: FirebaseAuth.instance.currentUser,
      builder: (context, authSnapshot) =>
          _buildForUser(context, authSnapshot.data),
    );
  }

  Widget _buildForUser(BuildContext context, User? user) {
    if (user == null || widget.campaignId.isEmpty) {
      return _message(
        context,
        title: 'Confirming payment',
        message: 'Sign in to view the authoritative campaign payment status.',
        action: () => Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.businessDashboard,
          (_) => false,
        ),
      );
    }
    final campaign = FirebaseFirestore.instance
        .collection('campaigns')
        .doc(widget.campaignId);
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: campaign.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _message(
            context,
            title: 'Unable to refresh payment status',
            message: 'Your payment authority has not been changed. Try again.',
            action: () => setState(() {}),
          );
        }
        final document = snapshot.data;
        final data = document?.data();
        if (data != null && data['businessId'] != user.uid) {
          return _message(
            context,
            title: 'Campaign unavailable',
            message: 'This campaign is not available to this Business account.',
          );
        }
        final fundingStatus = data?['fundingStatus']?.toString() ?? '';
        if (document != null && document.exists && fundingStatus == 'funded') {
          _boundedWait?.cancel();
          return _message(
            context,
            icon: Icons.check_circle,
            title: 'Payment confirmed',
            message: 'Campaign funded. Continue to the campaign review to publish.',
            actionLabel: 'View Campaign',
            action: () => Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder: (_) => CampaignDetailsScreen(campaign: document),
              ),
            ),
          );
        }
        if (['payment_failed', 'checkout_expired'].contains(fundingStatus)) {
          return _message(
            context,
            title: fundingStatus == 'checkout_expired'
                ? 'Checkout expired'
                : 'Payment failed',
            message: 'No campaign funding was established. Return to the campaign to review the next step.',
            action: () => Navigator.pushNamedAndRemoveUntil(
              context,
              AppRoutes.businessDashboard,
              (_) => false,
            ),
          );
        }
        return _message(
          context,
          loading: true,
          title: 'Confirming payment...',
          message: _takingLonger
              ? 'Confirmation is taking longer than expected. ScaledCircle is still waiting for signed payment authority; your browser return does not mark the campaign funded.'
              : 'Waiting for the signed payment confirmation. You can safely keep this page open.',
          actionLabel: _takingLonger ? 'Return to Business Dashboard' : null,
          action: _takingLonger
              ? () => Navigator.pushNamedAndRemoveUntil(
                    context,
                    AppRoutes.businessDashboard,
                    (_) => false,
                  )
              : null,
        );
      },
    );
  }

  Widget _message(
    BuildContext context, {
    required String title,
    required String message,
    IconData icon = Icons.lock_clock,
    bool loading = false,
    String? actionLabel,
    VoidCallback? action,
  }) {
    return Scaffold(
      appBar: AppBar(title: const Text('Campaign Funding')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (loading)
                    const CircularProgressIndicator()
                  else
                    Icon(icon, size: 48),
                  const SizedBox(height: 18),
                  Text(title, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 10),
                  Text(message, textAlign: TextAlign.center),
                  if (action != null) ...[
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: action,
                      child: Text(actionLabel ?? 'Continue'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
