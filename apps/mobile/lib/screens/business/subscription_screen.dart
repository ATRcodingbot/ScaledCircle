import 'business_membership_screen.dart';
import '../../services/business_workspace_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/platform_billing_service.dart';
import '../../widgets/billing_selection_editor.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  final PlatformBillingService _billingService = PlatformBillingService();

  String? _purchasingPlan;
  bool _creatingPromotion = false;
  String? _starterPromotionCode;
  Map<String, dynamic> _selection = {'plan': 'starter'};

  Future<void> _purchaseSelection(bool active) async {
    if (active) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => const BusinessMembershipScreen(),
        ),
      );
      return;
    }
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || _purchasingPlan != null) return;
    setState(() => _purchasingPlan = 'selection');
    try {
      final businessId = BusinessWorkspaceSession.businessIdFor(user.uid);
      final quote = await BusinessWorkspaceService().call(
        'previewBusinessMembershipChange',
        {
          'businessId': businessId,
          'newMembership': true,
          'selection': _selection,
        },
      );
      if (!mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('Review your membership'),
          content: Text(
            '\$${((quote['monthlyCents'] as num) / 100).toStringAsFixed(2)} per month · ${quote['seatLimit']} total users, including the owner.\n\nThe selected Beta products provide research, recommendations and drafts. External actions need separate approval. Checkout shows any applicable tax before payment. You can cancel renewal in Billing / Plan.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: const Text('Go Back'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Continue to Secure Checkout'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      await _billingService.purchaseSubscription(
        businessId: businessId,
        plan: _selection['plan']?.toString() ?? 'managed_growth',
        selection: _selection,
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Membership pricing could not be verified. Retry before making a payment.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _purchasingPlan = null);
    }
  }

  Future<void> _createStarterPromotion(String businessId) async {
    if (_creatingPromotion) return;
    setState(() => _creatingPromotion = true);
    try {
      final code = await _billingService.createStarterFreeMonthPromotion(
        businessId: businessId,
      );
      if (!mounted) return;
      setState(() => _starterPromotionCode = code);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('$code is ready to share.')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to create promotion: $error')),
      );
    } finally {
      if (mounted) setState(() => _creatingPromotion = false);
    }
  }

  Future<void> _purchasePlan(String plan, double charge, bool upgrading) async {
    if (upgrading) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => const BusinessMembershipScreen(),
        ),
      );
      return;
    }
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

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(upgrading ? 'Confirm Upgrade' : 'Confirm Subscription'),
          content: Text(
            upgrading
                ? 'Open the secure billing portal to manage or upgrade your subscription?'
                : 'Subscribe to the ${_planName(plan)} plan for '
                      '\$${charge.toStringAsFixed(0)} per month through secure Checkout?',
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
              child: Text(upgrading ? 'Upgrade' : 'Subscribe'),
            ),
          ],
        );
      },
    );

    if (!mounted || confirmed != true) {
      return;
    }

    setState(() {
      _purchasingPlan = plan;
    });

    try {
      final activatedImmediately = await _billingService.purchaseSubscription(
        businessId: BusinessWorkspaceSession.businessIdFor(user.uid),
        plan: plan,
        manageExisting: upgrading,
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            activatedImmediately
                ? 'Your complimentary Scale plan is active.'
                : 'Secure billing opened. Your plan updates after payment is confirmed.',
          ),
        ),
      );

      if (activatedImmediately) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to update subscription: $e')),
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

      case 'managed_growth':
        return 'Managed Growth';

      default:
        return plan;
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(title: const Text('Choose Your Plan'), centerTitle: true),
      body: SafeArea(
        child: user == null
            ? const Center(child: Text('You must be logged in.'))
            : StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection('wallets')
                    .doc(BusinessWorkspaceSession.businessIdFor(user.uid))
                    .snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting &&
                      !snapshot.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  final walletData = snapshot.data?.data() ?? {};

                  final subscriptionStatus = walletData['subscriptionStatus']
                      ?.toString()
                      .toLowerCase();

                  final currentPlan = walletData['subscriptionPlan']
                      ?.toString()
                      .toLowerCase();

                  final expiresAt = walletData['subscriptionExpiresAt'];
                  final adminComped =
                      walletData['subscriptionComped'] == true &&
                      walletData['subscriptionSource'] == 'admin_comp';

                  final subscriptionActive =
                      subscriptionStatus == 'active' &&
                      expiresAt is Timestamp &&
                      expiresAt.toDate().isAfter(DateTime.now());

                  return ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      const Text(
                        'Scaled Circle Subscription',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 8),

                      const Text(
                        'An active monthly subscription is required '
                        'to publish campaigns. Subscriptions renew '
                        'automatically through secure billing.',
                      ),

                      const SizedBox(height: 8),

                      const Text(
                        'Campaigns also include a 20% marketplace fee '
                        'based on worker compensation.',
                      ),

                      if (subscriptionActive && currentPlan != null) ...[
                        const SizedBox(height: 18),

                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                const Icon(Icons.workspace_premium),

                                const SizedBox(width: 12),

                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Current Plan',
                                        style: TextStyle(fontSize: 13),
                                      ),

                                      const SizedBox(height: 3),

                                      Text(
                                        _planName(currentPlan),
                                        style: const TextStyle(
                                          fontSize: 19,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),

                                      const SizedBox(height: 4),

                                      Text(
                                        'Active until ${_formatDate(expiresAt)}',
                                      ),
                                    ],
                                  ),
                                ),

                                const Chip(
                                  avatar: Icon(
                                    Icons.check_circle_outline,
                                    size: 18,
                                  ),
                                  label: Text('Active'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],

                      const SizedBox(height: 28),

                      if (adminComped) ...[
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Starter Test Promotion',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'Creates a first-time-business code for one '
                                  'free month of the \$99 Starter plan. Stripe '
                                  'still collects a card for automatic monthly '
                                  'renewal. Scaler pay and campaign funding are '
                                  'never discounted.',
                                ),
                                if (_starterPromotionCode != null) ...[
                                  const SizedBox(height: 12),
                                  SelectableText(
                                    _starterPromotionCode!,
                                    style: const TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 1.2,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 12),
                                FilledButton.icon(
                                  onPressed: _creatingPromotion
                                      ? null
                                      : () => _createStarterPromotion(user.uid),
                                  icon: _creatingPromotion
                                      ? const SizedBox.square(
                                          dimension: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.local_offer_outlined),
                                  label: Text(
                                    _starterPromotionCode == null
                                        ? 'Create Promo Code'
                                        : 'Confirm Promo Code',
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 28),
                      ],

                      _planCard(
                        plan: 'starter',
                        title: 'Starter',
                        price: 99,
                        subtitle: 'For small local businesses getting started.',
                        currentPlan: currentPlan,
                        subscriptionActive: subscriptionActive,
                        features: const [
                          'Up to 2 active campaigns',
                          'Up to 3 Scalers per campaign',
                          'Campaign zone mapping',
                          'GPS verified distribution',
                          'Completion verification',
                          'Scaler marketplace access',
                          'Scaler earnings tracking (cash-out coming soon)',
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
                            'For businesses using Scaled Circle '
                            'as a marketing system.',
                        recommended: true,
                        currentPlan: currentPlan,
                        subscriptionActive: subscriptionActive,
                        features: const [
                          'Everything in Starter',
                          'Up to 10 active campaigns',
                          'Up to 15 Scalers per campaign',
                          'Up to 5 business locations',
                          'Advanced AI campaign planning',
                          'AI flyer and content creation',
                          'QR and link tracking',
                          'Lead tracking — Coming Soon',
                          'Call tracking — Coming Soon',
                          'Campaign landing pages — Coming Soon',
                          'Advanced analytics and ROI reporting',
                          '3 total workspace users, including the owner',
                          'Exportable reports',
                        ],
                      ),

                      const SizedBox(height: 18),

                      _planCard(
                        plan: 'scale',
                        title: 'Scale',
                        price: 499,
                        subtitle:
                            'For agencies, franchises, and '
                            'high-volume operators.',
                        currentPlan: currentPlan,
                        subscriptionActive: subscriptionActive,
                        features: const [
                          'Everything in Growth',
                          'Unlimited active campaigns',
                          'Unlimited Scalers',
                          'Unlimited business locations',
                          '5 total workspace users, including the owner',
                          'Priority Scaler matching',
                          'Advanced reporting',
                          'API and integrations',
                          'CRM integrations',
                          'Recurring campaign automation',
                          'AI Property Intelligence',
                          'AI Weather Intelligence and Maryland alerts',
                          'Combined Property + Weather opportunity analysis',
                          'Franchise and multi-location management',
                          'Priority support',
                        ],
                      ),

                      const SizedBox(height: 18),

                      _planCard(
                        plan: 'managed_growth',
                        title: 'Managed Growth — Beta',
                        price: 999,
                        subtitle:
                            'For 3–5 initial Businesses building one coordinated digital + physical growth system.',
                        currentPlan: currentPlan,
                        subscriptionActive: subscriptionActive,
                        availableForPurchase: true,
                        features: const [
                          'Everything in Scale',
                          'AI Business Growth Analysis',
                          '30-Day Marketing Plan',
                          'Social Content Plan',
                          'Paid Advertising Creative & Strategy',
                          'SEO Action Plan',
                          '30-Day Email Campaign',
                          'Postcards / Direct Mail — Coming Soon',
                          'Unified campaign measurement',
                          'Advertising needs separate approval. Printing and postcards are Coming Soon',
                          'Limited beta — no unlimited agency revisions',
                        ],
                      ),

                      const SizedBox(height: 24),
                      BillingSelectionEditor(
                        enabled: _purchasingPlan == null,
                        onChanged: (value) => _selection = value,
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _purchasingPlan != null
                            ? null
                            : () => _purchaseSelection(subscriptionActive),
                        child: Text(
                          subscriptionActive
                              ? 'Manage Plan & Add-ons'
                              : 'Review Membership Total',
                        ),
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
                                  'Use the secure billing portal to '
                                  'change or cancel an active plan. Checkout '
                                  'shows any proration and the next renewal '
                                  'amount before a plan change is confirmed.',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(height: 12),

                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.payments_outlined),

                              SizedBox(width: 12),

                              Expanded(
                                child: Text(
                                  'Subscription fees go to Scaled Circle. '
                                  'Worker compensation remains separate '
                                  'and is reserved for Scaler payouts. '
                                  'A 20% campaign marketplace fee is charged '
                                  'when a campaign is funded.',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  );
                },
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
    required String? currentPlan,
    required bool subscriptionActive,
    bool recommended = false,
    bool availableForPurchase = true,
  }) {
    final purchasing = _purchasingPlan == plan;

    final isCurrentPlan = subscriptionActive && currentPlan == plan;

    bool isUpgrade = false;
    bool isDowngrade = false;

    double charge = price;

    if (subscriptionActive && currentPlan != null) {
      final currentRank = _billingService.subscriptionRank(currentPlan);

      final targetRank = _billingService.subscriptionRank(plan);

      if (targetRank > currentRank) {
        isUpgrade = true;

        charge = _billingService.calculateUpgradePrice(
          currentPlan: currentPlan,
          targetPlan: plan,
        );
      } else if (targetRank < currentRank) {
        isDowngrade = true;
      } else {
        charge = 0.0;
      }
    }

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

            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),

                if (isCurrentPlan)
                  const Chip(
                    avatar: Icon(Icons.check_circle_outline, size: 18),
                    label: Text('CURRENT'),
                  ),
              ],
            ),

            const SizedBox(height: 6),

            Text(subtitle),

            const SizedBox(height: 18),

            if (isUpgrade) ...[
              Text(
                'Manage Membership',
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                '$title normally costs '
                '\$${price.toStringAsFixed(0)} / month',
                style: TextStyle(color: Colors.grey.shade700),
              ),

              const SizedBox(height: 4),

              Text(
                'Manage plan changes and automatic renewal securely.',
                style: TextStyle(
                  color: Colors.green.shade800,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ] else ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '\$${price.toStringAsFixed(0)}',
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
            ],

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
                onPressed:
                    !availableForPurchase ||
                        _purchasingPlan != null ||
                        isCurrentPlan ||
                        isDowngrade
                    ? null
                    : () {
                        _purchasePlan(plan, charge, isUpgrade);
                      },
                child: purchasing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        isCurrentPlan
                            ? 'Current Plan'
                            : !availableForPurchase
                            ? 'Limited Beta — Contact ScaledCircle'
                            : isDowngrade
                            ? 'Lower Plan'
                            : isUpgrade
                            ? 'Manage Upgrade'
                            : 'Choose $title',
                      ),
              ),
            ),

            if (isDowngrade) ...[
              const SizedBox(height: 8),

              const Center(
                child: Text(
                  'Plan downgrades will be available '
                  'at the next renewal.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatDate(Timestamp timestamp) {
    final date = timestamp.toDate();

    return '${date.month}/${date.day}/${date.year}';
  }
}
