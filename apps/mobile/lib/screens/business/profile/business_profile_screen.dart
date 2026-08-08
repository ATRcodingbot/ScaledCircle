import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../services/profile_service.dart';
import '../../../widgets/reputation_card.dart';

class BusinessProfileScreen extends StatelessWidget {
  final String? businessId;

  const BusinessProfileScreen({super.key, this.businessId});

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;

    final userId = businessId ?? currentUser?.uid;

    if (userId == null) {
      return const Scaffold(body: Center(child: Text("Business not found.")));
    }

    final profileService = ProfileService();

    return Scaffold(
      appBar: AppBar(title: const Text("Business Profile")),

      body: StreamBuilder<Map<String, dynamic>?>(
        stream: profileService.watchProfile(userId),

        builder: (context, snapshot) {
          final data = snapshot.data ?? {};

          final businessName = data['businessName']?.toString() ?? "Business";

          final description =
              data['description']?.toString() ?? "No description added yet.";

          final industry = data['industry']?.toString() ?? "Industry not set";

          final city = data['city']?.toString() ?? "";

          final state = data['state']?.toString() ?? "";

          final location = city.isEmpty && state.isEmpty
              ? "Location not set"
              : "$city, $state";

          return ListView(
            padding: const EdgeInsets.all(20),

            children: [
              const CircleAvatar(
                radius: 45,

                child: Icon(Icons.business, size: 50),
              ),

              const SizedBox(height: 20),

              Center(
                child: Text(
                  businessName,

                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),

              const SizedBox(height: 8),

              Center(child: Text(industry)),

              const SizedBox(height: 25),

              ReputationCard(
                userId: userId,
                userType: "business",
                title: "Business Reputation",
              ),

              const SizedBox(height: 20),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),

                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [
                      const Text(
                        "About",

                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 10),

                      Text(description),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.location_on),

                  title: const Text("Business Location"),

                  subtitle: Text(location),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
