import 'package:flutter/material.dart';

class DumpRunCampaignScreen extends StatelessWidget {
  const DumpRunCampaignScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Dump Run")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const Text(
            "Dump Run Requirements",
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
          ),

          _card(
            Icons.photo_camera,
            "Before Photos",
            "Document items before pickup.",
          ),

          _card(
            Icons.local_shipping,
            "Pickup Verification",
            "GPS verified pickup location.",
          ),

          _card(
            Icons.receipt_long,
            "Disposal Proof",
            "Upload disposal receipt or completion proof.",
          ),
        ],
      ),
    );
  }

  Widget _card(IconData icon, String title, String description) {
    return Card(
      child: ListTile(
        leading: Icon(icon),

        title: Text(title),

        subtitle: Text(description),
      ),
    );
  }
}
