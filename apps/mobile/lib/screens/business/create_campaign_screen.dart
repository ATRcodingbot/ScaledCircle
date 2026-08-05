import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class CreateCampaignScreen extends StatefulWidget {
  const CreateCampaignScreen({super.key});

  @override
  State<CreateCampaignScreen> createState() => _CreateCampaignScreenState();
}

class _CreateCampaignScreenState extends State<CreateCampaignScreen> {
  final _formKey = GlobalKey<FormState>();

  final campaignNameController = TextEditingController();
  final descriptionController = TextEditingController();
  final payController = TextEditingController();
  final homesController = TextEditingController();
  final bonusController = TextEditingController();

  @override
  void dispose() {
    campaignNameController.dispose();
    descriptionController.dispose();
    payController.dispose();
    homesController.dispose();
    bonusController.dispose();
    super.dispose();
  }

  Future<void> publishCampaign() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) return;

      await FirebaseFirestore.instance.collection('campaigns').add({
        'businessId': user.uid,
        'businessEmail': user.email,
        'campaignName': campaignNameController.text.trim(),
        'description': descriptionController.text.trim(),
        'basePay': double.tryParse(payController.text) ?? 0,
        'homes': int.tryParse(homesController.text) ?? 0,
        'bonus': double.tryParse(bonusController.text) ?? 0,
        'status': 'open',
        'applications': 0,
        'createdAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Campaign published successfully!"),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString()),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Create Campaign"),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              const Text(
                "New Marketing Campaign",
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 30),

              TextFormField(
                controller: campaignNameController,
                validator: (value) =>
                    value == null || value.isEmpty ? "Required" : null,
                decoration: const InputDecoration(
                  labelText: "Campaign Name",
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: descriptionController,
                maxLines: 4,
                validator: (value) =>
                    value == null || value.isEmpty ? "Required" : null,
                decoration: const InputDecoration(
                  labelText: "Description",
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: payController,
                keyboardType: TextInputType.number,
                validator: (value) =>
                    value == null || value.isEmpty ? "Required" : null,
                decoration: const InputDecoration(
                  labelText: "Base Pay (\$)",
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: homesController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: "Number of Homes",
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: bonusController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: "Completion Bonus (\$)",
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 40),

              SizedBox(
                height: 55,
                child: ElevatedButton(
                  onPressed: publishCampaign,
                  child: const Text("Publish Campaign"),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}