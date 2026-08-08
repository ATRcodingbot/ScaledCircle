import 'package:flutter/material.dart';

class DoorHangerCampaignScreen extends StatelessWidget {
  const DoorHangerCampaignScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Create Door Hanger Distribution")),

      body: Padding(
        padding: const EdgeInsets.all(20),

        child: ListView(
          children: [
            const Text(
              "Create Campaign",
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 20),

            const Text(
              "Configure door hanger distribution, "
              "mapped neighborhoods, materials, "
              "and Scaler compensation.",
              style: TextStyle(fontSize: 16),
            ),

            const SizedBox(height: 30),

            TextFormField(
              decoration: const InputDecoration(
                labelText: "Campaign Name",
                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 20),

            TextFormField(
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: "Instructions",
                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 30),

            ElevatedButton.icon(
              onPressed: () {},

              icon: const Icon(Icons.rocket_launch),

              label: const Text("Launch Door Hanger Campaign"),
            ),
          ],
        ),
      ),
    );
  }
}
