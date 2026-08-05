import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class CreateCampaignScreen extends StatefulWidget {
  const CreateCampaignScreen({super.key});

  @override
  State<CreateCampaignScreen> createState() =>
      _CreateCampaignScreenState();
}

class _CreateCampaignScreenState
    extends State<CreateCampaignScreen> {
  final _formKey = GlobalKey<FormState>();

  final TextEditingController campaignController =
      TextEditingController();

  final TextEditingController descriptionController =
      TextEditingController();

  final TextEditingController payController =
      TextEditingController();

  final TextEditingController bonusController =
      TextEditingController();

  final TextEditingController homesController =
      TextEditingController();

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
        const SnackBar(
          content: Text("Please select a deadline."),
        ),
      );
      return;
    }

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("You must be logged in."),
        ),
      );
      return;
    }

    try {
      await FirebaseFirestore.instance
          .collection("campaigns")
          .add({
        "businessId": user.uid,
        "businessEmail": user.email,
        "campaignName": campaignController.text.trim(),
        "description": descriptionController.text.trim(),
        "pay": double.parse(payController.text),
        "bonus": bonusController.text.trim().isEmpty
            ? 0
            : double.parse(bonusController.text),
        "homes": int.parse(homesController.text),
        "deadline": Timestamp.fromDate(selectedDate!),
        "status": "open",
        "applications": 0,
        "createdAt": FieldValue.serverTimestamp(),
      });

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Campaign Published!"),
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

  Future<void> pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime(2035),
      initialDate: DateTime.now(),
    );

    if (picked != null) {
      setState(() {
        selectedDate = picked;
      });
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
              TextFormField(
                controller: campaignController,
                decoration: const InputDecoration(
                  labelText: "Campaign Name",
                  border: OutlineInputBorder(),
                ),
                validator: (value) =>
                    value == null || value.isEmpty
                        ? "Required"
                        : null,
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: descriptionController,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: "Description",
                  border: OutlineInputBorder(),
                ),
                validator: (value) =>
                    value == null || value.isEmpty
                        ? "Required"
                        : null,
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: payController,
                keyboardType:
                    const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: "Base Pay (\$)",
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return "Required";
                  }

                  if (double.tryParse(value) == null) {
                    return "Enter a valid number";
                  }

                  return null;
                },
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: bonusController,
                keyboardType:
                    const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: "Bonus (Optional)",
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextFormField(
                controller: homesController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: "Homes to Reach",
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return "Required";
                  }

                  if (int.tryParse(value) == null) {
                    return "Enter a whole number";
                  }

                  return null;
                },
              ),

              const SizedBox(height: 25),

              SizedBox(
                height: 55,
                child: ElevatedButton.icon(
                  onPressed: pickDate,
                  icon: const Icon(Icons.calendar_month),
                  label: Text(
                    selectedDate == null
                        ? "Select Deadline"
                        : "${selectedDate!.month}/${selectedDate!.day}/${selectedDate!.year}",
                  ),
                ),
              ),

              const SizedBox(height: 35),

              SizedBox(
                height: 55,
                child: ElevatedButton.icon(
                  onPressed: publishCampaign,
                  icon: const Icon(Icons.campaign),
                  label: const Text(
                    "Publish Campaign",
                    style: TextStyle(
                      fontSize: 18,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}