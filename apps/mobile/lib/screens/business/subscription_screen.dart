import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/platform_billing_service.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  final PlatformBillingService _billingService = PlatformBillingService();

  String? _purchasingPlan;

  Future<void> _purchasePlan(String plan) async {
    if (_purchasingPlan != null) {
      return;
    }

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('You must be logged in.')));

      return;
    }

    final price = _billingService.subscriptionPrice(plan);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Confirm Subscription'),
          content: Text(
            'Purchase the ${_planName(plan)} plan '
            'for ${price.toStringAsFixed(0)} credits?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Subscribe'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) {
      return;
    }

    setState(() {
      _purchasingPlan = plan;
    });

    try {
      await _billingService.purchaseSubscription(
        businessId: user.uid,
        plan: plan,
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${_planName(plan)} activated successfully.')),
      );

      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to purchase subscription: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _purchasingPlan = null;
        });
      }
    }
  }

  String _planName(String plan) {
    switch (plan) {
      case 'starter':
        return 'Starter';

      case 'growth':
        return 'Growth';

      case 'scale':
        return 'Scale';

      default:
        return plan;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Choose Your Plan'), centerTitle: true),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Scaled Circle Subscription',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            const Text(
              'An active monthly subscription is required '
              'to publish campaigns. 1 credit = \$1.',
            ),

            const SizedBox(height: 8),

            const Text(
              'Campaigns also include a 10% platform fee '
              'based on worker compensation.',
            ),

            const SizedBox(height: 28),

            _planCard(
              plan: 'starter',
              title: 'Starter',
              price: 99,
              subtitle: 'For small local businesses getting started.',
              features: const [
                'Up to 2 active campaigns',
                'Up to 3 Scalers per campaign',
                'Campaign zone mapping',
                'GPS verified distribution',
                'Completion verification',
                'Scaler marketplace access',
                'Business and Scaler payouts',
                'Basic campaign analytics',
                'Basic AI campaign planning',
              ],
            ),

            const SizedBox(height: 18),

            _planCard(
              plan: 'growth',
              title: 'Growth',
              price: 299,
              subtitle:
                  'For businesses using Scaled Circle as a marketing system.',
              recommended: true,
              features: const [
                'Everything in Starter',
                'Up to 10 active campaigns',
                'Up to 15 Scalers per campaign',
                'Up to 5 business locations',
                'Advanced AI campaign planning',
                'AI flyer and content creation',
                'QR and link tracking',
                'Lead tracking',
                'Call tracking',
                'Campaign landing pages',
                'Advanced analytics and ROI reporting',
                'Up to 5 team members',
                'Exportable reports',
              ],
            ),

            const SizedBox(height: 18),

            _planCard(
              plan: 'scale',
              title: 'Scale',
              price: 499,
              subtitle: 'For agencies, franchises, and high-volume operators.',
              features: const [
                'Everything in Growth',
                'Unlimited active campaigns',
                'Unlimited Scalers',
                'Unlimited business locations',
                'Unlimited team members',
                'Priority Scaler matching',
                'Advanced reporting',
                'API and integrations',
                'CRM integrations',
                'Recurring campaign automation',
                'Franchise and multi-location management',
                'Priority support',
              ],
            ),

            const SizedBox(height: 24),

            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Subscription fees go to Scaled Circle. '
                        'Worker compensation remains separate and '
                        'is reserved for Scaler payouts. '
                        'A 10% campaign platform fee is charged '
                        'when a campaign is funded.',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _planCard({
    required String plan,
    required String title,
    required double price,
    required String subtitle,
    required List<String> features,
    bool recommended = false,
  }) {
    final purchasing = _purchasingPlan == plan;

    return Card(
      elevation: recommended ? 4 : 1,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (recommended) ...[
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'MOST POPULAR',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),

              const SizedBox(height: 14),
            ],

            Text(
              title,
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 6),

            Text(subtitle),

            const SizedBox(height: 18),

            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${price.toStringAsFixed(0)} credits',
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(width: 6),

                const Padding(
                  padding: EdgeInsets.only(bottom: 4),
                  child: Text('/ month'),
                ),
              ],
            ),

            const SizedBox(height: 20),

            ...features.map((feature) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check_circle_outline, size: 20),

                    const SizedBox(width: 10),

                    Expanded(child: Text(feature)),
                  ],
                ),
              );
            }),

            const SizedBox(height: 18),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _purchasingPlan != null
                    ? null
                    : () {
                        _purchasePlan(plan);
                      },
                child: purchasing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text('Choose $title'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
