import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class EditCampaignScreen extends StatefulWidget {
  final DocumentSnapshot campaign;

  const EditCampaignScreen({
    super.key,
    required this.campaign,
  });

  @override
  State<EditCampaignScreen> createState() => _EditCampaignScreenState();
}

class _EditCampaignScreenState extends State<EditCampaignScreen> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _homesController;
  late final TextEditingController _basePayController;
  late final TextEditingController _bonusController;
  late final TextEditingController _deadlineController;

  bool _saving = false;

  @override
  void initState() {
    super.initState();

    final data = widget.campaign.data() as Map<String, dynamic>;

    _nameController = TextEditingController(
      text: data['campaignName']?.toString() ?? '',
    );

    _descriptionController = TextEditingController(
      text: data['description']?.toString() ?? '',
    );

    _homesController = TextEditingController(
      text: data['homes']?.toString() ?? '',
    );

    _basePayController = TextEditingController(
      text: data['basePay']?.toString() ?? '',
    );

    _bonusController = TextEditingController(
      text: data['bonus']?.toString() ?? '',
    );

    _deadlineController = TextEditingController(
      text: data['deadline']?.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _homesController.dispose();
    _basePayController.dispose();
    _bonusController.dispose();
    _deadlineController.dispose();
    super.dispose();
  }

  Future<void> _saveCampaign() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _saving = true;
    });

    try {
      await widget.campaign.reference.update({
        'campaignName': _nameController.text.trim(),
        'description': _descriptionController.text.trim(),
        'homes': int.tryParse(_homesController.text) ?? 0,
        'basePay': double.tryParse(_basePayController.text) ?? 0,
        'bonus': double.tryParse(_bonusController.text) ?? 0,
        'deadline': _deadlineController.text.trim(),
      });

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Campaign updated successfully."),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Error updating campaign: $e"),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  InputDecoration _decoration(String label) {
    return InputDecoration(
      labelText: label,
      border: const OutlineInputBorder(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Edit Campaign"),
        centerTitle: true,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextFormField(
              controller: _nameController,
              decoration: _decoration("Campaign Name"),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return "Campaign name is required";
                }
                return null;
              },
            ),

            const SizedBox(height: 18),

            TextFormField(
              controller: _descriptionController,
              maxLines: 4,
              decoration: _decoration("Description"),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return "Description is required";
                }
                return null;
              },
            ),

            const SizedBox(height: 18),

            TextFormField(
              controller: _homesController,
              keyboardType: TextInputType.number,
              decoration: _decoration("Homes"),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return "Enter number of homes";
                }
                return null;
              },
            ),

            const SizedBox(height: 18),

            TextFormField(
              controller: _basePayController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: _decoration("Base Pay"),
            ),

            const SizedBox(height: 18),

            TextFormField(
              controller: _bonusController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: _decoration("Bonus"),
            ),

            const SizedBox(height: 18),

            TextFormField(
              controller: _deadlineController,
              decoration: _decoration("Deadline"),
            ),

            const SizedBox(height: 35),

            SizedBox(
              height: 55,
              child: ElevatedButton.icon(
                onPressed: _saving ? null : _saveCampaign,
                icon: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.save),
                label: Text(
                  _saving ? "Saving..." : "Save Changes",
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}