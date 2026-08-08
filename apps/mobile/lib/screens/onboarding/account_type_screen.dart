import 'package:flutter/material.dart';

import '../../models/user/user_profile.dart';
import '../../services/user/user_service.dart';

import '../business/business_dashboard.dart';
import '../jobs/jobs_marketplace_screen.dart';

class AccountTypeScreen extends StatelessWidget {
  AccountTypeScreen({super.key});

  final UserService _userService = UserService();

  Future saveAccountType(
  BuildContext context,
  UserRole role,
  String accountType,
) async {

  debugPrint('SAVE ACCOUNT TYPE STARTED: $role');

  try {
      await _userService.updateUserRole(role: role, accountType: accountType);

      if (!context.mounted) return;

      if (role == UserRole.business) {
  debugPrint('BUSINESS BUTTON CLICKED');

  Navigator.pushReplacement(
    context,
    MaterialPageRoute(
      builder: (_) => const BusinessDashboard(),
    ),
  );

  return;
}

      if (role == UserRole.scaler) {
        Navigator.pushReplacement(
          context,

          MaterialPageRoute(builder: (_) => const JobsMarketplaceScreen()),
        );
      }
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to save account type: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Choose Account Type'),

        centerTitle: true,
      ),

      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(24),

            child: Column(
              children: [
                const SizedBox(height: 20),

                const Text(
                  'How will you use Scaled Circle?',

                  textAlign: TextAlign.center,

                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
                ),

                const SizedBox(height: 12),

                const Text(
                  'Choose the account type that best matches how you plan to use the platform.',

                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: 40),

                _AccountCard(
                  icon: Icons.business,

                  title: 'Business',

                  description:
                      'Create marketing campaigns, hire Scalers, and track campaign results.',

                  onTap: () {
  debugPrint('BUSINESS CARD PRESSED');

  saveAccountType(
    context,
    UserRole.business,
    'business',
  );
},
                ),

                const SizedBox(height: 25),

                _AccountCard(
                  icon: Icons.directions_walk,

                  title: 'Scaler',

                  description:
                      'Browse available local marketing jobs, accept work, and earn money.',

                  onTap: () {
                    saveAccountType(context, UserRole.scaler, 'scaler');
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AccountCard extends StatelessWidget {
  final IconData icon;

  final String title;

  final String description;

  final VoidCallback onTap;

  const _AccountCard({
    required this.icon,

    required this.title,

    required this.description,

    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,

      child: Card(
        elevation: 5,

        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),

        child: Padding(
          padding: const EdgeInsets.all(24),

          child: Column(
            children: [
              Icon(icon, size: 60),

              const SizedBox(height: 15),

              Text(
                title,

                style: const TextStyle(
                  fontSize: 22,

                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 8),

              Text(description, textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}
