import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../services/business_operations_service.dart';

/// Read-only calendar until the owner explicitly saves through Schedule.
class AppointmentOfferDialog extends StatefulWidget {
  const AppointmentOfferDialog({
    super.key,
    required this.service,
    required this.businessId,
    required this.operationId,
    required this.inboundDigest,
    required this.customerId,
    this.existing,
  });
  final BusinessOperationsService service;
  final String businessId, operationId, inboundDigest, customerId;
  final Map? existing;
  @override
  State<AppointmentOfferDialog> createState() => _AppointmentOfferDialogState();
}

class _AppointmentOfferDialogState extends State<AppointmentOfferDialog> {
  Map<String, dynamic>? view;
  late final TextEditingController location;
  List<String>? assigned;
  String? day, error, requestId, fingerprint;
  Map<String, dynamic>? selected;
  bool loading = true, saving = false, automatic = false, uncertain = false;
  Map<String, dynamic>? pendingInput;
  String? pendingSummary;
  int visit = 0;
  @override
  void initState() {
    super.initState();
    location = TextEditingController(
      text: widget.existing?['location']?.toString() ?? '',
    );
    automatic = widget.existing?['emailLink']?['acceptanceCode'] != null;
    fetch();
  }

  @override
  void dispose() {
    visit++;
    location.dispose();
    super.dispose();
  }

