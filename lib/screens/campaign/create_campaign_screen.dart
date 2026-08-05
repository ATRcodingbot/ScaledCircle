import 'package:flutter/material.dart';

class CreateCampaignScreen extends StatefulWidget {
  const CreateCampaignScreen({super.key});

  @override
  State<CreateCampaignScreen> createState() =>
      _CreateCampaignScreenState();
}

class _CreateCampaignScreenState
    extends State<CreateCampaignScreen> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _payController = TextEditingController();

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _payController.dispose();
    super.dispose();
  }

  void _createCampaign() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text("Campaign creation coming next!"),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Create Campaign"),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: ListView(
          children: [
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: "Campaign Title",
                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 20),

            TextField(
              controller: _descriptionController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: "Description",
                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 20),

            TextField(
              controller: _payController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: "Pay (\$)",
                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 30),

            SizedBox(
              height: 55,
              child: ElevatedButton(
                onPressed: _createCampaign,
                child: const Text("Create Campaign"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}