import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

import '../../models/material_logistics.dart';
import '../../widgets/material_fulfillment_form.dart';

class EditCampaignScreen extends StatefulWidget {
  final DocumentSnapshot campaign;

  const EditCampaignScreen({super.key, required this.campaign});

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
  late final TextEditingController _changeReasonController;
  late MaterialLogisticsDraft _materialLogistics;
  late final String _originalMaterialLogistics;

  bool _saving = false;
  bool _proposalMode = false;
  late final bool _materialLocked;

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
    _changeReasonController = TextEditingController();
    _materialLocked = data['materialLogisticsLockedAt'] != null;

    _materialLogistics = MaterialLogisticsDraft.fromCampaign(data);
    _originalMaterialLogistics = _materialLogistics.toCallableData().toString();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _homesController.dispose();
    _basePayController.dispose();
    _bonusController.dispose();
    _deadlineController.dispose();
    _changeReasonController.dispose();
    super.dispose();
  }

  bool get _materialLogisticsChanged =>
      _materialLogistics.toCallableData().toString() !=
      _originalMaterialLogistics;

  Future<void> _saveCampaign() async {
    if (!_formKey.currentState!.validate()) return;
    final materialError = _materialLogistics.validate();
    if (materialError != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(materialError)));
      return;
    }

    setState(() {
      _saving = true;
    });

    try {
      final updates = <String, dynamic>{
        'campaignName': _nameController.text.trim(),
        'description': _descriptionController.text.trim(),
        'homes': int.tryParse(_homesController.text) ?? 0,
        'basePay': double.tryParse(_basePayController.text) ?? 0,
        'bonus': double.tryParse(_bonusController.text) ?? 0,
        'deadline': _deadlineController.text.trim(),
      };

      if (_materialLogisticsChanged) {
        late final HttpsCallable callable;
        late final Map<String, dynamic> payload;
        if (_materialLocked) {
          final zones = await FirebaseFirestore.instance
              .collection('campaignZones')
              .where('campaignId', isEqualTo: widget.campaign.id)
              .limit(20)
              .get();
          final assigned = zones.docs.where((zone) {
            final data = zone.data();
            return data['assignedScalerId'] != null ||
                (data['assignedScalerIds'] as List?)?.isNotEmpty == true;
          }).toList();
          if (assigned.isEmpty) {
            throw Exception('The locked assignment zone could not be found.');
          }
          if (_changeReasonController.text.trim().length < 3) {
            throw Exception(
              'Explain why the locked material plan must change.',
            );
          }
          callable = FirebaseFunctions.instanceFor(
            region: 'us-east1',
          ).httpsCallable('proposeMaterialLogisticsChange');
          payload = {
            ..._materialLogistics.toCallableData(),
            'zoneId': assigned.first.id,
            'reason': _changeReasonController.text.trim(),
          };
        } else {
          callable = FirebaseFunctions.instanceFor(
            region: 'us-east1',
          ).httpsCallable('updateCampaignMaterialLogistics');
          payload = _materialLogistics.toCallableData(
            campaignId: widget.campaign.id,
          );
        }
        final response = await callable.call(payload);
        final result = Map<String, dynamic>.from(response.data as Map);
        final lockedCount =
            (result['lockedHandoffCount'] as num?)?.round() ?? 0;
        if (mounted && lockedCount > 0) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '$lockedCount completed or terminal participant handoff'
                '${lockedCount == 1 ? ' was' : 's were'} preserved.',
              ),
            ),
          );
        }
      }

      updates['updatedAt'] = FieldValue.serverTimestamp();
      await widget.campaign.reference.update(updates);

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Campaign updated successfully.")),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text("Error updating campaign: $e")));
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
      appBar: AppBar(title: const Text("Edit Campaign"), centerTitle: true),
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

            const SizedBox(height: 24),
            MaterialFulfillmentForm(
              value: _materialLogistics,
              enabled: !_materialLocked || _proposalMode,
              onChanged: (value) {
                setState(() => _materialLogistics = value);
              },
              lockMessage: _materialLocked
                  ? 'Material logistics are locked because a Scaler accepted this job. '
                        'The accepted plan remains authoritative unless every affected '
                        'assigned Scaler accepts a proposed change.'
                  : 'Editable until the first Scaler accepts an assignment.',
            ),
            if (_materialLocked && !_proposalMode) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => setState(() => _proposalMode = true),
                icon: const Icon(Icons.rule_folder_outlined),
                label: const Text('Propose Logistics Change'),
              ),
            ],
            if (_materialLocked && _proposalMode) ...[
              const SizedBox(height: 12),
              TextFormField(
                controller: _changeReasonController,
                decoration: _decoration('Reason for proposed change'),
                maxLines: 3,
              ),
              const SizedBox(height: 6),
              const Text(
                'The original plan stays authoritative until every affected assigned Scaler accepts.',
              ),
            ],

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
                label: Text(_saving ? "Saving..." : "Save Changes"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
