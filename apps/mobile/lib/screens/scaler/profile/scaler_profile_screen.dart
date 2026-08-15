import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../services/profile_service.dart';
import '../../../widgets/reputation_card.dart';
import '../../preferences/areas_preferences_screen.dart';

class ScalerProfileScreen extends StatelessWidget {
  final String? scalerId;

  const ScalerProfileScreen({super.key, this.scalerId});

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;

    final userId = scalerId ?? currentUser?.uid;

    if (userId == null) {
      return const Scaffold(body: Center(child: Text("User not found.")));
    }

    final profileService = ProfileService();

    return Scaffold(
      appBar: AppBar(title: const Text("Scaler Profile")),

      body: StreamBuilder<Map<String, dynamic>?>(
        stream: profileService.watchProfile(userId),

        builder: (context, snapshot) {
          final data = snapshot.data ?? {};

          final firstName = data['firstName']?.toString() ?? "";

          final lastName = data['lastName']?.toString() ?? "";

          final name = "$firstName $lastName".trim();

          final bio = data['bio']?.toString() ?? "No bio added yet.";

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

                child: Icon(Icons.person, size: 50),
              ),

              const SizedBox(height: 20),

              Center(
                child: Text(
                  name.isEmpty ? "Scaler" : name,

                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),

              const SizedBox(height: 8),

              Center(child: Text("Independent Marketing Professional")),

              const SizedBox(height: 25),

              ReputationCard(
                userId: userId,
                userType: "scaler",
                title: "Scaler Reputation",
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

                      Text(bio),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              Card(
                child: ListTile(
                  leading: const Icon(Icons.location_on),

                  title: const Text("Service Area"),

                  subtitle: Text(location),
                  trailing: scalerId == null
                      ? const Icon(Icons.chevron_right)
                      : null,
                  onTap: scalerId == null
                      ? () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                const AreasPreferencesScreen(role: 'scaler'),
                          ),
                        )
                      : null,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
