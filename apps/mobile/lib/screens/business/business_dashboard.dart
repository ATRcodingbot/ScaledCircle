import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';

import '../../models/campaign_card_compensation.dart';
import '../../services/subscription_plan_service.dart';
import '../../services/maryland_weather_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/scaled_circle_brand.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import 'campaign/sc_campaign_applicants_screen.dart';
import '../notifications/notifications_screen.dart';
import 'create/create_campaign_screen.dart';
import 'subscription_screen.dart';
import 'managed_growth_screen.dart';
import 'weather_alerts_screen.dart';
import '../../widgets/reputation_card.dart';
import 'profile/business_profile_screen.dart';
import 'property_intelligence_center_screen.dart';
import 'scaled_circle_services_screen.dart';
import 'internal_beta_entitlements_screen.dart';
import 'business_campaigns_screen.dart';

class BusinessDashboard extends StatefulWidget {
  const BusinessDashboard({super.key});

  @override
  State<BusinessDashboard> createState() => _BusinessDashboardState();
}

class _BusinessGoalGrid extends StatelessWidget {
  const _BusinessGoalGrid({
    required this.onFindOpportunity,
    required this.onCreateMarketing,
    required this.onLaunchCampaign,
    required this.onReviewResults,
    required this.hasResults,
  });

  final VoidCallback onFindOpportunity;
  final VoidCallback onCreateMarketing;
  final VoidCallback onLaunchCampaign;
  final VoidCallback onReviewResults;
  final bool hasResults;

  @override
  Widget build(BuildContext context) {
    final cards = [
      _GoalCard(
        key: const Key('business-goal-find-opportunity'),
        icon: Icons.travel_explore,
        title: 'FIND AN OPPORTUNITY',
        description: 'Explore Property, Weather, and local intelligence.',
        onTap: onFindOpportunity,
      ),
      _GoalCard(
        key: const Key('business-goal-create-marketing'),
        icon: Icons.auto_awesome_outlined,
        title: 'CREATE MARKETING — BETA',
        description:
            'Prepare reviewed drafts and plans in Managed Growth Beta.',
        onTap: onCreateMarketing,
      ),
      _GoalCard(
        key: const Key('business-goal-launch-campaign'),
        icon: Icons.rocket_launch_outlined,
        title: 'LAUNCH A CAMPAIGN',
        description: 'Choose the map, Scalers, materials, and tracking.',
        onTap: onLaunchCampaign,
      ),
      _GoalCard(
        key: const Key('business-goal-review-results'),
        icon: Icons.insights_outlined,
        title: 'REVIEW RESULTS',
        description: hasResults
            ? 'Review campaign response, proof, and activity.'
            : 'Results will appear after your first campaign starts.',
        onTap: hasResults ? onReviewResults : null,
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 820
            ? 4
            : constraints.maxWidth >= 520
            ? 2
            : 1;
        final width = (constraints.maxWidth - ((columns - 1) * 12)) / columns;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: cards
              .map((card) => SizedBox(width: width, child: card))
              .toList(),
        );
      },
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String description;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: onTap != null,
    enabled: onTap != null,
    label: '$title. $description',
    child: Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 170),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: AppColors.primary, size: 30),
                const SizedBox(height: 18),
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  description,
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
                const Spacer(),
                if (onTap != null)
                  const Align(
                    alignment: Alignment.centerRight,
                    child: Icon(Icons.arrow_forward, semanticLabel: 'Open'),
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _BusinessToday extends StatelessWidget {
  const _BusinessToday({
    required this.activeCampaigns,
    required this.needsReview,
  });
  final int activeCampaigns;
  final int needsReview;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'THIS WEEK',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          if (needsReview > 0)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(
                Icons.rate_review_outlined,
                color: AppColors.warning,
              ),
              title: Text(
                '$needsReview campaign${needsReview == 1 ? '' : 's'} need your review',
              ),
            ),
          if (activeCampaigns > 0)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(
                Icons.campaign_outlined,
                color: AppColors.primary,
              ),
              title: Text(
                '$activeCampaigns active campaign${activeCampaigns == 1 ? '' : 's'}',
              ),
            ),
        ],
      ),
    ),
  );
}

