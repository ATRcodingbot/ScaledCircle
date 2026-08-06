import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/subscription_plan_service.dart';
import '../../services/wallet_service.dart';
import '../campaigns/campaign_details_screen.dart';
import '../notifications/notifications_screen.dart';
import 'create_campaign_screen.dart';
import 'subscription_screen.dart';

class BusinessDashboard extends StatefulWidget {
  const BusinessDashboard({super.key});

  @override
  State<BusinessDashboard> createState() => _BusinessDashboardState();
}

class _BusinessDashboardState extends State<BusinessDashboard> {
  final WalletService _walletService = WalletService();

  final SubscriptionPlanService _planService = SubscriptionPlanService();

  bool _walletLoading = true;

  String? _walletError;

  double _availableCredits = 0.0;

  double _reservedCredits = 0.0;

  @override
  void initState() {
    super.initState();

    _initializeWallet();
  }

  Future<void> _initializeWallet() async {
    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception('You must be logged in.');
      }

      await _walletService.createWallet(
        userId: user.uid,
        ownerType: 'business',
      );

      /*
       * DEVELOPMENT ONLY
       *
       * Grants this development business account
       * 10,000 promotional credits one time.
       *
       * Remove this automatic promotional grant
       * before production.
       */
      await _walletService.grantPromotionalCredits(
        businessId: user.uid,
        amount: 10000.0,
        promoKey: 'development-business-10000-v1',
        description:
            'Development promotional credits for Scaled Circle testing.',
      );

      await _loadWallet();
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _walletError = 'Unable to initialize wallet: $e';

