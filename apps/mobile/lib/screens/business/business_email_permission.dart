import 'package:flutter/material.dart';
import '../../services/business_email_service.dart';

Future<bool> recordEmailPermission(
  BuildContext context,
  BusinessEmailService service,
  Map contact,
) async {
  final evidence = TextEditingController();
  String status = 'requested', feedback = '';
  bool introduction = false, followup = false, busy = false;
  final result = await showDialog<bool>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setLocal) => AlertDialog(
        title: const Text('Record recipient permission'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${contact['name']} · ${contact['email']}'),
                const Text(
                  'Only record an actual request or consent from this recipient. A public address, researched lead, owner opt-in or CRM stage is not permission. Nothing is sent by saving this record.',
                ),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  items: const [
                    DropdownMenuItem(
                      value: 'requested',
                      child: Text('Recipient requested contact'),
                    ),
                    DropdownMenuItem(
                      value: 'consented',
                      child: Text('Recipient explicitly consented'),
                    ),
                    DropdownMenuItem(
                      value: 'revoked',
                      child: Text('Permission revoked'),
                    ),
                  ],
                  onChanged: busy ? null : (v) => setLocal(() => status = v!),
                ),
                CheckboxListTile(
                  value: introduction,
                  title: const Text('Requested introduction/information'),
                  onChanged: busy
                      ? null
                      : (v) => setLocal(() => introduction = v == true),
                ),
                CheckboxListTile(
                  value: followup,
                  title: const Text('Bounded follow-ups'),
                  onChanged: busy
                      ? null
                      : (v) => setLocal(() => followup = v == true),
                ),
                TextField(
                  controller: evidence,
                  minLines: 3,
                  maxLines: 6,
                  decoration: const InputDecoration(
                    labelText: 'Actual consent/request evidence and date',
                  ),
                ),
                if (feedback.isNotEmpty) Text(feedback),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: busy ? null : () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: busy
                ? null
                : () async {
                    setLocal(() => busy = true);
                    try {
                      await service.call('recordRecipientPermission', {
                        'customerId': contact['id'],
                        'expectedVersion': contact['version'],
                        'status': status,
                        'purposes': [
                          if (introduction) 'introduction',
                          if (followup) 'followup',
                        ],
                        'evidence': evidence.text,
                        'confirm': true,
                      });
                      if (dialog.mounted) Navigator.pop(dialog, true);
                    } catch (_) {
                      setLocal(() {
                        busy = false;
                        feedback =
                            'Permission was not saved. Verify the evidence and reload the current contact before retrying.';
                      });
                    }
                  },
            child: const Text('Confirm actual recipient permission'),
          ),
        ],
      ),
    ),
  );
  evidence.dispose();
  return result == true;
}
