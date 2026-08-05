import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'campaign_zones_screen.dart';

class CreateCampaignScreen extends StatefulWidget {
  const CreateCampaignScreen({super.key});

  @override
  State<CreateCampaignScreen> createState() =>
      _CreateCampaignScreenState();
}

class _CreateCampaignScreenState
    extends State<CreateCampaignScreen> {
  final _formKey = GlobalKey<FormState>();

  final campaignNameController =
      TextEditingController();

  final descriptionController =
      TextEditingController();

  final payController =
      TextEditingController();

  final bonusController =
      TextEditingController();

  final scalerCountController =
      TextEditingController(
    text: '1',
  );

  DateTime? _marketingDate;
  TimeOfDay? _startTime;
  TimeOfDay? _deadlineTime;

  bool publishing = false;

  @override
  void dispose() {
    campaignNameController.dispose();
    descriptionController.dispose();
    payController.dispose();
    bonusController.dispose();
    scalerCountController.dispose();
    super.dispose();
  }

  Future<void> _pickMarketingDate() async {
    final now = DateTime.now();

    final initialDate =
        _marketingDate ??
            now.add(
              const Duration(days: 1),
            );

    final selected =
        await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(
        now.year,
        now.month,
        now.day,
      ),
      lastDate: DateTime(
        now.year + 3,
      ),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _marketingDate = DateTime(
        selected.year,
        selected.month,
        selected.day,
      );
    });
  }

  Future<void> _pickStartTime() async {
    final selected =
        await showTimePicker(
      context: context,
      initialTime:
          _startTime ??
              const TimeOfDay(
                hour: 9,
                minute: 0,
              ),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _startTime = selected;
    });
  }

  Future<void> _pickDeadlineTime() async {
    final selected =
        await showTimePicker(
      context: context,
      initialTime:
          _deadlineTime ??
              const TimeOfDay(
                hour: 17,
                minute: 0,
              ),
    );

    if (selected == null) {
      return;
    }

    setState(() {
      _deadlineTime = selected;
    });
  }

  DateTime? _combineDateAndTime(
    DateTime? date,
    TimeOfDay? time,
  ) {
    if (date == null || time == null) {
      return null;
    }

    return DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
  }

  String _formatDate(
    DateTime? date,
  ) {
    if (date == null) {
      return 'Choose marketing date';
    }

    return '${date.month}/${date.day}/${date.year}';
  }

  String _formatTime(
    TimeOfDay? time,
  ) {
    if (time == null) {
      return 'Choose time';
    }

    return time.format(context);
  }

  Future<void> publishCampaign() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_marketingDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Choose a marketing date.',
          ),
        ),
      );

      return;
    }

    if (_startTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Choose a campaign start time.',
          ),
        ),
      );

      return;
    }

    if (_deadlineTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Choose a completion deadline.',
          ),
        ),
      );

      return;
    }

    final startDateTime =
        _combineDateAndTime(
      _marketingDate,
      _startTime,
    );

    final deadlineDateTime =
        _combineDateAndTime(
      _marketingDate,
      _deadlineTime,
    );

    if (startDateTime == null ||
        deadlineDateTime == null) {
      return;
    }

    if (!deadlineDateTime.isAfter(
      startDateTime,
    )) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Completion deadline must be after the start time.',
          ),
        ),
      );

      return;
    }

    setState(() {
      publishing = true;
    });

    try {
      final user =
          FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception(
          'You must be logged in to create a campaign.',
        );
      }

      final scalerCount =
          int.tryParse(
        scalerCountController.text.trim(),
      );

      if (scalerCount == null ||
          scalerCount < 1) {
        throw Exception(
          'Enter at least 1 Scaler.',
        );
      }

      final campaignReference =
          await FirebaseFirestore.instance
              .collection('campaigns')
              .add({
        'businessId': user.uid,
        'businessEmail': user.email,
        'campaignName':
            campaignNameController.text.trim(),
        'description':
            descriptionController.text.trim(),
        'basePay':
            double.tryParse(
              payController.text.trim(),
            ) ??
            0,
        'bonus':
            double.tryParse(
              bonusController.text.trim(),
            ) ??
            0,
        'requestedScalerCount':
            scalerCount,
        'assignedScalerCount':
            0,
        'marketingDate':
            Timestamp.fromDate(
          _marketingDate!,
        ),
        'startAt':
            Timestamp.fromDate(
          startDateTime,
        ),
        'deadlineAt':
            Timestamp.fromDate(
          deadlineDateTime,
        ),
        'status': 'open',
        'applications': 0,
        'zoneCount': 0,
        'mappedZoneCount': 0,
        'estimatedHomes': 0,
        'createdAt':
            FieldValue.serverTimestamp(),
      });

      final campaignSnapshot =
          await campaignReference.get();

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Campaign created. Now define the campaign zones.',
          ),
        ),
      );

      final zonesConfigured =
          await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) =>
              CampaignZonesScreen(
            campaign: campaignSnapshot,
          ),
        ),
      );

      if (!mounted) {
        return;
      }

      if (zonesConfigured == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Campaign published with zones.',
            ),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Campaign saved. You can finish configuring zones later.',
            ),
          ),
        );
      }

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Unable to publish campaign: $e',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          publishing = false;
        });
      }
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Create Campaign',
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Padding(
          padding:
              const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: ListView(
              children: [
                const Text(
                  'New Marketing Campaign',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight:
                        FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 8),

                const Text(
                  "Set the campaign schedule and staffing. Next, you'll define one or more canvassing zones on the map.",
                ),

                const SizedBox(height: 30),

                TextFormField(
                  controller:
                      campaignNameController,
                  textInputAction:
                      TextInputAction.next,
                  validator: (value) {
                    if (value == null ||
                        value.trim().isEmpty) {
                      return 'Required';
                    }

                    return null;
                  },
                  decoration:
                      const InputDecoration(
                    labelText:
                        'Campaign Name',
                    border:
                        OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 20),

                TextFormField(
                  controller:
                      descriptionController,
                  maxLines: 4,
                  validator: (value) {
                    if (value == null ||
                        value.trim().isEmpty) {
                      return 'Required';
                    }

                    return null;
                  },
                  decoration:
                      const InputDecoration(
                    labelText:
                        'Description',
                    border:
                        OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 24),

                const Text(
                  'Campaign Schedule',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight:
                        FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 12),

                Card(
                  child: ListTile(
                    leading: const Icon(
                      Icons.calendar_month,
                    ),
                    title: const Text(
                      'Marketing Date',
                    ),
                    subtitle: Text(
                      _formatDate(
                        _marketingDate,
                      ),
                    ),
                    trailing: const Icon(
                      Icons.chevron_right,
                    ),
                    onTap:
                        _pickMarketingDate,
                  ),
                ),

                Card(
                  child: ListTile(
                    leading: const Icon(
                      Icons.play_circle_outline,
                    ),
                    title: const Text(
                      'Start Time',
                    ),
                    subtitle: Text(
                      _formatTime(
                        _startTime,
                      ),
                    ),
                    trailing: const Icon(
                      Icons.chevron_right,
                    ),
                    onTap:
                        _pickStartTime,
                  ),
                ),

                Card(
                  child: ListTile(
                    leading: const Icon(
                      Icons.timer_outlined,
                    ),
                    title: const Text(
                      'Completion Deadline',
                    ),
                    subtitle: Text(
                      _formatTime(
                        _deadlineTime,
                      ),
                    ),
                    trailing: const Icon(
                      Icons.chevron_right,
                    ),
                    onTap:
                        _pickDeadlineTime,
                  ),
                ),

                const SizedBox(height: 24),

                const Text(
                  'Staffing',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight:
                        FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 12),

                TextFormField(
                  controller:
                      scalerCountController,
                  keyboardType:
                      TextInputType.number,
                  textInputAction:
                      TextInputAction.next,
                  validator: (value) {
                    final count =
                        int.tryParse(
                      value?.trim() ?? '',
                    );

                    if (count == null ||
                        count < 1) {
                      return 'Enter at least 1 Scaler';
                    }

                    if (count > 100) {
                      return 'Enter 100 or fewer for now';
                    }

                    return null;
                  },
                  decoration:
                      const InputDecoration(
                    labelText:
                        'Scalers Needed',
                    helperText:
                        'How many Scalers do you want working this campaign?',
                    border:
                        OutlineInputBorder(),
                    prefixIcon: Icon(
                      Icons.groups_outlined,
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                const Text(
                  'Compensation',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight:
                        FontWeight.bold,
                  ),
                ),

                const SizedBox(height: 12),

                TextFormField(
                  controller:
                      payController,
                  keyboardType:
                      const TextInputType
                          .numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction:
                      TextInputAction.next,
                  validator: (value) {
                    if (value == null ||
                        value.trim().isEmpty) {
                      return 'Required';
                    }

                    final pay =
                        double.tryParse(
                      value.trim(),
                    );

                    if (pay == null ||
                        pay < 0) {
                      return 'Enter a valid amount';
                    }

                    return null;
                  },
                  decoration:
                      const InputDecoration(
                    labelText:
                        'Base Pay per Scaler (\$)',
                    helperText:
                        'Base compensation for each assigned Scaler.',
                    border:
                        OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 20),

                TextFormField(
                  controller:
                      bonusController,
                  keyboardType:
                      const TextInputType
                          .numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction:
                      TextInputAction.done,
                  validator: (value) {
                    if (value == null ||
                        value.trim().isEmpty) {
                      return null;
                    }

                    final bonus =
                        double.tryParse(
                      value.trim(),
                    );

                    if (bonus == null ||
                        bonus < 0) {
                      return 'Enter a valid amount';
                    }

                    return null;
                  },
                  decoration:
                      const InputDecoration(
                    labelText:
                        'Completion Bonus per Scaler (\$)',
                    border:
                        OutlineInputBorder(),
                  ),
                ),

                const SizedBox(height: 22),

                const Card(
                  child: Padding(
                    padding:
                        EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.home_work_outlined,
                        ),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            "You don't need to enter a home count. Scaled Circle will estimate the homes in each mapped zone and show the workload before assigning a Scaler.",
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 32),

                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    onPressed:
                        publishing
                            ? null
                            : publishCampaign,
                    icon:
                        publishing
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child:
                                    CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(
                                Icons.map_outlined,
                              ),
                    label: Text(
                      publishing
                          ? 'Creating Campaign...'
                          : 'Create & Define Zones',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}