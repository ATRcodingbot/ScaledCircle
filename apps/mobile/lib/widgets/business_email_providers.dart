import 'package:flutter/material.dart';
import 'dart:math';

/// Provider names never imply permission, sender verification or readiness.
class BusinessEmailProviders extends StatelessWidget {
  const BusinessEmailProviders({
    super.key,
    required this.providers,
    required this.connection,
    required this.busy,
    required this.read,
    required this.send,
    required this.onConnect,
  });
  final List<Map> providers;
  final Map connection;
  final bool busy, read, send;
  final Future<void> Function(String, Map<String, dynamic>) onConnect;

  Future<void> _other(BuildContext context, Map provider) async {
    final settings = provider['settings'] as Map? ?? {};
    var password = '';
    try {
      final requestId = List.generate(
        24,
        (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
      final result = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('Set up Business Email'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Private Beta — Setup Testing'),
                  const Text(
                    'Use a provider-generated app password where available. Your provider must support secure connections.',
                  ),
                  const SizedBox(height: 12),
                  for (final field in [
                    ('Email address', 'email'),
                    ('Username', 'username'),
                    if (read) ...[
                      ('Incoming mail server', 'imapHost'),
                      ('IMAP port', 'imapPort'),
                    ],
                    if (send) ...[
                      ('Outgoing mail server', 'smtpHost'),
                      ('SMTP port', 'smtpPort'),
                    ],
                  ])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '${field.$1}: ${settings[field.$2] ?? 'Setup needed'}',
                      ),
                    ),
                  const Text(
                    'These provider settings have been reviewed for this private test. Contact support if they differ from your mailbox provider.',
                  ),
                  TextField(
                    onChanged: (value) => password = value,
                    obscureText: true,
                    autocorrect: false,
                    enableSuggestions: false,
                    maxLength: 1024,
                    decoration: const InputDecoration(
                      labelText: 'Secure / app password',
                    ),
                  ),
                  Text(
                    'Read leads: ${read ? 'On' : 'Off'} · Send approved email: ${send ? 'Requested' : 'Off'}',
                  ),
                  const Text(
                    'Automatic sending stays off. Checking the connection sends no message.',
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, <String, dynamic>{
                ...Map<String, dynamic>.from(settings),
                'requestId': requestId,
                'read': read,
                'send': send,
                'password': password,
              }),
              child: const Text('Check mailbox connection'),
            ),
          ],
        ),
      );
      if (result != null) {
        password = '';
        try {
          await onConnect('connectOther', result);
        } finally {
          result.remove('password');
        }
      }
    } finally {
      password = '';
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text('Choose your email provider'),
      const Text(
        'A custom-domain address can use Google Workspace, Microsoft 365 or another provider. Choose the company that hosts your mailbox.',
      ),
      for (final provider in providers)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  provider['label'].toString(),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  provider['status'] == 'connection_limited'
                      ? 'Connection temporarily limited · Google verification pending'
                      : provider['status'] == 'setup_testing'
                      ? 'Private Beta — Setup Testing'
                      : provider['status'] == 'available'
                      ? 'Available · Production conversation verified'
                      : 'Private Beta · Google round trip verified in staging',
                ),
                if (provider['configured'] != true)
                  const Text(
                    'Setup testing requires an invited test mailbox and reviewed provider configuration.',
                  ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton(
                    onPressed:
                        busy || provider['configured'] != true || !read && !send
                        ? null
                        : () => provider['id'] == 'other'
                              ? _other(context, provider)
                              : onConnect('connect', {
                                  'provider': provider['id'],
                                  'read': read,
                                  'send': send,
                                }),
                    child: Text(
                      provider['id'] == 'other'
                          ? 'Set Up'
                          : connection['status'] == 'connected' &&
                                (connection['provider'] ?? 'google') ==
                                    provider['id']
                          ? 'Update permissions'
                          : provider['id'] == 'google'
                          ? 'Continue with Google'
                          : 'Continue with Microsoft',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}
