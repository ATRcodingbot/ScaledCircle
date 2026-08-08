import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../widgets/reputation_card.dart';

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

    return Scaffold(
      appBar: AppBar(title: const Text("Scaler Profile")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const CircleAvatar(radius: 45, child: Icon(Icons.person, size: 50)),

          const SizedBox(height: 20),

          const Center(
            child: Text(
              "Scaler",
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
            ),
          ),

          const SizedBox(height: 8),

          const Center(child: Text("Independent Marketing Professional")),

          const SizedBox(height: 25),

          ReputationCard(
            userId: userId,
            userType: "scaler",
            title: "Scaler Reputation",
          ),

          const SizedBox(height: 25),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),

              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,

                children: const [
                  Text(
                    "About",
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),

                  SizedBox(height: 10),

                  Text(
                    "Experienced local marketer helping businesses grow through real-world campaigns.",
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          Card(
            child: ListTile(
              leading: const Icon(Icons.location_on),

              title: const Text("Service Area"),

              subtitle: const Text("Location not set"),
            ),
          ),
        ],
      ),
    );
  }
}
