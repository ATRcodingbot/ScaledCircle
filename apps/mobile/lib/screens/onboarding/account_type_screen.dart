import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../business/business_dashboard.dart';
import '../jobs/jobs_marketplace_screen.dart';

class AccountTypeScreen extends StatelessWidget {
  const AccountTypeScreen({super.key});

  Future<void> saveAccountType(
    BuildContext context,
    String accountType,
  ) async {
    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        if (!context.mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("No logged in user."),
          ),
        );
        return;
      }

      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .set(
        {
          'uid': user.uid,
          'email': user.email,
          'accountType': accountType,
          'createdAt': FieldValue.serverTimestamp(),
          'completedJobs': 0,
          'rating': 5.0,
          'verified': false,
        },
        SetOptions(merge: true),
      );

      if (!context.mounted) return;

      if (accountType == "business") {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => const BusinessDashboard(),
          ),
        );
      } else if (accountType == "marketer") {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => const JobsMarketplaceScreen(),
          ),
        );
      }
    } catch (e) {
      debugPrint(e.toString());

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            "Unable to save account type: $e",
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Choose Account Type"),
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
                  "How will you use Scaled Circle?",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 12),

                const Text(
                  "Choose the account type that best matches how you plan to use the platform.",
                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: 40),

                GestureDetector(
                  onTap: () {
                    saveAccountType(
                      context,
                      "business",
                    );
                  },
                  child: Card(
                    elevation: 5,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(24),
                      child: Column(
                        children: [
                          Icon(
                            Icons.business,
                            size: 60,
                          ),
                          SizedBox(height: 15),
                          Text(
                            "Business",
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            "Create marketing campaigns, hire Scalers, and track campaign results.",
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 25),

                GestureDetector(
                  onTap: () {
                    saveAccountType(
                      context,
                      "marketer",
                    );
                  },
                  child: Card(
                    elevation: 5,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(24),
                      child: Column(
                        children: [
                          Icon(
                            Icons.directions_walk,
                            size: 60,
                          ),
                          SizedBox(height: 15),
                          Text(
                            "Scaler",
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            "Browse available local marketing jobs, accept work, and earn money.",
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}