import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../navigation/app_router.dart';
import '../../services/business_operations_service.dart';
import '../../services/business_workspace_service.dart';

class BusinessScheduleScreen extends StatefulWidget {
  const BusinessScheduleScreen({super.key, this.businessId, this.service});
  final String? businessId;
  final BusinessOperationsService? service;
  @override
  State<BusinessScheduleScreen> createState() => _BusinessScheduleScreenState();
}

class _BusinessScheduleScreenState extends State<BusinessScheduleScreen>
    with WidgetsBindingObserver {
  late final service = widget.service ?? BusinessOperationsService();
  late final String businessId =
      widget.businessId ??
      BusinessWorkspaceSession.businessIdFor(
        FirebaseAuth.instance.currentUser!.uid,
      );
  Map<String, dynamic>? data;
  String? error;
  String section = 'Schedule', period = 'Today', query = '', filter = 'All';
  DateTime anchor = DateTime.now();
  bool loading = false,
      busy = false,
      reloadQueued = false,
      accountChanged = false;
  Timer? timer;
  StreamSubscription<User?>? auth;
  bool get editable => data?['activePaid'] == true;
  bool can(String p) =>
      data?['isOwner'] == true ||
      (data?['permissions'] as List? ?? []).contains(p);
  List<Map<String, dynamic>> get customers => operationRows(data?['customers']);
  List<Map<String, dynamic>> get items => operationRows(data?['items']);
  List<Map<String, dynamic>> get people => operationRows(
    data?['people'],
  ).where((p) => p['status'] != 'inactive').toList();
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    load();
    timer = Timer.periodic(const Duration(seconds: 30), (_) => load());
    if (widget.service == null) {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      auth = FirebaseAuth.instance.authStateChanges().listen((u) {
        if (u?.uid != uid && mounted) {
          accountChanged = true;
          timer?.cancel();
          setState(() {
            data = null;
            error = 'Your account changed. Reopen Schedule after signing in.';
          });
        }
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) load();
  }

  @override
  void dispose() {
    timer?.cancel();
    auth?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  (DateTime, DateTime) get range {
    final day = DateTime(anchor.year, anchor.month, anchor.day);
    if (period == 'Month') {
      return (DateTime(day.year, day.month), DateTime(day.year, day.month + 1));
    }
    if (period == 'Week') {
      final start = day.subtract(Duration(days: day.weekday - 1));
      return (start, DateTime(start.year, start.month, start.day + 7));
    }
    return (day, DateTime(day.year, day.month, day.day + 1));
  }

  Future<void> load() async {
    if (!mounted || accountChanged) return;
    if (loading) {
      reloadQueued = true;
      return;
    }
    loading = true;
    final requested = range;
    try {
      final value = await service.call(businessId, 'load', {
        'fromMs': requested.$1.millisecondsSinceEpoch,
        'toMs': requested.$2.millisecondsSinceEpoch,
      });
      if (mounted && !accountChanged && requested == range) {
        setState(() {
          data = value;
          error = null;
        });
      }
    } catch (e) {
      if (mounted && !accountChanged && requested == range) {
        setState(() {
          data = null;
          error = e is FirebaseFunctionsException
              ? e.message
              : 'Schedule could not be confirmed. Check your connection and retry.';
        });
      }
    } finally {
      loading = false;
      if (reloadQueued || requested != range) {
        reloadQueued = false;
        unawaited(load());
      }
    }
  }

  String date(dynamic ms, {bool time = true}) {
    if (ms is! num) return 'Time unavailable';
    final d = DateTime.fromMillisecondsSinceEpoch(ms.toInt());
    return '${MaterialLocalizations.of(context).formatMediumDate(d)}${time ? ' · ${TimeOfDay.fromDateTime(d).format(context)}' : ''}';
  }

  String label(dynamic value) =>
      workStatusLabels[value] ?? customerStageLabels[value] ?? 'Needs review';
  void message(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<Map<String, dynamic>?> change(
    String operation,
    Map<String, dynamic> input,
  ) async {
    if (busy || accountChanged) return null;
    setState(() => busy = true);
    try {
      final result = await service.call(
        businessId,
        operation,
        input,
        requestId: service.requestId(),
      );
      await load();
      return result;
    } on FirebaseFunctionsException catch (e) {
      if (e.details is Map && (e.details as Map)['conflicts'] is List) {
        final conflicts = operationRows((e.details as Map)['conflicts']);
        final text = conflicts
            .map(
              (c) =>
                  '${c['personName']} is already scheduled ${date(c['startMs'])}–${date(c['endMs'])}.',
            )
            .join('\n');
        message(text);
      } else {
        message(e.message ?? 'Change not confirmed. Refresh before retrying.');
      }
    } catch (_) {
      message('Change not confirmed. Refresh before retrying.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
    return null;
  }

  Future<T?> form<T>(
    String title,
    Widget Function(StateSetter) content,
    T? Function() result, {
    String action = 'Save',
  }) async {
    final route = DialogRoute<T>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (_, update) => AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(child: content(update)),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final value = result();
                if (value != null) Navigator.pop(dialog, value);
              },
              child: Text(action),
            ),
          ],
        ),
      ),
    );
    final value = await Navigator.of(context).push(route);
    await route.completed;
    return value;
  }

  Widget field(
    TextEditingController c,
    String label, {
    int lines = 1,
    bool required = false,
    TextInputType? keyboard,
    int maxLength = 400,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: c,
      maxLines: lines,
      maxLength: maxLength,
      keyboardType: keyboard,
      decoration: InputDecoration(
        labelText: '$label${required ? ' *' : ''}',
        counterText: '',
      ),
    ),
  );
  Widget selector(
    String label,
    String value,
    Map<String, String> choices,
    void Function(String) changed,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: choices.entries
          .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: (v) {
        if (v != null) changed(v);
      },
    ),
  );
  Widget peoplePicker(Set<String> selected, StateSetter update) =>
      ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: Text('Assigned people (${selected.length})'),
        children: people
            .map(
              (p) => CheckboxListTile(
                value: selected.contains(p['id']),
                title: Text(p['name'].toString()),
                subtitle: Text(
                  p['kind'] == 'crew'
                      ? 'Crew resource · no login seat'
                      : 'Workspace user',
                ),
                onChanged: (v) => update(() {
                  v == true ? selected.add(p['id']) : selected.remove(p['id']);
                }),
              ),
            )
            .toList(),
      );

  Future<void> editCustomer([Map<String, dynamic>? before]) async {
    final controllers = {
      for (final k in [
        'name',
        'company',
        'email',
        'phone',
        'location',
        'source',
        'notes',
      ])
        k: TextEditingController(text: before?[k]?.toString() ?? ''),
    };
    var stage = before?['stage']?.toString() ?? 'new_lead';
    final assigned = Set<String>.from(before?['assignedPeople'] as List? ?? []);
    final value = await form<Map<String, dynamic>>(
      before == null ? 'Add customer or lead' : 'Edit customer',
      (update) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          field(controllers['name']!, 'Name', required: true, maxLength: 160),
          field(controllers['company']!, 'Company', maxLength: 160),
          field(
            controllers['email']!,
            'Email',
            keyboard: TextInputType.emailAddress,
            maxLength: 254,
          ),
          field(
            controllers['phone']!,
            'Phone',
            keyboard: TextInputType.phone,
            maxLength: 40,
          ),
          field(controllers['location']!, 'Service address or location'),
          selector(
            'Stage',
            stage,
            customerStageLabels,
            (v) => update(() => stage = v),
          ),
          field(controllers['source']!, 'Source', maxLength: 180),
          field(controllers['notes']!, 'Notes', lines: 3, maxLength: 4000),
          if (can('assignPeople')) peoplePicker(assigned, update),
        ],
      ),
      () {
        if (controllers['name']!.text.trim().isEmpty) {
          message('Enter a customer name.');
          return null;
        }
        return {
          for (final e in controllers.entries) e.key: e.value.text.trim(),
          'stage': stage,
          'assignedPeople': assigned.toList(),
        };
      },
    );
    for (final c in controllers.values) {
      c.dispose();
    }
    if (value != null) {
      await change('saveCustomer', {
        'customer': value,
        'expectedVersion': before?['version'] ?? 0,
        if (before != null) 'customerId': before['id'],
      });
    }
  }

  Future<void> editItem([
    Map<String, dynamic>? before,
    String? customerId,
  ]) async {
    final title = TextEditingController(text: before?['title'] ?? '');
    final location = TextEditingController(text: before?['location'] ?? '');
    final notes = TextEditingController(text: before?['notes'] ?? '');
    final duration = TextEditingController(
      text: '${before?['durationMinutes'] ?? 60}',
    );
    final newName = TextEditingController(
          text: before?['proposedCustomerName'] ?? '',
        ),
        newEmail = TextEditingController();
    final overrideReason = TextEditingController();
    var type =
        before?['type']?.toString() ??
        (can('scheduleEdit') ? 'estimate' : 'job');
    var customer =
        before?['customerId']?.toString() ??
        customerId ??
        (before?['proposedCustomerName'] != null ? '__new' : '');
    var linked = before?['linkedItemId']?.toString() ?? '';
    var when = before == null
        ? DateTime(anchor.year, anchor.month, anchor.day, 9)
        : DateTime.fromMillisecondsSinceEpoch(
            (before['startMs'] as num).toInt(),
          );
    final assigned = Set<String>.from(before?['assignedPeople'] as List? ?? []);
    var override = false;
    final value = await form<Map<String, dynamic>>(
      before == null ? 'Add to schedule' : 'Edit scheduled work',
      (update) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          selector('Type', type, {
            for (final e in workTypeLabels.entries)
              if (can(e.key == 'job' ? 'jobsEdit' : 'scheduleEdit'))
                e.key: e.value,
          }, (v) => update(() => type = v)),
          field(title, 'Title', required: true, maxLength: 180),
          if (can('customersView'))
            selector(
              'Customer / lead',
              customer,
              {
                '': 'No customer',
                if (can('customersEdit')) '__new': 'Add a new customer',
                for (final c in customers) c['id']: c['name'],
              },
              (v) => update(() {
                customer = v;
                linked = '';
              }),
            ),
          if (customer == '__new') ...[
            field(newName, 'Customer name', required: true, maxLength: 160),
            field(
              newEmail,
              'Customer email',
              keyboard: TextInputType.emailAddress,
              maxLength: 254,
            ),
            const Text(
              'A matching customer will be reused. Multiple matches need your review.',
            ),
          ],
          Wrap(
            spacing: 12,
            children: [
              OutlinedButton.icon(
                icon: const Icon(Icons.calendar_today_outlined),
                label: Text(
                  MaterialLocalizations.of(context).formatMediumDate(when),
                ),
                onPressed: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: when,
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2099),
                  );
                  if (d != null) {
                    update(
                      () => when = DateTime(
                        d.year,
                        d.month,
                        d.day,
                        when.hour,
                        when.minute,
                      ),
                    );
                  }
                },
              ),
              OutlinedButton.icon(
                icon: const Icon(Icons.schedule),
                label: Text(TimeOfDay.fromDateTime(when).format(context)),
                onPressed: () async {
                  final t = await showTimePicker(
                    context: context,
                    initialTime: TimeOfDay.fromDateTime(when),
                  );
                  if (t != null) {
                    update(
                      () => when = DateTime(
                        when.year,
                        when.month,
                        when.day,
                        t.hour,
                        t.minute,
                      ),
                    );
                  }
                },
              ),
            ],
          ),
          const Text('The selected time uses this device’s local clock.'),
          field(
            duration,
            'Estimated duration in minutes',
            required: true,
            keyboard: TextInputType.number,
            maxLength: 4,
          ),
          field(location, 'Service address or location'),
          if (can('assignPeople')) peoplePicker(assigned, update),
          selector('Related estimate or job', linked, {
            '': 'None',
            for (final i in items)
              if (i['customerId'] == customer &&
                  i['id'] != before?['id'] &&
                  ['estimate', 'job'].contains(i['type']))
                i['id']: i['title'],
          }, (v) => update(() => linked = v)),
          field(notes, 'Notes', lines: 3, maxLength: 4000),
          if (data?['isOwner'] == true)
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Schedule conflict override'),
              children: [
                CheckboxListTile(
                  value: override,
                  title: const Text(
                    'Allow an overlap after checking the schedule',
                  ),
                  onChanged: (v) => update(() => override = v == true),
                ),
                if (override)
                  field(
                    overrideReason,
                    'Reason for allowing the overlap',
                    required: true,
                    maxLength: 500,
                  ),
              ],
            ),
          const Text(
            'Internal Business work. Saving this does not hire a Scaler or create a payment.',
          ),
        ],
      ),
      () {
        final minutes = int.tryParse(duration.text);
        if (title.text.trim().isEmpty ||
            minutes == null ||
            minutes < 5 ||
            minutes > 1440 ||
            customer == '__new' && newName.text.trim().isEmpty ||
            override && overrideReason.text.trim().isEmpty) {
          message(
            'Complete the required fields and choose a duration from 5 to 1440 minutes.',
          );
          return null;
        }
        return {
          'item': {
            'type': type,
            'title': title.text.trim(),
            'customerId': customer == '__new' ? null : customer,
            'startMs': when.millisecondsSinceEpoch,
            'durationMinutes': minutes,
            'timeZone': _localZone(when),
            'location': location.text.trim(),
            'notes': notes.text.trim(),
            'assignedPeople': assigned.toList(),
            'linkedItemId': linked,
            'status':
                before?['status'] ?? (type == 'task' ? 'open' : 'scheduled'),
          },
          if (customer == '__new')
            'newCustomer': {
              'name': newName.text.trim(),
              'email': newEmail.text.trim(),
              'location': location.text.trim(),
            },
          'expectedVersion': before?['version'] ?? 0,
          if (before?['id'] != null) 'itemId': before!['id'],
          'overrideConflict': override,
          if (override) 'overrideReason': overrideReason.text.trim(),
        };
      },
    );
    for (final c in [
      title,
      location,
      notes,
      duration,
      newName,
      newEmail,
      overrideReason,
    ]) {
      c.dispose();
    }
    if (value != null) await change('saveItem', value);
  }

  String _localZone(DateTime time) {
    final offset = time.timeZoneOffset.inMinutes;
    return 'UTC${offset < 0 ? '-' : '+'}${(offset.abs() ~/ 60).toString().padLeft(2, '0')}:${(offset.abs() % 60).toString().padLeft(2, '0')}';
  }

  Future<void> estimate(Map<String, dynamic> item) async {
    final prior = Map<String, dynamic>.from(item['estimate'] as Map? ?? {});
    final amount = TextEditingController(
      text: prior['quotedAmountCents'] == null
          ? ''
          : ((prior['quotedAmountCents'] as num) / 100).toStringAsFixed(2),
    );
    final note = TextEditingController(text: prior['note'] ?? '');
    var outcome = prior['outcome']?.toString() ?? 'pending';
    final value = await form<Map<String, dynamic>>(
      'Record estimate outcome',
      (update) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          field(
            amount,
            'Quoted amount (optional)',
            keyboard: const TextInputType.numberWithOptions(decimal: true),
          ),
          selector('Outcome', outcome, const {
            'pending': 'Pending',
            'won': 'Won',
            'lost': 'Lost',
          }, (v) => update(() => outcome = v)),
          field(note, 'Notes', lines: 3, maxLength: 2000),
          const Text(
            'A quote or a won estimate is not collected revenue. No invoice or payment is created.',
          ),
        ],
      ),
      () {
        final value = amount.text.trim().isEmpty
            ? null
            : double.tryParse(amount.text);
        if (amount.text.trim().isNotEmpty &&
            (value == null || !value.isFinite || value < 0)) {
          message('Enter a valid amount.');
          return null;
        }
        return {
          'itemId': item['id'],
          'expectedVersion': item['version'],
          'quotedAmountCents': value == null ? null : (value * 100).round(),
          'outcome': outcome,
          'note': note.text.trim(),
        };
      },
    );
    amount.dispose();
    note.dispose();
    if (value != null) await change('recordEstimate', value);
  }

  Future<void> resource([Map<String, dynamic>? before]) async {
    final name = TextEditingController(text: before?['name'] ?? '');
    final value = await form<String>(
      'Crew resource',
      (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          field(name, 'Name', required: true, maxLength: 120),
          const Text(
            'A crew resource can be assigned work. It has no login, no data access and uses no workspace seat.',
          ),
        ],
      ),
      () => name.text.trim().isEmpty ? null : name.text.trim(),
    );
    name.dispose();
    if (value != null) {
      await change('saveResource', {
        'name': value,
        'status': 'active',
        'expectedVersion': before?['version'] ?? 0,
        if (before != null) 'resourceId': before['id'].toString().substring(5),
      });
    }
  }

  Future<void> linkResource(Map<String, dynamic> crew) async {
    var selected = '';
    final value = await form<String>(
      'Link to accepted team member',
      (update) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Invite them through Account → Team first. Linking preserves earlier crew assignments.',
          ),
          selector('Workspace user', selected, {
            '': 'Choose a member',
            for (final p in people)
              if (p['kind'] == 'user') p['uid']: p['name'],
          }, (v) => update(() => selected = v)),
        ],
      ),
      () => selected.isEmpty ? null : selected,
    );
    if (value != null) {
      await change('linkResource', {
        'resourceId': crew['id'].toString().substring(5),
        'expectedVersion': crew['version'],
        'memberUid': value,
      });
    }
  }

  Future<void> preferences() async {
    final choices = Map<String, dynamic>.from(
      data?['notifications'] as Map? ?? {},
    );
    final value = await form<Map<String, dynamic>>(
      'Schedule notifications',
      (update) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Choose in-app schedule updates. These choices never grant access to customer or financial information.',
          ),
          for (final key in [
            'assignedJobs',
            'scheduleChanges',
            'estimateReminders',
          ])
            SwitchListTile(
              title: Text(operationNotificationLabels[key]!),
              value: choices[key] != false,
              onChanged: (v) => update(() => choices[key] = v),
            ),
          const Text(
            'Other account, billing and Growth notifications continue through their existing settings.',
          ),
        ],
      ),
      () => choices,
    );
    if (value != null) await change('savePreferences', {'choices': value});
  }

  Future<void> prepareCommand() async {
    final prompt = TextEditingController();
    final text = await form<String>(
      'Prepare a schedule change',
      (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Use an exact date and time. For example: Schedule estimate with John in Linthicum on 2026-09-14 at 10:00.',
          ),
          field(prompt, 'Your request', lines: 3, maxLength: 1000),
          const Text(
            'This prepares a proposal. Nothing is scheduled until you review and save it.',
          ),
        ],
      ),
      () => prompt.text.trim().isEmpty ? null : prompt.text.trim(),
      action: 'Prepare',
    );
    prompt.dispose();
    if (text == null) return;
    try {
      final candidateDate = RegExp(
        r'on (\d{4})-(\d{2})-(\d{2}) at (\d{2}):(\d{2})',
      ).firstMatch(text);
      final local = candidateDate == null
          ? DateTime.now()
          : DateTime(
              int.parse(candidateDate[1]!),
              int.parse(candidateDate[2]!),
              int.parse(candidateDate[3]!),
              int.parse(candidateDate[4]!),
              int.parse(candidateDate[5]!),
            );
      final value = await service.call(businessId, 'propose', {
        'prompt': text,
        'utcOffsetMinutes': local.timeZoneOffset.inMinutes,
      });
      if (value['needsDetails'] == true) {
        message(value['message']);
        return;
      }
      if (!mounted) return;
      await editItem({
        ...Map<String, dynamic>.from(value['item'] as Map),
        'customerId': value['customerId'],
        'version': 0,
        if (value['customerId'] == null) 'proposedCustomerName': value['name'],
      });
    } on FirebaseFunctionsException catch (e) {
      message(e.message ?? 'The proposal needs review. Nothing was scheduled.');
    } catch (_) {
      message(
        'The proposal could not be confirmed. Add it directly in Schedule.',
      );
    }
  }

  Future<void> linkEmail(Map<String, dynamic> customer) async {
    final threads = operationRows(data?['emailThreads'])
        .where(
          (e) =>
              e['recipient']?.toString().toLowerCase() ==
              customer['email']?.toString().toLowerCase(),
        )
        .toList();
    if (threads.isEmpty) {
      message(
        'No confirmed Business email thread matches this customer. Connect Read Business Email to link an existing thread.',
      );
      return;
    }
    var selected = threads.first['id'].toString();
    final value = await form<String>(
      'Link Business email conversation',
      (update) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Customer: ${customer['name']}'),
          selector('Confirmed conversation', selected, {
            for (final thread in threads)
              thread['id']: thread['subject'] ?? 'Business conversation',
          }, (v) => update(() => selected = v)),
          const Text(
            'Linking shows the recorded send and reply history. It does not send an email.',
          ),
        ],
      ),
      () => selected,
      action: 'Link conversation',
    );
    if (value != null) {
      await change('linkEmailThread', {
        'customerId': customer['id'],
        'expectedVersion': customer['version'],
        'operationId': value,
      });
    }
  }

  Future<void> customerDetail(Map<String, dynamic> customer) async {
    try {
      final value = await service.call(businessId, 'timeline', {
        'customerId': customer['id'],
      });
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(customer['name']),
          content: SizedBox(
            width: 620,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label(customer['stage'])),
                  for (final key in [
                    'company',
                    'email',
                    'phone',
                    'location',
                    'source',
                    'notes',
                  ])
                    if (customer[key]?.toString().isNotEmpty == true)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(customer[key].toString()),
                      ),
                  const SizedBox(height: 16),
                  const Text(
                    'Activity',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  if (operationRows(value['events']).isEmpty)
                    const Text('No recorded activity yet.'),
                  for (final event in operationRows(value['events']))
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(event['summary'] ?? 'Recorded activity'),
                      subtitle: Text(
                        '${date(event['atMs'])}${event['actorName'] == null ? '' : ' · ${event['actorName']}'}',
                      ),
                    ),
                  const Text(
                    'Quotes and owner-recorded outcomes do not establish collected revenue.',
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c),
              child: const Text('Back'),
            ),
          ],
        ),
      );
    } catch (_) {
      message(
        'Customer history could not be confirmed. Check your access and retry.',
      );
    }
  }

  Widget itemCard(Map<String, dynamic> i) {
    final customer = customers
        .where((c) => c['id'] == i['customerId'])
        .firstOrNull;
    final editor = can(i['type'] == 'job' ? 'jobsEdit' : 'scheduleEdit');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(i['title'], style: Theme.of(context).textTheme.titleMedium),
            Text('${workTypeLabels[i['type']]} · ${label(i['status'])}'),
            Text('${date(i['startMs'])} · ${i['durationMinutes']} minutes'),
            if (customer != null || i['customer'] != null)
              Text('${customer?['name'] ?? i['customer']['name']}'),
            if (i['location']?.toString().isNotEmpty == true)
              Text(i['location']),
            Text(
              (i['assignedLabels'] as List? ?? []).isEmpty
                  ? 'Unassigned'
                  : (i['assignedLabels'] as List).join(' · '),
            ),
            if (i['estimate'] is Map)
              Text(
                'Quote: ${i['estimate']['quotedAmountCents'] == null ? 'Not recorded' : '\$${((i['estimate']['quotedAmountCents'] as num) / 100).toStringAsFixed(2)}'} · ${i['estimate']['outcome']} · Not collected revenue',
              ),
            if (editable)
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (editor)
                    TextButton(
                      onPressed: busy ? null : () => editItem(i),
                      child: const Text('Edit'),
                    ),
                  if (editor || i['type'] == 'job' && can('jobsStatus'))
                    PopupMenuButton<String>(
                      tooltip: 'Update status',
                      onSelected: (v) => change('setItemStatus', {
                        'itemId': i['id'],
                        'expectedVersion': i['version'],
                        'status': v,
                      }),
                      itemBuilder: (_) => [
                        for (final status
                            in (i['type'] == 'task'
                                ? ['open', 'done', 'canceled']
                                : [
                                    'scheduled',
                                    'in_progress',
                                    'completed',
                                    'canceled',
                                  ]))
                          PopupMenuItem(
                            value: status,
                            child: Text(label(status)),
                          ),
                      ],
                      child: const Padding(
                        padding: EdgeInsets.all(12),
                        child: Text('Update status'),
                      ),
                    ),
                  if (i['type'] == 'estimate' &&
                      can('customersEdit') &&
                      can('scheduleEdit'))
                    TextButton(
                      onPressed: busy ? null : () => estimate(i),
                      child: const Text('Record estimate'),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  List<Map<String, dynamic>> get filteredItems =>
      items.where((i) {
        final c = customers
            .where((c) => c['id'] == i['customerId'])
            .firstOrNull;
        final text = '${i['title']} ${i['location']} ${c?['name'] ?? ''}'
            .toLowerCase();
        return text.contains(query.toLowerCase()) &&
            (filter != 'Unassigned jobs' ||
                i['type'] == 'job' && (i['assignedPeople'] as List).isEmpty) &&
            (filter != 'Estimates' || i['type'] == 'estimate') &&
            (filter != 'Jobs' || i['type'] == 'job') &&
            (filter != 'Tasks' || i['type'] == 'task');
      }).toList()..sort(
        (a, b) => (a['startMs'] as num).compareTo(b['startMs'] as num),
      );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: BackButton(
        onPressed: () {
          if (Navigator.canPop(context)) {
            Navigator.pop(context);
          } else {
            AppNavigation.replace(context, '/business');
          }
        },
      ),
      title: const Text('Customers & Schedule'),
      actions: [
        IconButton(
          tooltip: 'Notification choices',
          onPressed: data == null ? null : preferences,
          icon: const Icon(Icons.notifications_outlined),
        ),
      ],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1100),
        child: error != null
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(error!),
                    TextButton(onPressed: load, child: const Text('Retry')),
                  ],
                ),
              )
            : data == null
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const Text(
                      'Customers, estimates, jobs and follow-ups in one place.',
                    ),
                    if (!editable)
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(12),
                          child: Text(
                            'History is available. Reactivate membership to add or change work.',
                          ),
                        ),
                      ),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final value in [
                          'Schedule',
                          if (can('customersView')) 'Customers',
                          if (can('assignPeople')) 'People',
                        ])
                          ChoiceChip(
                            label: Text(value),
                            selected: section == value,
                            onSelected: (_) => setState(() {
                              section = value;
                              filter = 'All';
                              query = '';
                            }),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      decoration: const InputDecoration(
                        labelText: 'Search customers, location or work',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: (v) => setState(() => query = v),
                    ),
                    const SizedBox(height: 12),
                    if (section == 'Schedule') ...[
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final value in ['Today', 'Week', 'Month'])
                            ChoiceChip(
                              label: Text(value),
                              selected: period == value,
                              onSelected: (_) async {
                                setState(() => period = value);
                                await load();
                              },
                            ),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.calendar_month),
                            label: Text(
                              MaterialLocalizations.of(
                                context,
                              ).formatMediumDate(anchor),
                            ),
                            onPressed: () async {
                              final d = await showDatePicker(
                                context: context,
                                initialDate: anchor,
                                firstDate: DateTime(2000),
                                lastDate: DateTime(2099),
                              );
                              if (d != null) {
                                setState(() => anchor = d);
                                await load();
                              }
                            },
                          ),
                          if (editable &&
                              (can('scheduleEdit') || can('jobsEdit')))
                            FilledButton.icon(
                              onPressed: busy ? null : () => editItem(),
                              icon: const Icon(Icons.add),
                              label: const Text('Add to schedule'),
                            ),
                          if (editable &&
                              data?['agentAvailable'] == true &&
                              can('scheduleEdit') &&
                              can('customersView'))
                            OutlinedButton.icon(
                              onPressed: busy ? null : prepareCommand,
                              icon: const Icon(Icons.auto_awesome_outlined),
                              label: const Text(
                                'Prepare with Growth · Private Beta',
                              ),
                            ),
                        ],
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          '${date(range.$1.millisecondsSinceEpoch, time: false)}${period == 'Today' ? '' : ' – ${date(range.$2.subtract(const Duration(seconds: 1)).millisecondsSinceEpoch, time: false)}'} · Times shown on this device',
                        ),
                      ),
                      if (data!['counts']['needsResponse'] != null)
                        Text(
                          'Needs attention: ${data!['counts']['needsResponse']} new leads · ${data!['counts']['needsFollowUp']} need follow-up · ${data!['counts']['openTasks']} open tasks',
                        ),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final v in [
                            'All',
                            'Estimates',
                            'Jobs',
                            'Tasks',
                            'Unassigned jobs',
                          ])
                            ChoiceChip(
                              label: Text(v),
                              selected: filter == v,
                              onSelected: (_) => setState(() => filter = v),
                            ),
                        ],
                      ),
                      if (filteredItems.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('No matching work in this date range.'),
                        ),
                      for (final i in filteredItems) itemCard(i),
                    ],
                    if (section == 'Customers') ...[
                      if (editable && can('customersEdit'))
                        Align(
                          alignment: Alignment.centerLeft,
                          child: FilledButton.icon(
                            onPressed: busy ? null : editCustomer,
                            icon: const Icon(Icons.person_add_outlined),
                            label: const Text('Add customer'),
                          ),
                        ),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final v in [
                            'All',
                            'Needs follow-up',
                            'Won',
                            'Lost',
                          ])
                            ChoiceChip(
                              label: Text(v),
                              selected: filter == v,
                              onSelected: (_) => setState(() => filter = v),
                            ),
                        ],
                      ),
                      for (final lead in operationRows(data?['inbound']))
                        Card(
                          child: ListTile(
                            title: Text(lead['name']),
                            subtitle: const Text('New landing-page inquiry'),
                            trailing: editable && can('customersEdit')
                                ? TextButton(
                                    onPressed: busy
                                        ? null
                                        : () => change('importLead', {
                                            'leadId': lead['id'],
                                          }),
                                    child: const Text('Add to customers'),
                                  )
                                : null,
                          ),
                        ),
                      if (customers.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                            'No customers yet. Add a customer or link an existing landing-page inquiry.',
                          ),
                        ),
                      for (final c in customers.where(
                        (c) =>
                            matchesCustomerSearch(c, query) &&
                            (filter != 'Won' || c['stage'] == 'won') &&
                            (filter != 'Lost' || c['stage'] == 'lost') &&
                            (filter != 'Needs follow-up' ||
                                [
                                  'follow_up',
                                  'estimate_given',
                                  'new_lead',
                                ].contains(c['stage'])),
                      ))
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  c['name'],
                                  style: Theme.of(
                                    context,
                                  ).textTheme.titleMedium,
                                ),
                                Text('${label(c['stage'])} · ${c['location']}'),
                                Wrap(
                                  spacing: 8,
                                  children: [
                                    TextButton(
                                      onPressed: () => customerDetail(c),
                                      child: const Text('View history'),
                                    ),
                                    if (editable &&
                                        can('customersEdit') &&
                                        can('communicationsRead'))
                                      TextButton(
                                        onPressed: busy
                                            ? null
                                            : () => linkEmail(c),
                                        child: const Text(
                                          'Link email conversation',
                                        ),
                                      ),
                                    if (editable && can('customersEdit'))
                                      TextButton(
                                        onPressed: busy
                                            ? null
                                            : () => editCustomer(c),
                                        child: const Text('Edit'),
                                      ),
                                    if (editable && can('scheduleEdit'))
                                      TextButton(
                                        onPressed: busy
                                            ? null
                                            : () => editItem(null, c['id']),
                                        child: const Text('Schedule'),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                    if (section == 'People') ...[
                      Text(
                        '${people.where((p) => p['kind'] == 'user').length} workspace user(s) · ${data!['seatLimit']} total seats on this plan',
                      ),
                      const Text(
                        'Crew resources do not use login seats. Invite workspace users through Account → Team.',
                      ),
                      if (editable)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: FilledButton.icon(
                            onPressed: busy ? null : resource,
                            icon: const Icon(Icons.group_add_outlined),
                            label: const Text('Add crew resource'),
                          ),
                        ),
                      for (final p in people)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p['name']),
                                Text(
                                  p['kind'] == 'crew'
                                      ? 'Crew resource${p['linkedUid'] == null ? ' · No login' : ' · Linked to workspace user'}'
                                      : 'Workspace user',
                                ),
                                if (p['kind'] == 'crew' && editable)
                                  Wrap(
                                    spacing: 8,
                                    children: [
                                      TextButton(
                                        onPressed: busy
                                            ? null
                                            : () => resource(p),
                                        child: const Text('Edit name'),
                                      ),
                                      if (can('teamManagement') &&
                                          p['linkedUid'] == null)
                                        TextButton(
                                          onPressed: busy
                                              ? null
                                              : () => linkResource(p),
                                          child: const Text('Link team member'),
                                        ),
                                      TextButton(
                                        onPressed: busy
                                            ? null
                                            : () => change('saveResource', {
                                                'resourceId': p['id']
                                                    .toString()
                                                    .substring(5),
                                                'expectedVersion': p['version'],
                                                'name': p['name'],
                                                'status': 'inactive',
                                              }),
                                        child: const Text('Archive resource'),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ],
                ),
              ),
      ),
    ),
  );
}
