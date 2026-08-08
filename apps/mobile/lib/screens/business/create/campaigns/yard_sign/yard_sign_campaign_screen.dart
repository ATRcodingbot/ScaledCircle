import 'package:flutter/material.dart';

class YardSignCampaignScreen extends StatelessWidget {
  const YardSignCampaignScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Yard Sign Installation"),
        centerTitle: true,
      ),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const Text(
            "Yard Sign Requirements",
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 20),

          _requirement(
            Icons.location_on,
            "GPS Verification",
            "Scaler must verify exact placement location.",
          ),

          _requirement(
            Icons.photo_camera,
            "Before Photo",
            "Photo of location before installation.",
          ),

          _requirement(
            Icons.photo,
            "After Photo",
            "Photo proving sign installation.",
          ),
        ],
      ),
    );
  }

  Widget _requirement(IconData icon, String title, String description) {
    return Card(
      child: ListTile(
        leading: Icon(icon, size: 35),

        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),

        subtitle: Text(description),
      ),
    );
  }
}