  Future<void> fetch() async {
    final token = ++visit;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.service
          .call(widget.businessId, 'appointmentOptions', {
            if (day != null) 'date': day,
            if (assigned != null) 'assignedPeople': assigned,
            if (widget.existing != null) 'itemId': widget.existing!['id'],
          });
      if (!mounted || token != visit) return;
      final slots = operationRows(result['slots']);
      final desired = selected?['startMs'] ?? widget.existing?['startMs'];
      setState(() {
        view = result;
        day = result['selectedDate'].toString();
        assigned = (result['assignedPeople'] as List).cast<String>();
        selected = slots.where((s) => s['startMs'] == desired).firstOrNull;
        loading = false;
      });
    } catch (_) {
      if (mounted && token == visit) {
        setState(() {
          loading = false;
          error =
              'Availability could not be checked. Your details are kept. Retry before saving.';
        });
      }
    }
  }

  Future<void> save() async {
    if (saving ||
        (!uncertain && (loading || error != null || selected == null))) {
      return;
    }
    final availability = view!['availability'] as Map,
        settings = availability['settings'] as Map;
    if (!uncertain &&
        settings['locationRequired'] == true &&
        location.text.trim().isEmpty) {
      setState(
        () => error =
            'Enter the required meeting location, then retry availability.',
      );
      return;
    }
    final input = uncertain
        ? pendingInput!
        : <String, dynamic>{
            'expectedVersion': widget.existing?['version'] ?? 0,
            if (widget.existing != null) 'itemId': widget.existing!['id'],
            'item': {
              'title':
                  widget.existing?['title'] ?? 'Customer appointment offer',
              'type': widget.existing?['type'] ?? 'estimate',
              'customerId': widget.customerId,
              'startMs': selected!['startMs'],
              'durationMinutes': settings['durationMinutes'],
              'timeZone': settings['timeZone'],
              'assignedPeople': assigned,
              'location': location.text.trim(),
              'status': 'tentative',
              if (widget.existing?['notes'] != null)
                'notes': widget.existing!['notes'],
            },
            'emailConversation': {
              'operationId': widget.operationId,
              'inboundDigest': widget.inboundDigest,
              'availabilityVersion': availability['version'],
              'authorizeAcceptedSlot': automatic,
            },
          };
    final value = jsonEncode(input);
    if (value != fingerprint) {
      fingerprint = value;
      requestId = widget.service.requestId();
    }
    pendingInput = input;
    pendingSummary ??= selected?['summary']?.toString();
    if (!uncertain) pendingSummary = selected!['summary'].toString();
    setState(() => saving = true);
    try {
      final result = await widget.service.call(
        widget.businessId,
        'saveItem',
        input,
        requestId: requestId,
      );
      if (mounted) {
        Navigator.pop(context, {...result, 'summary': pendingSummary});
      }
    } catch (e) {
      if (!mounted) return;
      // Retain the same request ID/payload for uncertain outcomes. A retry cannot
      // create a second offer; changed inputs receive their own request identity.
      setState(() {
        saving = false;
        uncertain =
            e is! FirebaseFunctionsException ||
            ![
              'aborted',
              'failed-precondition',
              'invalid-argument',
              'permission-denied',
              'not-found',
              'already-exists',
            ].contains(e.code);
        error = e is FirebaseFunctionsException && e.code == 'aborted'
            ? 'The appointment, conversation or availability changed. Close this picker and reload the saved conversation before retrying. Your meeting details remain here.'
            : e is FirebaseFunctionsException && e.code == 'failed-precondition'
            ? '${e.message ?? 'This time could not be saved.'} Retry availability to see current alternatives. Nothing was sent.'
            : 'Save was not confirmed. Check the same save request before changing the offer. No email was sent.';
      });
    }
  }

  String key(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  Widget calendar() {
    final chosen = DateTime.parse(day!), today = DateTime.parse(view!['today']);
    final month = DateTime(chosen.year, chosen.month),
        count = DateTime(chosen.year, chosen.month + 1, 0).day;
    final marks = (view!['datesWithAppointments'] as List).cast<String>();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            IconButton(
              tooltip: 'Previous month',
              onPressed: saving || uncertain
                  ? null
                  : () => changeDay(DateTime(month.year, month.month - 1, 1)),
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: Text(
                MaterialLocalizations.of(context).formatMonthYear(month),
                textAlign: TextAlign.center,
              ),
            ),
            IconButton(
              tooltip: 'Next month',
              onPressed: saving || uncertain
                  ? null
                  : () => changeDay(DateTime(month.year, month.month + 1, 1)),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        const Text(
          'Dates marked • contain Schedule items. Select a date to inspect them.',
        ),
        LayoutBuilder(
          builder: (context, c) => Wrap(
            children: [
              for (final name in [
                'Mon',
                'Tue',
                'Wed',
                'Thu',
                'Fri',
                'Sat',
                'Sun',
              ])
                SizedBox(
                  width: c.maxWidth / 7,
                  child: Text(name, textAlign: TextAlign.center),
                ),
              for (int i = 1; i < month.weekday; i++)
                SizedBox(width: c.maxWidth / 7, height: 48),
              for (int i = 1; i <= count; i++)
                SizedBox(
                  width: c.maxWidth / 7,
                  child: TextButton(
                    style: TextButton.styleFrom(
                      backgroundColor: i == chosen.day
                          ? Theme.of(context).colorScheme.secondaryContainer
                          : null,
                      minimumSize: const Size(44, 48),
                      padding: EdgeInsets.zero,
                    ),
                    onPressed: saving || uncertain
                        ? null
                        : () => changeDay(DateTime(month.year, month.month, i)),
                    child: Semantics(
                      label:
                          '${MaterialLocalizations.of(context).formatFullDate(DateTime(month.year, month.month, i))}${marks.contains(key(DateTime(month.year, month.month, i))) ? ', contains appointments' : ''}',
                      selected: i == chosen.day,
                      child: Text(
                        '$i${marks.contains(key(DateTime(month.year, month.month, i))) ? ' •' : ''}',
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Text(
          'Business date today: ${MaterialLocalizations.of(context).formatMediumDate(today)}',
        ),
        const SizedBox(height: 12),
        if (widget.existing != null && selected == null)
          const Text(
            'The saved time is not currently available. Choose a valid alternative to edit this same offer.',
          ),
        if (!loading && error == null)
          DropdownButtonFormField<int>(
            key: ValueKey(
              '$day-${assigned.toString()}-${selected?['startMs']}',
            ),
            initialValue: selected?['startMs'] as int?,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Available start and end time',
            ),
            items: operationRows(view!['slots'])
                .map(
                  (s) => DropdownMenuItem<int>(
                    value: s['startMs'] as int,
                    child: Text(s['label'].toString()),
                  ),
                )
                .toList(),
            onChanged: saving || uncertain
                ? null
                : (value) => setState(
                    () => selected = operationRows(
                      view!['slots'],
                    ).firstWhere((s) => s['startMs'] == value),
                  ),
          ),
        if (!loading && error == null && operationRows(view!['slots']).isEmpty)
          const Text(
            'No available times on this day within your saved hours and current Schedule.',
          ),
      ],
    );
  }

  void changeDay(DateTime value) {
    day = key(value);
    selected = null;
    fetch();
  }

  Widget agenda() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'Schedule for selected day',
        style: TextStyle(fontWeight: FontWeight.bold),
      ),
      if (loading)
        const Text('Checking availability…')
      else if (error != null)
        const Text('Availability unavailable — not confirmed free.')
      else if (operationRows(view!['agenda']).isEmpty)
        const Text('No active appointments on this date.')
      else
        for (final item in operationRows(view!['agenda']))
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item['title'].toString()),
                  Text(item['label'].toString()),
                  Text(item['status'].toString()),
                  Text(
                    (item['assignedLabels'] as List).isEmpty
                        ? 'Assign later — Business-level commitment'
                        : (item['assignedLabels'] as List).join(', '),
                  ),
                  if (item['bufferMinutes'] != 0)
                    Text('${item['bufferMinutes']} minutes before and after'),
                  if (item['editing'] == true)
                    const Text('This is the offer being edited'),
                ],
              ),
            ),
          ),
    ],
  );
  @override
  Widget build(BuildContext context) {
    final settings = view?['availability']?['settings'] as Map?;
    return PopScope(
      canPop: !saving,
      child: AlertDialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
        contentPadding: const EdgeInsets.all(16),
        title: Text(
          widget.existing == null
              ? 'Offer a tentative appointment'
              : 'Edit tentative offer',
        ),
        content: SizedBox(
          width: 900,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (settings != null) ...[
                  if (view?['savedOffer'] != null)
                    Text(
                      'Saved offer: ${view!['savedOffer']['startLabel']} (${view!['savedOffer']['timeZone']}), ${view!['savedOffer']['durationMinutes']} minutes. Changes save to this same appointment.',
                    ),
                  Text(
                    '${settings['timeZone']} • ${settings['durationMinutes']} minutes • ${settings['bufferMinutes']} minutes before and after',
                  ),
                  const SizedBox(height: 12),
                  const Text('Staff'),
                  if ((settings['assignedPeople'] as List).isEmpty)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Assign later'),
                      value: assigned?.isEmpty == true,
                      onChanged: loading || saving || uncertain
                          ? null
                          : (value) {
                              if (value == true) {
                                assigned = [];
                                selected = null;
                                fetch();
                              }
                            },
                    ),
                  for (final person in operationRows(view!['people']))
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(person['name'].toString()),
                      value: assigned?.contains(person['id']) == true,
                      onChanged: loading || saving || uncertain
                          ? null
                          : (v) {
                              final next = [...?assigned];
                              if (v == true) {
                                next.add(person['id'].toString());
                              } else {
                                next.remove(person['id']);
                              }
                              assigned = next;
                              selected = null;
                              fetch();
                            },
                    ),
                  LayoutBuilder(
                    builder: (context, c) =>
                        c.maxWidth >= 650 &&
                            MediaQuery.textScalerOf(context).scale(14) <= 21
                        ? Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: calendar()),
                              const SizedBox(width: 24),
                              Expanded(child: agenda()),
                            ],
                          )
                        : Column(
                            children: [
                              calendar(),
                              const SizedBox(height: 20),
                              agenda(),
                            ],
                          ),
                  ),
                  TextField(
                    controller: location,
                    enabled: !saving && !uncertain,
                    decoration: InputDecoration(
                      labelText: settings['locationRequired'] == true
                          ? 'Meeting location / details (required)'
                          : 'Meeting location / details (optional)',
                    ),
                  ),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: automatic,
                    onChanged: saving || uncertain
                        ? null
                        : (v) => setState(() => automatic = v == true),
                    title: const Text(
                      'Allow this exact slot to confirm on the customer’s explicit acceptance',
                    ),
                    subtitle: const Text(
                      'Requires your saved booking authority and an assigned available person.',
                    ),
                  ),
                  if (selected != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text('Proposed offer: ${selected!['summary']}'),
                    ),
                ],
                if (loading)
                  const LinearProgressIndicator(
                    semanticsLabel: 'Checking Schedule availability',
                  ),
                if (error != null) ...[
                  Text(error!, semanticsLabel: error),
                  TextButton(
                    onPressed: saving || uncertain ? null : fetch,
                    child: const Text('Retry availability'),
                  ),
                ],
                const Text(
                  'Creates a tentative offer in Schedule. It is not confirmed and no email is sent until you review and send the offer.',
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: saving || uncertain
                ? null
                : () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed:
                saving ||
                    (!uncertain &&
                        (loading || error != null || selected == null))
                ? null
                : save,
            child: Text(
              saving
                  ? 'Saving...'
                  : uncertain
                  ? 'Check saved offer'
                  : 'Save tentative offer',
            ),
          ),
        ],
      ),
    );
  }
}
