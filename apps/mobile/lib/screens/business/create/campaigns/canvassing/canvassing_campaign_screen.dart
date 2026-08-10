import 'package:flutter/material.dart';

class CanvassingCampaignScreen extends StatelessWidget {
  const CanvassingCampaignScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Neighborhood Canvassing")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const Text(
            "Canvassing Requirements",
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
          ),

          _item(
            Icons.map,
            "GPS Route Tracking",
            "Verify neighborhoods completed.",
          ),

          _item(Icons.people, "Lead Collection", "Capture customer interest."),

          _item(
            Icons.route,
            "Field Verification",
            "Saved GPS route coverage; no photos required.",
          ),
        ],
      ),
    );
  }

  Widget _item(IconData icon, String title, String description) {
    return Card(
      child: ListTile(
        leading: Icon(icon),

        title: Text(title),

        subtitle: Text(description),
      ),
    );
  }
}
