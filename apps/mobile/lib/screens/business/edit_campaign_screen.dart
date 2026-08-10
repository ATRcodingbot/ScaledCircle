import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../widgets/mapped_address_field.dart';

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
  late final TextEditingController _materialAddressController;

  late final bool _supportsMaterialHandoff;
  late final String _originalMaterialHandoffMethod;
  late final String _originalMaterialHandoffAddress;
  late String _materialHandoffMethod;
  double? _materialHandoffLatitude;
  double? _materialHandoffLongitude;

  bool _checkingMaterialHandoffLock = true;
  bool _hasAcceptedOrAssignedScaler = false;
  String? _materialHandoffLockError;

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

    _supportsMaterialHandoff =
        data['materialSource']?.toString() == 'business_provided' ||
        data.containsKey('materialHandoffMethod');
    _originalMaterialHandoffMethod =
        data['materialHandoffMethod']?.toString() == 'business_dropoff'
        ? 'business_dropoff'
        : 'business_pickup';
    _materialHandoffMethod = _originalMaterialHandoffMethod;
    _originalMaterialHandoffAddress =
        data['materialHandoffAddress']?.toString() ?? '';
    _materialAddressController = TextEditingController(
      text: _originalMaterialHandoffAddress,
    );
    _materialHandoffLatitude = (data['materialHandoffLatitude'] as num?)
        ?.toDouble();
    _materialHandoffLongitude = (data['materialHandoffLongitude'] as num?)
        ?.toDouble();

    if (_supportsMaterialHandoff) {
      _refreshMaterialHandoffLock();
    } else {
      _checkingMaterialHandoffLock = false;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _homesController.dispose();
    _basePayController.dispose();
    _bonusController.dispose();
    _deadlineController.dispose();
    _materialAddressController.dispose();
    super.dispose();
  }

  Future<bool> _campaignHasAcceptedOrAssignedScaler() async {
    final firestore = FirebaseFirestore.instance;
    final campaignId = widget.campaign.id;
    final results = await Future.wait([
      firestore
          .collection('campaigns')
          .doc(campaignId)
          .collection('applications')
          .where('status', isEqualTo: 'accepted')
          .limit(1)
          .get(),
      firestore
          .collection('campaignZones')
          .where('campaignId', isEqualTo: campaignId)
          .get(),
    ]);

    final acceptedApplications = results[0];
    final campaignZones = results[1];
    final hasAssignedZone = campaignZones.docs.any((zone) {
      final data = zone.data();
      return data['assignedScalerId']?.toString().trim().isNotEmpty == true;
    });

    return acceptedApplications.docs.isNotEmpty || hasAssignedZone;
  }

  Future<void> _refreshMaterialHandoffLock() async {
    if (mounted) {
      setState(() {
        _checkingMaterialHandoffLock = true;
        _materialHandoffLockError = null;
      });
    }

    try {
      final locked = await _campaignHasAcceptedOrAssignedScaler();
      if (!mounted) return;
      setState(() {
        _hasAcceptedOrAssignedScaler = locked;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _materialHandoffLockError =
            'Unable to verify applicant assignments. Handoff changes are '
            'locked until this check succeeds.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _checkingMaterialHandoffLock = false;
        });
      }
    }
  }

  bool get _canEditMaterialHandoff {
    return _supportsMaterialHandoff &&
        !_checkingMaterialHandoffLock &&
        _materialHandoffLockError == null &&
        !_hasAcceptedOrAssignedScaler;
  }

  bool get _materialHandoffChanged {
    return _materialHandoffMethod != _originalMaterialHandoffMethod ||
        _materialAddressController.text.trim() !=
            _originalMaterialHandoffAddress;
  }

  Future<void> _saveCampaign() async {
    if (!_formKey.currentState!.validate()) return;

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

      if (_supportsMaterialHandoff && _materialHandoffChanged) {
        final locked = await _campaignHasAcceptedOrAssignedScaler();
        if (locked) {
          if (mounted) {
            setState(() {
              _hasAcceptedOrAssignedScaler = true;
            });
          }
          throw Exception(
            'Material handoff is locked because a Scaler has already been '
            'accepted or assigned.',
          );
        }

        updates.addAll({
          'materialHandoffMethod': _materialHandoffMethod,
          'materialHandoffAddress': _materialAddressController.text.trim(),
          'materialHandoffLatitude': _materialHandoffLatitude,
          'materialHandoffLongitude': _materialHandoffLongitude,
          'materialHandoffUpdatedAt': FieldValue.serverTimestamp(),
        });
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

  Widget _buildMaterialHandoffSection() {
    final colorScheme = Theme.of(context).colorScheme;
    final locked = _hasAcceptedOrAssignedScaler;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Icon(Icons.inventory_2_outlined),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Marketing Material Handoff',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              locked
                  ? 'Locked because a Scaler has already been accepted or '
                        'assigned.'
                  : 'Choose how the selected Scaler will receive the '
                        'materials. This remains editable until a Scaler is '
                        'accepted.',
              style: TextStyle(color: colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            if (_checkingMaterialHandoffLock)
              const LinearProgressIndicator()
            else if (_materialHandoffLockError != null) ...[
              Text(
                _materialHandoffLockError!,
                style: TextStyle(color: colorScheme.error),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _refreshMaterialHandoffLock,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry assignment check'),
              ),
            ] else ...[
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'business_pickup',
                    icon: Icon(Icons.storefront_outlined),
                    label: Text('Scaler pickup'),
                  ),
                  ButtonSegment(
                    value: 'business_dropoff',
                    icon: Icon(Icons.handshake_outlined),
                    label: Text('Meet up'),
                  ),
                ],
                selected: {_materialHandoffMethod},
                onSelectionChanged: _canEditMaterialHandoff
                    ? (selection) {
                        setState(() {
                          _materialHandoffMethod = selection.first;
                        });
                      }
                    : null,
              ),
              const SizedBox(height: 16),
              MappedAddressField(
                controller: _materialAddressController,
                enabled: _canEditMaterialHandoff,
                labelText: _materialHandoffMethod == 'business_dropoff'
                    ? 'Meet-up / drop-off address'
                    : 'Material pickup address',
                hintText: 'Search a complete street address',
                onChanged: (_) {
                  _materialHandoffLatitude = null;
                  _materialHandoffLongitude = null;
                },
                onSelected: (suggestion) {
                  _materialHandoffLatitude = suggestion.latitude;
                  _materialHandoffLongitude = suggestion.longitude;
                },
                validator: (value) {
                  if (_canEditMaterialHandoff &&
                      (value == null || value.trim().isEmpty)) {
                    return 'Choose the pickup or meeting address.';
                  }
                  return null;
                },
              ),
            ],
          ],
        ),
      ),
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

            if (_supportsMaterialHandoff) ...[
              const SizedBox(height: 24),
              _buildMaterialHandoffSection(),
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
