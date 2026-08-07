import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../widgets/reputation_card.dart';
import '../campaigns/scaler_campaign_marketplace_screen.dart';
import '../../jobs/scaler_wallet_screen.dart';

class ScalerDashboardScreen extends StatelessWidget {
  const ScalerDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Scaffold(body: Center(child: Text("Please login.")));
    }

    return Scaffold(
      appBar: AppBar(title: const Text("Scaler Dashboard")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          Text(
            "Welcome Scaler",
            style: Theme.of(context).textTheme.headlineMedium,
          ),

          const SizedBox(height: 20),

          ReputationCard(
            userId: user.uid,
            userType: "scaler",
            title: "Scaler Reputation",
          ),

          const SizedBox(height: 20),

          Card(
            child: ListTile(
              leading: const Icon(Icons.map),

              title: const Text("Campaign Marketplace"),

              subtitle: const Text("Find available campaigns."),

              trailing: const Icon(Icons.arrow_forward_ios),

              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ScalerCampaignMarketplaceScreen(),
                  ),
                );
              },
            ),
          ),

          Card(
            child: ListTile(
              leading: const Icon(Icons.account_balance_wallet),

              title: const Text("Wallet"),

              subtitle: const Text("View earnings and payouts."),

              trailing: const Icon(Icons.arrow_forward_ios),

              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ScalerWalletScreen()),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
