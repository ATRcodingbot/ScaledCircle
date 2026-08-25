import 'package:flutter/material.dart';

import '../../services/job_room_service.dart';

String materialHandoffStatusLabel({
  required String? status,
  required String? fulfillmentType,
  required bool materialsRequired,
}) {
  if (!materialsRequired || fulfillmentType == 'no_materials_required') {
    return 'No materials required';
  }
  return switch (status) {
    'received' => 'Received',
    'handoff_in_progress' => 'Awaiting confirmations',
    'scaler_en_route' || 'scaler_arrived' =>
      fulfillmentType == 'business_delivery'
          ? 'Delivery in progress'
          : 'Pickup in progress',
    'failed_scaler' ||
    'failed_business' ||
    'failed_third_party' ||
    'support_review' => 'Issue reported',
    _ =>
      fulfillmentType == 'business_delivery'
          ? 'Awaiting delivery'
          : 'Awaiting pickup',
  };
}

bool materialReceiptActionVisible({
  required bool materialsRequired,
  required String? status,
}) =>
    materialsRequired &&
    ![
      'received',
      'failed_scaler',
      'failed_business',
      'failed_third_party',
      'support_review',
    ].contains(status);

class JobRoomScreen extends StatefulWidget {
  const JobRoomScreen({super.key, required this.zoneId});
  final String zoneId;

  @override
  State<JobRoomScreen> createState() => _JobRoomScreenState();
}

