import 'package:flutter/material.dart';

import '../../../services/affiliate_service.dart';

/// Launch fallback until attribution and commission accounting are certified.
/// Existing server records remain unchanged; this surface makes no service calls.
class ScalerAffiliateScreen extends StatelessWidget {
  const ScalerAffiliateScreen({super.key, this.service});

  final AffiliateGateway? service;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Referral Program')),
    body: const SingleChildScrollView(
      padding: EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.handshake_outlined, size: 44),
          SizedBox(height: 16),
          Text(
            'Referral Program — Coming Soon',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 12),
          Text(
            'We are preparing referrals for local businesses and Scalers. '
            'Enrollment and referral rewards are not available yet.',
          ),
          SizedBox(height: 12),
          Text(
            'Existing referral records are preserved. We will explain the '
            'qualifying activity and reward terms when the program is ready.',
          ),
        ],
      ),
    ),
  );
}
