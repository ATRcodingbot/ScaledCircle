import 'package:flutter/material.dart';

/// The approved launch policy. Publishing this page does not enable payouts.
class ReferralProgramScreen extends StatelessWidget {
  const ReferralProgramScreen({super.key});
  static const policyVersion = 'referral-launch-v2-2026-09-10';
  static const scalerProtection = "This does not come out of the Scaler's pay.";
  static const platformFunding =
      'ScaledCircle pays referral rewards separately from its own platform economics. '
      'The referred Scaler keeps the full compensation they earned under their job terms.';

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Referrals')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: const [
            Text(
              'Refer a Business',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            Text(
              'Earn 10% of qualifying retained recurring ScaledCircle subscription revenue.',
            ),
            SizedBox(height: 24),
            Text(
              'Refer a Scaler',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            Text('Earn 1% from qualifying completed work.'),
            Text("Your reward does not come out of the Scaler's pay."),
            Text(scalerProtection),
            Text(platformFunding),
            SizedBox(height: 24),
            Text(
              'How rewards work',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            Text(
              'Only direct referrals qualify. No downstream or downline commissions.',
            ),
            Text(
              r'Signup alone earns $0. Submitted, canceled, reversed or otherwise non-qualifying work does not earn a reward.',
            ),
            Text(
              'For Scaler referrals, the amount is based on final approved compensation, including earned bonuses. Platform fees, taxes and returned reserves are excluded.',
            ),
            Text(
              r'Example: a Scaler earns $100 under their job terms. Your separate referral reward is $1, funded by ScaledCircle. The Scaler still earns $100. The Business receives no extra referral charge.',
            ),
            SizedBox(height: 16),
            Text(
              'When can I receive payment?',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            Text(
              r'Business rewards have a 30-calendar-day hold after a qualifying paid invoice. Scaler rewards have a 7-calendar-day hold after qualifying approved compensation is settled. Rewards become available only after eligibility and payment checks pass. Cash out manually when your available referral balance reaches $10. No income or payment date is guaranteed.',
            ),
            Text(
              'Rewards remain subject to eligibility, valid attribution and authoritative economic reconciliation. Refunds, reversals and disputes may prevent or reverse a reward. Worker pay is never reduced to fund it.',
            ),
            Text(
              'A later refund can reduce your referral balance. If the reward was already paid, an adjustment offsets future referral earnings; we do not silently debit your bank account. Stripe processing fees do not reduce the qualifying Business referral basis. Taxes and unrelated purchases are excluded.',
            ),
            SizedBox(height: 16),
            Text('Program terms: September 10, 2026 · Referral Launch V2'),
          ],
        ),
      ),
    ),
  );
}
