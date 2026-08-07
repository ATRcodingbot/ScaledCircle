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

  final campaignController = TextEditingController();
  final descriptionController = TextEditingController();
  final payController = TextEditingController();
  final bonusController = TextEditingController();
  final homesController = TextEditingController();

  DateTime? selectedDate;

  @override
  void dispose() {
    campaignController.dispose();
    descriptionController.dispose();
    payController.dispose();
    bonusController.dispose();
    homesController.dispose();
    super.dispose();
  }

  Future<void> publishCampaign() async {
    if (!_formKey.currentState!.validate()) return;

    if (selectedDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select a deadline.")),
      );
      return;
    }

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) return;

    try {
      final basePay = double.parse(payController.text.trim());
      final bonus = bonusController.text.trim().isEmpty
          ? 0.0
          : double.parse(bonusController.text.trim());

      const scalerCount = 1;

      final maximumWorkerBudget = (basePay + bonus) * scalerCount;

      await FirebaseFirestore.instance.collection("campaigns").add({
        "businessId": user.uid,
        "businessEmail": user.email,
        "campaignName": campaignController.text.trim(),
        "description": descriptionController.text.trim(),
        "basePay": basePay,
        "bonus": bonus,
        "maximumWorkerBudget": maximumWorkerBudget,
        "workerBudget": maximumWorkerBudget,
        "reservedWorkerBudget": maximumWorkerBudget,
        "requestedScalerCount": scalerCount,
        "assignedScalerCount": 0,
        "homes": int.parse(homesController.text.trim()),
        "deadline": Timestamp.fromDate(selectedDate!),
        "fundingStatus": "reserved",
        "status": "open",
        "applications": 0,
        "createdAt": FieldValue.serverTimestamp(),
      });

      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime(2035),
      initialDate: DateTime.now(),
    );

    if (picked != null) {
      setState(() => selectedDate = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Create Campaign")),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              TextFormField(controller: campaignController, decoration: const InputDecoration(labelText: "Campaign Name")),
              TextFormField(controller: descriptionController, decoration: const InputDecoration(labelText: "Description")),
              TextFormField(controller: payController, decoration: const InputDecoration(labelText: "Base Pay")),
              TextFormField(controller: bonusController, decoration: const InputDecoration(labelText: "Bonus")),
              TextFormField(controller: homesController, decoration: const InputDecoration(labelText: "Homes")),
              ElevatedButton(onPressed: pickDate, child: const Text("Select Date")),
              ElevatedButton(onPressed: publishCampaign, child: const Text("Publish Campaign")),
            ],
          ),
        ),
      ),
    );
  }
}
