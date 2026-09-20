import 'package:flutter/material.dart';
import '../navigation/app_router.dart';

/// Research is not consent. The server must explicitly project send eligibility.
class GrowthProspectEmailAction extends StatelessWidget {
  const GrowthProspectEmailAction({
    super.key,
    required this.prospect,
    this.mailbox,
  });
  final Map prospect;
  final Map? mailbox;

  @override
  Widget build(BuildContext context) {
    final email = '${prospect['email'] ?? ''}'.trim().toLowerCase();
    final operations = (mailbox?['operations'] as List? ?? const [])
        .whereType<Map>()
        .where((op) => email.isNotEmpty && op['recipient'] == email)
        .toList();
    operations.sort(
      (a, b) => ((b['requestedAt'] as num?) ?? 0).compareTo(
        (a['requestedAt'] as num?) ?? 0,
      ),
    );
    final op = operations.firstOrNull;
    final blocked =
        prospect['doNotContact'] == true ||
        prospect['approvalState'] == 'do_not_contact';
    final message = blocked
        ? 'Do not contact'
        : op != null
        ? (op['replyCount'] ?? 0) > 0
              ? 'Needs your reply — open the saved conversation'
              : op['state'] == 'sent'
              ? 'Awaiting reply — accepted by the email provider'
              : 'Existing message needs checking — do not resend'
        : email.isEmpty
        ? 'No verified email route. Review the published contact information.'
                : prospect['qualified'] != true
                ? 'More research needed before contacting this account.'
                : prospect['emailEligibility'] == 'eligible'
                ? 'Review the eligible message before sending.'
                : 'Recipient email permission must be verified. A public listing is not consent.';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(message),
        if (op != null && mailbox?['available'] == true)
          OutlinedButton.icon(
            icon: const Icon(Icons.forum_outlined),
            label: const Text('Open conversation'),
            onPressed: () => AppNavigation.push(
              context,
              '/business/email-connection?operation=${Uri.encodeQueryComponent('${op['id']}')}',
            ),
          ),
        if (mailbox == null)
          TextButton(
            onPressed: () =>
                AppNavigation.push(context, '/business/email-connection'),
            child: const Text('Open Business Email'),
          ),
      ],
    );
  }
}