class _BusinessDashboardState extends State<BusinessDashboard> {
  void _openCampaigns(
    BuildContext context,
    String businessId, {
    bool results = false,
  }) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => BusinessCampaignsScreen(
          businessId: businessId,
          view: results
              ? BusinessCampaignView.results
              : BusinessCampaignView.campaigns,
          onCreateCampaign: () => _openCreateCampaign(context, businessId),
        ),
      ),
    );
  }

  final SubscriptionPlanService _planService = SubscriptionPlanService();

  final MarylandWeatherService _weatherService = MarylandWeatherService();

  Future<List<MarylandCountyWeather>>? _weather;

  WeatherEntitlement? _weatherEntitlement;

  @override
  void initState() {
    super.initState();
    _loadWeather();
  }

  Future<void> _loadWeather() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final entitlement = await _weatherService.loadEntitlement(user.uid);
    if (mounted) {
      setState(() {
        _weatherEntitlement = entitlement;
      });
    }

    if (!entitlement.entitled) {
      if (mounted) {
        final emptyWeather = Future.value(const <MarylandCountyWeather>[]);
        setState(() {
          _weather = emptyWeather;
        });
      }
      return;
    }

    final preferences = await _weatherService.loadCoveragePreferences(user.uid);
    final countyIds = preferences.configured
        ? preferences.countyIds
        : MarylandWeatherService.allCountyIds;
    final future = _weatherService.load(countyIds: countyIds);

    if (mounted) {
      setState(() {
        _weather = future;
      });
    }

    await future;
  }

  Future<void> _refreshDashboard() async {
    await _loadWeather();
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
    } catch (e) {
      if (!context.mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to open campaign creator: $e')),
      );
    }
  }

  Widget _buildWeatherSection() {
    final entitlement = _weatherEntitlement;

    if (entitlement != null && !entitlement.entitled) {
      return Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () async {
            final upgraded = await Navigator.push<bool>(
              context,
              MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
            );
            if (upgraded == true) await _loadWeather();
          },
          child: const Padding(
            padding: EdgeInsets.all(20),
            child: Row(
              children: [
                _WeatherFeatureIcon(locked: true),
                SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'AI Weather Intelligence',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(height: 6),
                      Text(
                        'Official weather facts with qualified AI opportunity '
                        'analysis are included with Scale.',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                      SizedBox(height: 10),
                      Text(
                        'UPGRADE TO SCALE',
                        style: TextStyle(
                          color: AppColors.secondary,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.7,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.arrow_forward_ios, size: 18),
              ],
            ),
          ),
        ),
      );
    }

    return FutureBuilder<List<MarylandCountyWeather>>(
      future: _weather,
      builder: (context, snapshot) {
        final counties = snapshot.data ?? const <MarylandCountyWeather>[];
        final alerts = counties
            .expand((county) => county.alerts.map((alert) => (county, alert)))
            .toList();
        final firstSignal = alerts.firstOrNull;

        return Card(
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const WeatherAlertsScreen()),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color:
                          (firstSignal == null
                                  ? AppColors.primary
                                  : AppColors.warning)
                              .withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(
                      firstSignal == null
                          ? Icons.cloud_outlined
                          : Icons.thunderstorm,
                      color: firstSignal == null
                          ? AppColors.primary
                          : AppColors.warning,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Maryland Weather Opportunities',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        if (snapshot.connectionState != ConnectionState.done)
                          const Text('Checking four Maryland counties…')
                        else if (firstSignal == null)
                          const Text(
                            'Howard, Baltimore, Anne Arundel, and Montgomery '
                            'counties are monitored. No active signal right now.',
                            style: TextStyle(color: AppColors.textSecondary),
                          )
                        else
                          Text(
                            '${firstSignal.$1.county.name}: '
                            '${firstSignal.$2.event} • experimental opportunity '
                            '+${firstSignal.$2.leadLiftLowPercent}% to '
                            '+${firstSignal.$2.leadLiftHighPercent}%',
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                            ),
                          ),
                        const SizedBox(height: 10),
                        const Text(
                          'VIEW MARYLAND WEATHER CENTER',
                          style: TextStyle(
                            color: AppColors.secondary,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.7,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios, size: 18),
                ],
              ),
            ),
          ),
        );
      },
    );
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
        title: const ScaledCircleBrand(compact: true),
        actions: [
          StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
            stream: FirebaseFirestore.instance
                .collection('users')
                .doc(user.uid)
                .snapshots(),
            builder: (context, snapshot) {
              final role = snapshot.data
                  ?.data()?['role']
                  ?.toString()
                  .toLowerCase();
              if (role != 'admin') return const SizedBox.shrink();
              return IconButton(
                tooltip: 'Beta Entitlements',
                icon: const Icon(Icons.admin_panel_settings_outlined),
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const InternalBetaEntitlementsScreen(),
                  ),
                ),
              );
            },
          ),
          TextButton.icon(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const ScaledCircleServicesScreen(),
              ),
            ),
            icon: const Icon(Icons.apps_outlined),
            label: const Text('Grow'),
          ),
          PopupMenuButton<String>(
            tooltip: 'Business navigation',
            icon: const Icon(Icons.menu),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'home', child: Text('Home')),
              PopupMenuItem(value: 'grow', child: Text('Grow')),
              PopupMenuItem(value: 'campaigns', child: Text('Campaigns')),
              PopupMenuItem(value: 'results', child: Text('Results')),
              PopupMenuItem(value: 'account', child: Text('Account')),
              PopupMenuItem(value: 'support', child: Text('Support')),
            ],
            onSelected: (value) {
              if (value == 'grow') {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ScaledCircleServicesScreen(),
                  ),
                );
              } else if (value == 'campaigns') {
                _openCampaigns(context, user.uid);
              } else if (value == 'results') {
                _openCampaigns(context, user.uid, results: true);
              } else if (value == 'account') {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const BusinessProfileScreen(),
                  ),
                );
              } else if (value == 'support') {
                AppNavigation.push(context, AppRoutes.support);
              }
            },
          ),
          const AuthenticatedSignOutButton(),
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
        onRefresh: _refreshDashboard,
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

            final campaigns = (snapshot.data?.docs ?? []).where((campaign) {
              final data = campaign.data() as Map<String, dynamic>;
              return data['archived'] != true &&
                  data['hiddenFromBusinessHistory'] != true;
            }).toList();

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

            final horizontalPadding = MediaQuery.sizeOf(context).width > 1160
                ? (MediaQuery.sizeOf(context).width - 1120) / 2
                : 20.0;

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                20,
                horizontalPadding,
                50,
              ),
              children: [
                DashboardHero(
                  eyebrow: 'BUSINESS HOME',
                  title: 'Good morning. What do you want to accomplish?',
                  description:
                      'Choose a goal. ScaledCircle will take you to the right tools without making you sort through every feature.',
                  primaryActionLabel: 'Find an Opportunity',
                  primaryActionIcon: Icons.travel_explore_outlined,
                  onPrimaryAction: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            const PropertyIntelligenceCenterScreen(),
                      ),
                    );
                  },
                  metrics: [
                    DashboardPill(
                      icon: Icons.campaign_outlined,
                      label:
                          '${activeCampaigns.length} active campaign${activeCampaigns.length == 1 ? '' : 's'}',
                      onTap: () => _openCampaigns(context, user.uid),
                    ),
                    DashboardPill(
                      icon: Icons.fact_check_outlined,
                      label: '${submittedCampaigns.length} awaiting review',
                      accent: submittedCampaigns.isEmpty
                          ? AppColors.primary
                          : AppColors.warning,
                    ),
                    const DashboardPill(
                      icon: Icons.gps_fixed,
                      label: 'GPS verification ready',
                      accent: AppColors.primary,
                    ),
                  ],
                ),
                const SizedBox(height: 22),

                _BusinessGoalGrid(
                  onFindOpportunity: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const PropertyIntelligenceCenterScreen(),
                    ),
                  ),
                  onCreateMarketing: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const ManagedGrowthScreen(),
                    ),
                  ),
                  onLaunchCampaign: () =>
                      _openCreateCampaign(context, user.uid),
                  onReviewResults: () {
                    if (submittedCampaigns.length == 1) {
                      AppNavigation.push(
                        context,
                        AppRoutes.campaignDetail(submittedCampaigns.single.id),
                      );
                      return;
                    }
                    _openCampaigns(context, user.uid, results: true);
                  },
                  hasResults: campaigns.isNotEmpty,
                ),
                const SizedBox(height: 24),

                if (activeCampaigns.isNotEmpty || submittedCampaigns.isNotEmpty)
                  _BusinessToday(
                    activeCampaigns: activeCampaigns.length,
                    needsReview: submittedCampaigns.length,
                  ),
                if (activeCampaigns.isNotEmpty || submittedCampaigns.isNotEmpty)
                  const SizedBox(height: 24),

                _buildBusinessPaymentsSection(),
                const SizedBox(height: 16),
                _buildPropertyIntelligenceCard(user.uid),
                _buildManagedGrowthCard(user.uid),
                const SizedBox(height: 16),
                _buildWeatherSection(),
                const SizedBox(height: 16),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.business),

                    title: const Text("My Business Profile"),

                    subtitle: const Text(
                      "View your company profile and reputation.",
                    ),

                    trailing: const Icon(Icons.arrow_forward_ios),

                    onTap: () {
                      Navigator.push(
                        context,

                        MaterialPageRoute(
                          builder: (_) => const BusinessProfileScreen(),
                        ),
                      );
                    },
                  ),
                ),

                const SizedBox(height: 18),

                ReputationCard(
                  userId: user.uid,
                  userType: "business",
                  title: "Business Reputation",
                ),

                const SizedBox(height: 18),

                _buildSubscriptionSection(user.uid),

                const SizedBox(height: 22),

                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.add_location_alt_outlined),
                    label: const Text('Create Another Campaign'),
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
                        child: InkWell(
                          key: const Key('active-campaign-summary'),
                          onTap: () => _openCampaigns(context, user.uid),
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
                          AppNavigation.push(
                            context,
                            AppRoutes.campaignDetail(campaign.id),
                          );
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

                  final compensation = CampaignCardCompensation.fromCampaign(
                    data,
                  );

                  final platformFee = (data['platformFee'] as num?)?.toDouble();

                  return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    stream: FirebaseFirestore.instance
                        .collection('campaigns')
                        .doc(campaign.id)
                        .collection('applications')
                        .snapshots(),
                    builder: (context, applicationSnapshot) {
                      final applications =
                          applicationSnapshot.data?.docs.length ?? 0;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 15),
                        child: ListTile(
                          leading: Icon(
                            status == 'draft'
                                ? Icons.edit_note_outlined
                                : Icons.campaign,
                            color: status == 'draft'
                                ? Colors.orange
                                : Colors.blue,
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
                                compensation.primaryText,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              if (compensation.secondaryText != null) ...[
                                const SizedBox(height: 4),
                                Text(
                                  compensation.secondaryText!,
                                  style: const TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                              if (platformFee != null) ...[
                                const SizedBox(height: 4),
                                Text(
                                  'Platform fee: '
                                  '\$${platformFee.toStringAsFixed(2)}',
                                  style: const TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 4),
                              Text(
                                'Status: ${_statusLabel(status)}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w500,
                                ),
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
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (applications > 0)
                                IconButton(
                                  icon: const Icon(Icons.people_alt_outlined),
                                  tooltip: "View Applicants",
                                  onPressed: () async {
                                    await Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) =>
                                            ScCampaignApplicantsScreen(
                                              campaignId: campaign.id,
                                            ),
                                      ),
                                    );
                                  },
                                ),

                              const Icon(Icons.arrow_forward_ios, size: 18),
                            ],
                          ),
                          onTap: () async {
                            AppNavigation.push(
                              context,
                              AppRoutes.campaignDetail(campaign.id),
                            );
                          },
                        ),
                      );
                    },
                  );
                }),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildBusinessPaymentsSection() {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(18),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.receipt_long_outlined),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Campaign Payments',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Each campaign shows its authoritative worker compensation, '
                    'platform fee, total payment, and refund status. Payments are '
                    'completed securely through Stripe when you approve funding.',
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPropertyIntelligenceCard(String userId) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('wallets')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final entitled = _planService.hasActiveScalePropertyIntelligence(
          snapshot.data?.data(),
        );
        return Card(
          child: ListTile(
            leading: Icon(
              entitled ? Icons.home_work_outlined : Icons.lock_outline,
            ),
            title: const Text('AI Property Intelligence'),
            subtitle: Text(
              entitled
                  ? 'Explore authoritative housing-stock patterns with qualified AI interpretation.'
                  : 'AI intelligence included with Scale.',
            ),
            trailing: Text(entitled ? 'Open' : 'Upgrade to Scale'),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => entitled
                    ? const PropertyIntelligenceCenterScreen()
                    : const SubscriptionScreen(),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildManagedGrowthCard(String userId) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('wallets')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final entitled = _planService.hasActiveManagedGrowth(
          snapshot.data?.data(),
        );
        return Card(
          child: ListTile(
            leading: Icon(entitled ? Icons.auto_awesome : Icons.lock_outline),
            title: const Text('Managed Growth — Beta'),
            subtitle: const Text(
              'AI growth plans, social, advertising strategy, SEO, email, postcards, and coordinated field campaigns.',
            ),
            trailing: Text(entitled ? 'Open' : 'Upgrade • \$999/mo'),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => entitled
                    ? const ManagedGrowthScreen()
                    : const SubscriptionScreen(),
              ),
            ),
          ),
        );
      },
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
                      '\$${price.toStringAsFixed(0)} / month',
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
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                ] else ...[
                  const Text(
                    'Choose a monthly plan before creating or publishing campaigns.',
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Starter: \$99 • Growth: \$299 • Scale: \$499 per month',
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

  String _subscriptionPlanLabel(String? plan) {
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
        return 'No Plan';
    }
  }

  String _subscriptionDescription(String? plan) {
    switch (plan) {
      case 'starter':
        return 'Core campaigns, zone mapping, GPS verification, '
            'Scaler access, and campaign results.';

      case 'growth':
        return 'Higher campaign limits plus the current Growth feature set. '
            'Provider-dependent tools are labeled Beta where applicable.';

      case 'scale':
        return 'High-volume campaign access plus Property and Weather '
            'Intelligence Beta.';

      case 'managed_growth':
        return 'Everything in Scale plus coordinated AI marketing planning, content packages, and direct-mail management.';

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

class _WeatherFeatureIcon extends StatelessWidget {
  final bool locked;

  const _WeatherFeatureIcon({required this.locked});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: AppColors.secondary.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Icon(
        locked ? Icons.lock_outline : Icons.thunderstorm,
        color: AppColors.secondary,
      ),
    );
  }
}