        _walletLoading = false;
      });
    }
  }

  Future<void> _loadWallet() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    try {
      final availableCredits = await _walletService.getAvailableCredits(
        user.uid,
      );

      final reservedCredits = await _walletService.getReservedCredits(user.uid);

      if (!mounted) {
        return;
      }

      setState(() {
        _availableCredits = availableCredits;

        _reservedCredits = reservedCredits;

        _walletError = null;

        _walletLoading = false;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _walletError = 'Unable to load wallet: $e';

        _walletLoading = false;
      });
    }
  }

  Future<void> _openCreateCampaign(BuildContext context, String userId) async {
    try {
      final walletSnapshot = await FirebaseFirestore.instance
          .collection('wallets')
          .doc(userId)
          .get();

      if (!context.mounted) {
        return;
      }

      final walletData = walletSnapshot.data();

      final subscriptionStatus = walletData?['subscriptionStatus']
          ?.toString()
          .toLowerCase();

      final planId = walletData?['subscriptionPlan']?.toString().toLowerCase();

      final expiresAt = walletData?['subscriptionExpiresAt'];

      final subscriptionActive =
          walletSnapshot.exists &&
          subscriptionStatus == 'active' &&
          planId != null &&
          planId.isNotEmpty &&
          (expiresAt == null ||
              (expiresAt is Timestamp &&
                  expiresAt.toDate().isAfter(DateTime.now())));

      if (!subscriptionActive) {
        final subscribed = await Navigator.push<bool>(
          context,
          MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
        );

        if (!context.mounted) {
          return;
        }

        await _loadWallet();

        if (!context.mounted) {
          return;
        }

        if (subscribed != true) {
          return;
        }

        await _openCreateCampaign(context, userId);

        return;
      }

      final campaignsSnapshot = await FirebaseFirestore.instance
          .collection('campaigns')
          .where('businessId', isEqualTo: userId)
          .get();

      if (!context.mounted) {
        return;
      }

      int activeCampaignCount = 0;

      for (final campaign in campaignsSnapshot.docs) {
        final data = campaign.data();

        final status = data['status']?.toString().toLowerCase() ?? '';

        if (status != 'draft' &&
            status != 'completed' &&
            status != 'cancelled' &&
            status != 'canceled') {
          activeCampaignCount++;
        }
      }

      final canCreateCampaign = _planService.canCreateCampaign(
        plan: planId,
        currentActiveCampaigns: activeCampaignCount,
      );

      if (!canCreateCampaign) {
        final campaignLimit = _planService.getMaxActiveCampaigns(planId);

        if (!context.mounted) {
          return;
        }

        await showDialog<void>(
          context: context,
          builder: (dialogContext) {
            return AlertDialog(
              title: const Text('Campaign Limit Reached'),
              content: Text(
                campaignLimit == null
                    ? 'Your current plan does not allow another campaign.'
                    : 'Your ${_planService.getPlanName(planId)} plan allows '
                          '$campaignLimit active '
                          'campaign${campaignLimit == 1 ? '' : 's'}. '
                          'Complete an existing campaign or upgrade your plan '
                          'before creating another one.',
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                  },
                  child: const Text('OK'),
                ),
              ],
            );
          },
        );

        return;
      }

      if (!context.mounted) {
        return;
      }

      await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const CreateCampaignScreen()),
      );

      if (!context.mounted) {
        return;
      }

      await _loadWallet();
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to open campaign creator: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('You must be logged in.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scaled Circle'),
        centerTitle: true,
        actions: [
          StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
                .collection('notifications')
                .where('userId', isEqualTo: user.uid)
                .where('read', isEqualTo: false)
                .snapshots(),
            builder: (context, snapshot) {
              final unreadCount = snapshot.data?.docs.length ?? 0;

              return Stack(
                clipBehavior: Clip.none,
                children: [
                  IconButton(
                    tooltip: 'Notifications',
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const NotificationsScreen(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.notifications_outlined),
                  ),
                  if (unreadCount > 0)
                    Positioned(
                      right: 5,
                      top: 5,
                      child: Container(
                        constraints: const BoxConstraints(
                          minWidth: 18,
                          minHeight: 18,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Center(
                          child: Text(
                            unreadCount > 99 ? '99+' : unreadCount.toString(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadWallet,
        child: StreamBuilder<QuerySnapshot>(
          stream: FirebaseFirestore.instance
              .collection('campaigns')
              .where('businessId', isEqualTo: user.uid)
              .orderBy('createdAt', descending: true)
              .snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: [Center(child: Text(snapshot.error.toString()))],
              );
            }

            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            final campaigns = snapshot.data?.docs ?? [];

            final activeCampaigns = campaigns.where((campaign) {
              final data = campaign.data() as Map<String, dynamic>;

              final status = data['status']?.toString().toLowerCase() ?? '';

              return status != 'completed' &&
                  status != 'draft' &&
                  status != 'cancelled' &&
                  status != 'canceled';
            }).toList();

            /*
             * Campaign-level submitted status is
             * supported for backwards compatibility.
             *
             * Zone-level review still appears inside
             * CampaignDetailsScreen.
             */
            final submittedCampaigns = campaigns.where((campaign) {
              final data = campaign.data() as Map<String, dynamic>;

              final status = data['status']?.toString().toLowerCase() ?? '';

              return status == 'submitted';
            }).toList();

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(20),
              children: [
                const Text(
                  'Welcome Back!',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 20),

                _buildWalletSection(),

                const SizedBox(height: 18),

                _buildSubscriptionSection(user.uid),

                const SizedBox(height: 22),

                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text('Create Campaign'),
                    onPressed: () async {
                      await _openCreateCampaign(context, user.uid);
                    },
                  ),
                ),

                const SizedBox(height: 30),

                Row(
                  children: [
                    Expanded(
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              Text(
                                activeCampaigns.length.toString(),
                                style: const TextStyle(
                                  fontSize: 34,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Active Campaigns',
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              Text(
                                submittedCampaigns.length.toString(),
                                style: const TextStyle(
                                  fontSize: 34,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Needs Review',
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                if (submittedCampaigns.isNotEmpty) ...[
                  const SizedBox(height: 25),
                  const Text(
                    'Needs Review',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 15),
                  ...submittedCampaigns.map((campaign) {
                    final data = campaign.data() as Map<String, dynamic>;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        leading: const Icon(Icons.fact_check_outlined),
                        title: Text(
                          data['campaignName']?.toString() ??
                              'Untitled Campaign',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: const Text(
                          'Scaler submitted work for review',
                        ),
                        trailing: const Icon(Icons.arrow_forward_ios, size: 18),
                        onTap: () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  CampaignDetailsScreen(campaign: campaign),
                            ),
                          );

                          await _loadWallet();
                        },
                      ),
                    );
                  }),
                ],

                const SizedBox(height: 25),

                const Text(
                  'My Campaigns',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 15),

                if (campaigns.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Text('No campaigns yet.'),
                    ),
                  ),

                ...campaigns.map((campaign) {
                  final data = campaign.data() as Map<String, dynamic>;

                  final status = data['status']?.toString().toLowerCase() ?? '';

                  final applications =
                      (data['applications'] as num?)?.toInt() ?? 0;

                  final estimatedHomes =
                      (data['estimatedHomes'] as num?)?.toInt() ??
                      (data['homes'] as num?)?.toInt() ??
                      0;

                  final basePay = (data['basePay'] as num?)?.toDouble() ?? 0.0;

                  final bonus = (data['bonus'] as num?)?.toDouble() ?? 0.0;

                  final platformFee = (data['platformFee'] as num?)?.toDouble();

                  return Card(
                    margin: const EdgeInsets.only(bottom: 15),
                    child: ListTile(
                      leading: Icon(
                        status == 'draft'
                            ? Icons.edit_note_outlined
                            : Icons.campaign,
                        color: status == 'draft' ? Colors.orange : Colors.blue,
                      ),
                      title: Text(
                        data['campaignName']?.toString() ?? '',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 5),
                          Text(
                            data['description']?.toString() ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 5),
                          Text(
                            '$estimatedHomes homes • '
                            '\$${basePay.toStringAsFixed(2)} base pay'
                            '${bonus > 0 ? ' • \$${bonus.toStringAsFixed(2)} bonus' : ''}',
                            style: const TextStyle(fontWeight: FontWeight.w500),
                          ),
                          if (platformFee != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              'Platform fee: '
                              '\$${platformFee.toStringAsFixed(2)}',
                              style: TextStyle(
                                color: Colors.grey.shade700,
                                fontSize: 12,
                              ),
                            ),
                          ],
                          const SizedBox(height: 4),
                          Text(
                            'Status: ${_statusLabel(status)}',
                            style: const TextStyle(fontWeight: FontWeight.w500),
                          ),
                          if (status == 'open' && applications > 0) ...[
                            const SizedBox(height: 5),
                            Text(
                              '$applications Scaler${applications == 1 ? '' : 's'} applied',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ],
                      ),
                      trailing: const Icon(Icons.arrow_forward_ios, size: 18),
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                CampaignDetailsScreen(campaign: campaign),
                          ),
                        );

                        await _loadWallet();
                      },
                    ),
                  );
                }),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildWalletSection() {
    if (_walletLoading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (_walletError != null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            children: [
              const Icon(Icons.error_outline, size: 38),
              const SizedBox(height: 10),
              Text(_walletError!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _initializeWallet,
                child: const Text('Retry Wallet'),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Campaign Funding',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _walletCard(
                icon: Icons.account_balance_wallet_outlined,
                title: 'Available',
                amount: _availableCredits,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _walletCard(
                icon: Icons.lock_outline,
                title: 'Reserved',
                amount: _reservedCredits,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.science_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Development wallet: promotional credits are being used for testing. '
                    '1 credit represents \$1 in the production billing model.',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSubscriptionSection(String userId) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('wallets')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        final data = snapshot.data?.data();

        final status =
            data?['subscriptionStatus']?.toString().toLowerCase() ?? 'inactive';

        final plan = data?['subscriptionPlan']?.toString().toLowerCase();

        final expiresAt = data?['subscriptionExpiresAt'];

        final isActive =
            status == 'active' &&
            expiresAt is Timestamp &&
            expiresAt.toDate().isAfter(DateTime.now());

        final planLabel = _subscriptionPlanLabel(plan);

        final price = (data?['subscriptionPrice'] as num?)?.toDouble();

        String expirationLabel = '';

        if (expiresAt is Timestamp) {
          final date = expiresAt.toDate();

          expirationLabel = '${date.month}/${date.day}/${date.year}';
        }

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      isActive ? Icons.workspace_premium : Icons.lock_outline,
                      size: 30,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Subscription',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            isActive
                                ? '$planLabel Plan'
                                : 'Subscription Required',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (isActive)
                      const Chip(
                        avatar: Icon(Icons.check_circle_outline, size: 18),
                        label: Text('Active'),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                if (isActive) ...[
                  if (price != null)
                    Text(
                      '${price.toStringAsFixed(0)} credits / month',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  if (price != null) const SizedBox(height: 4),
                  Text(
                    expirationLabel.isEmpty
                        ? 'Subscription active'
                        : 'Active until $expirationLabel',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _subscriptionDescription(plan),
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                ] else ...[
                  const Text(
                    'Choose a monthly plan before creating or publishing campaigns.',
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Starter: 99 credits • Growth: 299 credits • Scale: 499 credits',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      await Navigator.push<bool>(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const SubscriptionScreen(),
                        ),
                      );

                      if (!mounted) {
                        return;
                      }

                      await _loadWallet();
                    },
                    icon: const Icon(Icons.credit_card),
                    label: Text(
                      isActive ? 'Manage Subscription' : 'View Plans',
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _walletCard({
    required IconData icon,
    required String title,
    required double amount,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Icon(icon, size: 30),
            const SizedBox(height: 8),
            Text(
              '\$${amount.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(title, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  String _subscriptionPlanLabel(String? plan) {
    switch (plan) {
      case 'starter':
        return 'Starter';

      case 'growth':
        return 'Growth';

      case 'scale':
        return 'Scale';

      default:
        return 'No Plan';
    }
  }

  String _subscriptionDescription(String? plan) {
    switch (plan) {
      case 'starter':
        return 'Core campaigns, zone mapping, GPS verification, '
            'Scaler access, payouts, and basic analytics.';

      case 'growth':
        return 'Higher campaign limits plus lead tracking, landing pages, '
            'AI marketing tools, and advanced analytics.';

      case 'scale':
        return 'High-volume access with unlimited operations, teams, '
            'priority matching, integrations, and advanced reporting.';

      default:
        return 'Choose a Scaled Circle subscription plan.';
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'draft':
        return 'Draft';

      case 'open':
        return 'Open';

      case 'accepted':
        return 'Accepted';

      case 'assigned':
        return 'Assigned';

      case 'in_progress':
        return 'In Progress';

      case 'submitted':
        return 'Needs Review';

      case 'completed':
        return 'Completed';

      case 'cancelled':
      case 'canceled':
        return 'Cancelled';

      default:
        return status.isEmpty ? 'Unknown' : status;
    }
  }
}
