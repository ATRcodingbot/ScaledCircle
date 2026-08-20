import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../models/user/user_profile.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/account_mode_switch_button.dart';
import '../../../widgets/reputation_card.dart';
import '../../../widgets/scaled_circle_brand.dart';
import '../../jobs/jobs_marketplace_screen.dart';
import '../../jobs/scaler_wallet_screen.dart';
import '../../notifications/notifications_screen.dart';
import '../../preferences/areas_preferences_screen.dart';
import '../../../services/discovery_preferences_service.dart';
import '../campaigns/scaler_applied_campaigns_screen.dart';
import '../campaigns/scaler_campaign_marketplace_screen.dart';
import '../profile/scaler_profile_screen.dart';
import '../affiliate/scaler_affiliate_screen.dart';

class ScalerDashboardScreen extends StatelessWidget {
  const ScalerDashboardScreen({super.key});

  Widget _workPreferencesEntry(BuildContext context, String userId) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('discoveryPreferences')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final complete =
            snapshot.data?.data()?['initialSetupCompletedAt'] != null;
        void openPreferences() {
          final service = DiscoveryPreferencesService();
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => AreasPreferencesScreen(
                role: 'scaler',
                onboarding: !complete,
                loadPreferences: service.load,
                savePreferences: service.save,
                completePreferences: service.completeScalerSetup,
                onCompleted: (_) => Navigator.of(context).pop(),
                onSkip: () => Navigator.of(context).pop(),
              ),
            ),
          );
        }

        if (complete) {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.tune, color: AppColors.primary),
              title: const Text('Edit Work Preferences'),
              subtitle: const Text(
                'Update your Work Areas, interests, travel, vehicle, and alerts.',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: openPreferences,
            ),
          );
        }
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'FINISH SETTING UP YOUR WORK PREFERENCES',
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Tell us where you want to work and which opportunities interest you.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: openPreferences,
                  icon: const Icon(Icons.tune),
                  label: const Text('COMPLETE SETUP'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _earningsSnapshot(BuildContext context, String userId) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('wallets')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() ?? <String, dynamic>{};
        final available = (data['availableBalance'] as num?)?.toDouble() ?? 0.0;
        final pending = (data['pendingBalance'] as num?)?.toDouble() ?? 0.0;
        final total = available + pending;

        return Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.account_balance_wallet_outlined,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Your earnings',
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          'Approved work and pending payments',
                          style: TextStyle(color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const ScalerWalletScreen(),
                        ),
                      );
                    },
                    child: const Text('View wallet'),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              if (snapshot.connectionState == ConnectionState.waiting)
                const LinearProgressIndicator()
              else if (snapshot.hasError)
                const Text('Wallet totals are temporarily unavailable.')
              else
                LayoutBuilder(
                  builder: (context, constraints) {
                    final compact = constraints.maxWidth < 520;
                    final metrics = [
                      _earningMetric('Available', available, emphasize: true),
                      _earningMetric('Pending', pending),
                      _earningMetric('Total earned', total),
                    ];

                    return compact
                        ? Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: metrics
                                .map(
                                  (metric) => SizedBox(
                                    width: (constraints.maxWidth - 12) / 2,
                                    child: metric,
                                  ),
                                )
                                .toList(),
                          )
                        : Row(
                            children: metrics
                                .map((metric) => Expanded(child: metric))
                                .toList(),
                          );
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _earningMetric(String label, double amount, {bool emphasize = false}) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: emphasize
            ? AppColors.primary.withValues(alpha: 0.10)
            : AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: emphasize ? AppColors.primary : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '\$${amount.toStringAsFixed(2)}',
            style: TextStyle(
              color: emphasize ? AppColors.primary : AppColors.textPrimary,
              fontSize: emphasize ? 25 : 21,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(color: AppColors.textSecondary)),
        ],
      ),
    );
  }

  Widget _navigationCard({
    required BuildContext context,
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    Color accent = AppColors.blue,
  }) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: accent),
              ),
              const SizedBox(width: 15),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.arrow_forward_rounded,
                color: AppColors.textMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(body: Center(child: Text('Please log in.')));
    }

    return Scaffold(
      appBar: AppBar(
        title: const ScaledCircleBrand(compact: true),
        actions: [
          StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
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
                          color: AppColors.error,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Center(
                          child: Text(
                            unreadCount > 99 ? '99+' : unreadCount.toString(),
                            style: const TextStyle(
                              color: AppColors.background,
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
          const AccountModeSwitchButton(targetView: UserRole.business),
          const SizedBox(width: 8),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final horizontalPadding = constraints.maxWidth > 1160
              ? (constraints.maxWidth - 1120) / 2
              : 20.0;

          return ListView(
            padding: EdgeInsets.fromLTRB(
              horizontalPadding,
              20,
              horizontalPadding,
              50,
            ),
            children: [
              DashboardHero(
                eyebrow: 'Scaler workspace',
                title: 'Local work. Verified progress. Clear earnings.',
                description:
                    'Find nearby campaigns, complete mapped routes, and keep '
                    'every approved payment in view.',
                primaryActionLabel: 'Browse Available Work',
                primaryActionIcon: Icons.explore_outlined,
                onPrimaryAction: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ScalerCampaignMarketplaceScreen(),
                    ),
                  );
                },
                metrics: const [
                  DashboardPill(
                    icon: Icons.gps_fixed,
                    label: 'GPS-verified work',
                    accent: AppColors.primary,
                  ),
                  DashboardPill(
                    icon: Icons.payments_outlined,
                    label: 'Transparent earnings',
                  ),
                  DashboardPill(
                    icon: Icons.verified_user_outlined,
                    label: 'History that travels with you',
                    accent: AppColors.primary,
                  ),
                ],
              ),
              const SizedBox(height: 24),
              _workPreferencesEntry(context, user.uid),
              const SizedBox(height: 24),
              _earningsSnapshot(context, user.uid),
              const SizedBox(height: 24),
              ReputationCard(
                userId: user.uid,
                userType: 'scaler',
                title: 'Scaler Reputation',
              ),
              const SizedBox(height: 24),
              Text(
                'Your workspace',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, sectionConstraints) {
                  final useGrid = sectionConstraints.maxWidth >= 760;
                  final items = [
                    _navigationCard(
                      context: context,
                      icon: Icons.play_circle_outline,
                      title: 'Current Campaigns',
                      subtitle: 'Open assigned and running campaign work.',
                      accent: AppColors.primary,
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                const JobsMarketplaceScreen(initialIndex: 1),
                          ),
                        );
                      },
                    ),
                    _navigationCard(
                      context: context,
                      icon: Icons.map_outlined,
                      title: 'Campaign Marketplace',
                      subtitle: 'Find available campaigns near you.',
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ScalerCampaignMarketplaceScreen(),
                          ),
                        );
                      },
                    ),
                    _navigationCard(
                      context: context,
                      icon: Icons.assignment_outlined,
                      title: 'Applied Campaigns',
                      subtitle: 'Track pending campaign applications.',
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ScalerAppliedCampaignsScreen(),
                          ),
                        );
                      },
                    ),
                    _navigationCard(
                      context: context,
                      icon: Icons.account_balance_wallet_outlined,
                      title: 'Wallet',
                      subtitle: 'View approved earnings and payouts.',
                      accent: AppColors.primary,
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ScalerWalletScreen(),
                          ),
                        );
                      },
                    ),
                    _navigationCard(
                      context: context,
                      icon: Icons.handshake_outlined,
                      title: 'Earn with Referrals',
                      subtitle:
                          'Introduce local businesses and track referral status.',
                      accent: AppColors.blue,
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ScalerAffiliateScreen(),
                          ),
                        );
                      },
                    ),
                    _navigationCard(
                      context: context,
                      icon: Icons.person_outline,
                      title: 'My Profile',
                      subtitle: 'Manage your profile and reputation.',
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ScalerProfileScreen(),
                          ),
                        );
                      },
                    ),
                  ];

                  if (!useGrid) {
                    return Column(
                      children: [
                        for (var index = 0; index < items.length; index++) ...[
                          items[index],
                          if (index < items.length - 1)
                            const SizedBox(height: 12),
                        ],
                      ],
                    );
                  }

                  return Wrap(
                    spacing: 14,
                    runSpacing: 14,
                    children: items
                        .map(
                          (item) => SizedBox(
                            width: (sectionConstraints.maxWidth - 14) / 2,
                            child: item,
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}