class _JobRoomScreenState extends State<JobRoomScreen> {
  final _service = const JobRoomService();
  final _message = TextEditingController();
  final _location = TextEditingController();
  final _instructions = TextEditingController();
  final _printingShop = TextEditingController();
  final _orderReference = TextEditingController();
  Map<String, dynamic>? _data;
  bool _loading = true;
  String _fulfillmentType = 'no_materials_required';
  DateTime? _scheduledAt;
  bool _acknowledgingReadiness = false;
  bool _submittingMaterialReceipt = false;
  bool _reportingMaterialIssue = false;
  bool _savingLogistics = false;
  bool _respondingToProposal = false;
  bool _sendingMessage = false;
  String? _activeBusinessDeliveryHandoffId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final controller in [
      _message,
      _location,
      _instructions,
      _printingShop,
      _orderReference,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  DateTime? _readDate(dynamic value) {
    if (value is String) return DateTime.tryParse(value);
    if (value is Map && value['_seconds'] is num) {
      return DateTime.fromMillisecondsSinceEpoch(
        (value['_seconds'] as num).toInt() * 1000,
      );
    }
    return null;
  }

  String _formatDate(dynamic value) {
    final date = _readDate(value)?.toLocal();
    if (date == null) return 'Not scheduled';
    String two(int number) => number.toString().padLeft(2, '0');
    final hour = date.hour == 0
        ? 12
        : (date.hour > 12 ? date.hour - 12 : date.hour);
    final suffix = date.hour >= 12 ? 'PM' : 'AM';
    return '${date.month}/${date.day}/${date.year} '
        '$hour:${two(date.minute)} $suffix';
  }

  Future<void> _load() async {
    final data = await _service.load(widget.zoneId);
    if (!mounted) return;
    final room = Map<String, dynamic>.from(data['room'] as Map? ?? {});
    final handoff = Map<String, dynamic>.from(data['handoff'] as Map? ?? {});
    final logistics = Map<String, dynamic>.from(
      room['materialLogistics'] as Map? ?? {},
    );
    setState(() {
      _data = data;
      _loading = false;
      _fulfillmentType =
          logistics['fulfillmentType']?.toString() ??
          handoff['fulfillmentType']?.toString() ??
          'no_materials_required';
      _scheduledAt = _readDate(logistics['scheduledAt']);
      _location.text =
          logistics['location']?.toString() ??
          handoff['privateLocation']?.toString() ??
          '';
      _instructions.text =
          logistics['instructions']?.toString() ??
          handoff['instructions']?.toString() ??
          '';
      _printingShop.text = logistics['printingShopName']?.toString() ?? '';
      _orderReference.text = logistics['orderReference']?.toString() ?? '';
    });
  }

  Future<void> _pickSchedule() async {
    final day = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 730)),
      initialDate: _scheduledAt ?? DateTime.now(),
    );
    if (day == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledAt ?? DateTime.now()),
    );
    if (time == null) return;
    setState(
      () => _scheduledAt = DateTime(
        day.year,
        day.month,
        day.day,
        time.hour,
        time.minute,
      ),
    );
  }

  Future<void> _saveLogistics() async {
    if (_savingLogistics) return;
    setState(() => _savingLogistics = true);
    try {
      await _service.configure(
        zoneId: widget.zoneId,
        fulfillmentType: _fulfillmentType,
        scheduledAt: _scheduledAt,
        location: _location.text.trim(),
        printingShopName: _printingShop.text.trim(),
        orderReference: _orderReference.text.trim(),
        instructions: _instructions.text.trim(),
      );
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Material plan saved.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "We couldn't save the material plan. No job state was changed. Try again.",
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _savingLogistics = false);
    }
  }

  Future<void> _respondToProposal({
    required String proposalId,
    required bool accept,
  }) async {
    if (_respondingToProposal) return;
    setState(() => _respondingToProposal = true);
    try {
      await _service.respondToMaterialLogisticsChange(
        proposalId: proposalId,
        accept: accept,
      );
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            accept
                ? 'Material-plan change accepted.'
                : 'Material-plan change declined.',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "We couldn't record your response. No material plan was changed. Try again.",
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _respondingToProposal = false);
    }
  }

  Future<void> _sendMessage() async {
    final text = _message.text.trim();
    if (text.isEmpty || _sendingMessage) return;
    setState(() => _sendingMessage = true);
    try {
      await _service.sendMessage(widget.zoneId, text);
      _message.clear();
      await _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("We couldn't send this message. Try again.")),
      );
    } finally {
      if (mounted) setState(() => _sendingMessage = false);
    }
  }

  Future<void> _confirmMaterialReceipt({
    required Map<String, dynamic> handoff,
  }) async {
    final handoffId = handoff['id']?.toString() ?? '';
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm materials received?'),
        content: const Text(
          'Confirm only after you have received the materials. This acknowledgment does not request location, start GPS work, or record attendance.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Confirm Receipt'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _submittingMaterialReceipt = true);
    try {
      final result = await _service.confirmMaterialReceipt(
        zoneId: widget.zoneId,
        handoffId: handoffId,
      );
      await _load();
      if (!mounted) return;
      final received = result['status'] == 'received';
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            received
                ? 'Material receipt confirmed.'
                : 'Your receipt is recorded and awaits the Business delivery confirmation.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text('Unable to confirm materials: $error')),
      );
    } finally {
      if (mounted) setState(() => _submittingMaterialReceipt = false);
    }
  }

  Future<void> _reportMaterialIssue() async {
    var issue = 'Materials not present';
    final notes = TextEditingController();
    try {
      final submitted = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: const Text('Report material issue'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: issue,
                  decoration: const InputDecoration(labelText: 'Issue'),
                  items:
                      const [
                            'Materials not present',
                            'Wrong materials',
                            'Damaged materials',
                            'Insufficient quantity',
                            'Business or print shop unavailable',
                          ]
                          .map(
                            (value) => DropdownMenuItem(
                              value: value,
                              child: Text(value),
                            ),
                          )
                          .toList(),
                  onChanged: (value) => setDialogState(() => issue = value!),
                ),
                TextField(
                  controller: notes,
                  decoration: const InputDecoration(
                    labelText: 'Details (optional)',
                  ),
                  maxLines: 3,
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Report Issue'),
              ),
            ],
          ),
        ),
      );
      if (submitted != true || !mounted) return;
      setState(() => _reportingMaterialIssue = true);
      await _service.reportMaterialIssue(
        zoneId: widget.zoneId,
        summary: notes.text.trim().isEmpty
            ? issue
            : '$issue: ${notes.text.trim()}',
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Material issue sent to the Business and support.'),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "We couldn't submit this support request. No job or earning state was changed. Try again.",
          ),
        ),
      );
    } finally {
      notes.dispose();
      if (mounted) setState(() => _reportingMaterialIssue = false);
    }
  }

  Future<void> _confirmBusinessMaterials(String handoffId) async {
    setState(() => _activeBusinessDeliveryHandoffId = handoffId);
    try {
      final result = await _service.confirmBusinessMaterials(
        zoneId: widget.zoneId,
        handoffId: handoffId,
      );
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result['status'] == 'received'
                ? 'Material receipt is confirmed by both parties.'
                : 'Your confirmation is recorded. The Scaler must confirm their own receipt.',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _activeBusinessDeliveryHandoffId = null);
    }
  }

  String _fulfillmentLabel(String? value) => switch (value) {
    'scaler_pickup_print_shop' ||
    'third_party_pickup' => 'Printing Shop Pickup',
    'scaler_pickup_business' || 'business_pickup' => 'Business Pickup',
    'business_delivery' || 'business_dropoff' => 'Business Delivery',
    _ => 'No Materials Required',
  };

  String _businessConfirmationAction(String fulfillmentType) =>
      switch (fulfillmentType) {
        'business_delivery' || 'business_dropoff' => 'Confirm Delivered',
        'scaler_pickup_print_shop' || 'third_party_pickup' => 'Confirm Pickup',
        _ => 'Confirm Released',
      };

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final data = _data!;
    final viewerRole = data['viewerRole']?.toString();
    final campaign = Map<String, dynamic>.from(data['campaign'] as Map? ?? {});
    final zone = Map<String, dynamic>.from(data['zone'] as Map? ?? {});
    final room = Map<String, dynamic>.from(data['room'] as Map? ?? {});
    final logistics = Map<String, dynamic>.from(
      room['materialLogistics'] as Map? ?? {},
    );
    final logisticsLocked = room['materialLogisticsLockedAt'] != null;
    final proposal = data['materialLogisticsChange'] is Map
        ? Map<String, dynamic>.from(data['materialLogisticsChange'] as Map)
        : null;
    final readiness = Map<String, dynamic>.from(
      data['groupReadiness'] as Map? ?? {},
    );
    final group = Map<String, dynamic>.from(
      data['groupAssignment'] as Map? ?? {},
    );
    final compensation = Map<String, dynamic>.from(
      data['compensation'] as Map? ?? {},
    );
    final handoff = Map<String, dynamic>.from(data['handoff'] as Map? ?? {});
    final viewerReadiness = Map<String, dynamic>.from(
      data['viewerReadiness'] as Map? ?? {},
    );
    final fulfillmentType =
        logistics['fulfillmentType']?.toString() ??
        handoff['fulfillmentType']?.toString() ??
        'no_materials_required';
    final materialsRequired =
        handoff['required'] == true ||
        fulfillmentType != 'no_materials_required';
    final groupMaterialStatuses = List<Map<String, dynamic>>.from(
      (data['groupMaterialStatuses'] as List? ?? []).map(
        (item) => Map<String, dynamic>.from(item as Map),
      ),
    );
    final messages = List<Map<String, dynamic>>.from(
      (data['messages'] as List? ?? []).map(
        (item) => Map<String, dynamic>.from(item as Map),
      ),
    );
    final scalerCount =
        (room['scalerIds'] as List?)?.length ??
        (room['scalerId'] == null ? 0 : 1);
    final share = (compensation['initialShareCents'] as num?)?.round();
    final workerPool = (group['workerPoolCents'] as num?)?.round();
    return Scaffold(
      appBar: AppBar(title: const Text('Job Room')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            zone['zoneName']?.toString() ??
                campaign['campaignName']?.toString() ??
                'Assigned Job',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text('$scalerCount assigned Scaler${scalerCount == 1 ? '' : 's'}'),
          if (workerPool != null)
            Text(
              'Group worker pool: \$${(workerPool / 100).toStringAsFixed(2)}',
            ),
          if (share != null)
            Text('Your scheduled share: \$${(share / 100).toStringAsFixed(2)}'),
          if (campaign['workWindowSummary'] != null)
            Text('Work window: ${campaign['workWindowSummary']}'),
          if (campaign['deadline'] != null)
            Text('Campaign deadline: ${_formatDate(campaign['deadline'])}'),
          const Divider(height: 28),
          const Text(
            'MATERIALS',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          Text('Fulfillment: ${_fulfillmentLabel(fulfillmentType)}'),
          if (logistics['printingShopName'] != null)
            Text('Printing shop: ${logistics['printingShopName']}'),
          if (logistics['location'] != null)
            Text('Location: ${logistics['location']}'),
          if (logistics['scheduledAt'] != null)
            Text('Date/time: ${_formatDate(logistics['scheduledAt'])}'),
          if (logistics['instructions'] != null)
            Text('Instructions: ${logistics['instructions']}'),
          Text(
            'Your materials: ${materialHandoffStatusLabel(status: handoff['status']?.toString(), fulfillmentType: fulfillmentType, materialsRequired: materialsRequired)}',
          ),
          Text(
            logisticsLocked
                ? 'Status: Locked to the accepted assignment'
                : 'Status: Editable until a Scaler is assigned',
          ),
          const Text(
            'Shared logistics never completes another participant’s material receipt.',
          ),
          if (proposal != null) ...[
            const SizedBox(height: 12),
            const Text(
              'PROPOSED LOGISTICS CHANGE',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            Text('Reason: ${proposal['reason']}'),
            Text('Status: ${proposal['status']}'),
            Text(
              'Accepted: ${(proposal['acceptedScalerIds'] as List?)?.length ?? 0}',
            ),
            Text(
              'Pending: ${(proposal['pendingScalerIds'] as List?)?.length ?? 0}',
            ),
            Text(
              'Declined: ${(proposal['declinedScalerIds'] as List?)?.length ?? 0}',
            ),
            if (viewerRole == 'scaler' &&
                proposal['status'] == 'pending_acknowledgment')
              Row(
                children: [
                  FilledButton(
                    onPressed: _respondingToProposal
                        ? null
                        : () => _respondToProposal(
                            proposalId: proposal['id'].toString(),
                            accept: true,
                          ),
                    child: Text(
                      _respondingToProposal ? 'Recording...' : 'Accept Change',
                    ),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: _respondingToProposal
                        ? null
                        : () => _respondToProposal(
                            proposalId: proposal['id'].toString(),
                            accept: false,
                          ),
                    child: const Text('Decline'),
                  ),
                ],
              ),
          ],
          if (viewerRole == 'business') ...[
            Text(
              'Material status: ${readiness['receivedCount'] ?? 0} / ${readiness['assignedCount'] ?? scalerCount} received',
            ),
            if (groupMaterialStatuses.isEmpty && materialsRequired)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  materialHandoffStatusLabel(
                    status: handoff['status']?.toString(),
                    fulfillmentType: fulfillmentType,
                    materialsRequired: true,
                  ),
                ),
                subtitle: Text(
                  'Business confirmation: ${handoff['businessConfirmedAt'] != null ? 'Confirmed' : 'Pending'}\n'
                  'Scaler confirmation: ${handoff['scalerConfirmedAt'] != null ? 'Confirmed' : 'Pending'}',
                ),
                trailing:
                    handoff['status'] != 'received' &&
                        handoff['businessConfirmedAt'] == null
                    ? TextButton(
                        onPressed: _activeBusinessDeliveryHandoffId == null
                            ? () => _confirmBusinessMaterials(
                                handoff['id']?.toString() ?? widget.zoneId,
                              )
                            : null,
                        child: Text(
                          _businessConfirmationAction(fulfillmentType),
                        ),
                      )
                    : null,
              ),
            ...groupMaterialStatuses.map((item) {
              final itemStatus = item['status']?.toString() ?? 'scheduled';
              final itemHandoffId = item['handoffId']?.toString() ?? '';
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '${item['scalerId']}: ${materialHandoffStatusLabel(status: itemStatus, fulfillmentType: item['fulfillmentType']?.toString() ?? fulfillmentType, materialsRequired: item['required'] == true || materialsRequired)}',
                ),
                subtitle: Text(
                  'Business confirmation: ${item['businessConfirmed'] == true ? 'Confirmed' : 'Pending'}\n'
                  'Scaler confirmation: ${item['scalerConfirmed'] == true ? 'Confirmed' : 'Pending'}',
                ),
                trailing:
                    itemStatus != 'received' &&
                        item['businessConfirmed'] != true &&
                        itemHandoffId.isNotEmpty
                    ? TextButton(
                        onPressed: _activeBusinessDeliveryHandoffId == null
                            ? () => _confirmBusinessMaterials(itemHandoffId)
                            : null,
                        child: Text(
                          _activeBusinessDeliveryHandoffId == itemHandoffId
                              ? 'Recording...'
                              : _businessConfirmationAction(
                                  item['fulfillmentType']?.toString() ??
                                      fulfillmentType,
                                ),
                        ),
                      )
                    : null,
              );
            }),
            if (logisticsLocked)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'Material logistics cannot be overwritten after assignment. Use Edit Campaign to propose a change.',
                ),
              )
            else if (materialReceiptActionVisible(
              materialsRequired: materialsRequired,
              status: handoff['status']?.toString(),
            )) ...[
              DropdownButtonFormField<String>(
                initialValue: _fulfillmentType,
                decoration: const InputDecoration(
                  labelText: 'Material fulfillment',
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'no_materials_required',
                    child: Text('No Materials Required'),
                  ),
                  DropdownMenuItem(
                    value: 'scaler_pickup_print_shop',
                    child: Text('Printing Shop Pickup'),
                  ),
                  DropdownMenuItem(
                    value: 'scaler_pickup_business',
                    child: Text('Business Pickup'),
                  ),
                  DropdownMenuItem(
                    value: 'business_delivery',
                    child: Text('Business Delivery'),
                  ),
                ],
                onChanged: (value) => setState(() => _fulfillmentType = value!),
              ),
              if (_fulfillmentType != 'no_materials_required') ...[
                OutlinedButton(
                  onPressed: _pickSchedule,
                  child: Text(
                    _scheduledAt == null
                        ? 'Set pickup / delivery date and time'
                        : _scheduledAt.toString(),
                  ),
                ),
                if (_fulfillmentType == 'scaler_pickup_print_shop')
                  TextField(
                    controller: _printingShop,
                    decoration: const InputDecoration(
                      labelText: 'Printing shop name',
                    ),
                  ),
                TextField(
                  controller: _location,
                  decoration: const InputDecoration(
                    labelText: 'Pickup / delivery location',
                  ),
                ),
                TextField(
                  controller: _orderReference,
                  decoration: const InputDecoration(
                    labelText: 'Order / reference instructions',
                  ),
                ),
              ],
              TextField(
                controller: _instructions,
                decoration: const InputDecoration(
                  labelText: 'Material logistics instructions',
                ),
                maxLines: 3,
              ),
              FilledButton(
                onPressed: _savingLogistics ? null : _saveLogistics,
                child: Text(
                  _savingLogistics ? 'Saving...' : 'Save Material Logistics',
                ),
              ),
            ],
          ] else ...[
            if (viewerReadiness['acknowledged'] == true)
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.check_circle, color: Colors.green),
                title: Text('Ready Confirmed'),
                subtitle: Text(
                  'Job details confirmed. This is not attendance or proof of work.',
                ),
              )
            else
              FilledButton.icon(
                onPressed: _acknowledgingReadiness
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        setState(() => _acknowledgingReadiness = true);
                        try {
                          await _service.acknowledgeReadiness(widget.zoneId);
                          await _load();
                          if (!mounted) return;
                          messenger.showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Job details acknowledged. This is not attendance or proof of work.',
                              ),
                            ),
                          );
                        } finally {
                          if (mounted) {
                            setState(() => _acknowledgingReadiness = false);
                          }
                        }
                      },
                icon: const Icon(Icons.check_circle_outline),
                label: Text(
                  _acknowledgingReadiness ? 'Confirming...' : 'Confirm Ready',
                ),
              ),
            if (!materialsRequired)
              const Text('No physical materials required')
            else if (handoff['status'] == 'received')
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.verified, color: Colors.green),
                title: Text('Material receipt confirmed'),
              )
            else ...[
              Text(
                'Business confirmation: ${handoff['businessConfirmedAt'] != null ? 'Confirmed' : 'Pending'}',
              ),
              Text(
                'Your confirmation: ${handoff['scalerConfirmedAt'] != null ? 'Confirmed' : 'Pending'}',
              ),
              if (handoff['scalerConfirmedAt'] == null)
                FilledButton.icon(
                  onPressed: _submittingMaterialReceipt
                      ? null
                      : () => _confirmMaterialReceipt(handoff: handoff),
                  icon: const Icon(Icons.inventory_2_outlined),
                  label: Text(
                    _submittingMaterialReceipt
                        ? 'Confirming receipt...'
                        : 'Confirm Materials Received',
                  ),
                )
              else
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.check_circle, color: Colors.green),
                  title: Text('Your material confirmation is recorded'),
                  subtitle: Text('Awaiting the Business confirmation.'),
                ),
              OutlinedButton.icon(
                onPressed: _reportingMaterialIssue
                    ? null
                    : _reportMaterialIssue,
                icon: const Icon(Icons.report_problem_outlined),
                label: Text(
                  _reportingMaterialIssue
                      ? 'Reporting...'
                      : 'Report Material Issue',
                ),
              ),
              const Text(
                'Receipt proof is participant-specific. It does not record attendance, start GPS work, complete the job, or authorize payout.',
              ),
            ],
          ],
          const Divider(height: 28),
          const Text(
            'Group Chat',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          ...messages.map(
            (item) => ListTile(
              title: Text(item['text']?.toString() ?? ''),
              subtitle: Text(item['senderRole']?.toString() ?? ''),
            ),
          ),
          TextField(
            controller: _message,
            decoration: const InputDecoration(
              labelText: 'Message assigned group',
            ),
          ),
          FilledButton(
            onPressed: _sendingMessage ? null : _sendMessage,
            child: Text(_sendingMessage ? 'Sending...' : 'Send Message'),
          ),
          const SizedBox(height: 8),
          const Text(
            'Readiness does not record GPS attendance, material receipt, job start, completion, or no-show status.',
          ),
        ],
      ),
    );
  }
}
