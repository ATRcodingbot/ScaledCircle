import 'package:flutter/material.dart';

String socialProviderName(String provider) => switch (provider) {
  'facebook' => 'Facebook',
  'instagram' => 'Instagram',
  'youtube' => 'YouTube',
  'x' => 'X',
  _ => 'Social account',
};

bool socialAccountConnected(Map<String, dynamic> connection) => const [
  'connected_read_only',
  'connected_write',
].contains(connection['status']);

bool socialAnalyticsEnabled(Map<String, dynamic> connection) =>
    socialAccountConnected(connection) &&
    connection['requiresReconnect'] != true &&
    (connection['capabilities'] as Map? ?? const {})['analytics'] == true;

bool socialPublishingEnabled(
  Map<String, dynamic> connection,
  bool workspaceEnabled,
) {
  final capabilities = connection['capabilities'] as Map? ?? const {};
  final meta = const ['facebook', 'instagram'].contains(connection['provider']);
  return (meta
          ? connection['managedPublishingPermissionGranted'] == true
          : workspaceEnabled) &&
      connection['status'] == 'connected_write' &&
      connection['writeScopesGranted'] == true &&
      connection['requiresReconnect'] != true &&
      [
        'publishText',
        'publishImage',
        'publishVideo',
      ].any((key) => capabilities[key] == true);
}

/// Renders server capabilities only. It cannot grant access or infer it from a login.
class SocialConnectionCard extends StatelessWidget {
  const SocialConnectionCard({
    super.key,
    required this.connection,
    required this.publishingEnabled,
    required this.onConnect,
    required this.onContinue,
    required this.onChoose,
    required this.onCancel,
    required this.onManage,
    this.busy = false,
    this.onEnablePublishing,
  });

  final Map<String, dynamic> connection;
  final bool publishingEnabled;
  final bool busy;
  final VoidCallback? onEnablePublishing;
  final VoidCallback onConnect, onContinue, onChoose, onCancel, onManage;

  @override
  Widget build(BuildContext context) {
    final provider = connection['provider']?.toString() ?? '';
    final meta = provider == 'facebook' || provider == 'instagram';
    final status = connection['status'];
    final connected = socialAccountConnected(connection);
    final pending = ['authorizing', 'identity_pending'].contains(status);
    final needsPermission =
        connection['requiresReconnect'] == true ||
        [
          'expired',
          'revoked',
          'reauth_required',
          'attention_required',
          'write_scope_pending',
        ].contains(status);
    final failed = connection['customerMessage'] is String;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              socialProviderName(provider),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              connected
                  ? 'Connected'
                  : pending
                  ? 'Finish connecting'
                  : needsPermission
                  ? 'Needs permission'
                  : 'Not connected',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            if (connected) ...[
              const SizedBox(height: 4),
              Text(
                [
                  connection['accountDisplayName'],
                  connection['handle'],
                ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
              ),
              const SizedBox(height: 12),
              Text(
                'Analytics: ${socialAnalyticsEnabled(connection) ? 'On' : 'Off'}',
              ),
              Text(
                'Managed Publishing: ${socialPublishingEnabled(connection, publishingEnabled) ? 'Ready' : 'Off'}',
              ),
              if (!socialAnalyticsEnabled(connection))
                const Text('Additional permission needed for analytics.'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: busy ? null : onManage,
                child: const Text('Manage Connection'),
              ),
              if (onEnablePublishing != null &&
                  !socialPublishingEnabled(connection, publishingEnabled) &&
                  connection['pendingManagedPublishing'] != true)
                TextButton(
                  onPressed: busy ? null : onEnablePublishing,
                  child: const Text('Enable Managed Publishing'),
                ),
              if (connection['pendingManagedPublishing'] == true)
                Wrap(
                  children: [
                    TextButton(
                      onPressed: busy ? null : onContinue,
                      child: const Text('Continue with Facebook'),
                    ),
                    TextButton(
                      onPressed: busy ? null : onChoose,
                      child: const Text('Confirm Permissions'),
                    ),
                    TextButton(
                      onPressed: busy ? null : onCancel,
                      child: const Text('Cancel'),
                    ),
                  ],
                ),
            ] else if (pending) ...[
              const Text(
                'Finish the Facebook steps, then choose your Business Page.',
              ),
              Wrap(
                spacing: 4,
                children: [
                  TextButton(
                    onPressed: busy ? null : onContinue,
                    child: Text(
                      'Continue with ${socialProviderName(provider)}',
                    ),
                  ),
                  TextButton(
                    onPressed: busy ? null : onChoose,
                    child: Text(
                      meta ? 'Choose Business Page' : 'Choose account',
                    ),
                  ),
                  if (meta)
                    TextButton(
                      onPressed: busy ? null : onCancel,
                      child: const Text('Cancel connection'),
                    ),
                ],
              ),
            ] else ...[
              if (failed) const Text("Facebook wasn't connected. Try again."),
              if (needsPermission)
                const Text(
                  'ScaledCircle needs additional permission to use this account.',
                ),
              if (provider == 'instagram')
                const Text("Instagram isn't connected yet."),
              const SizedBox(height: 8),
              TextButton(
                onPressed: busy ? null : onConnect,
                child: Text(
                  needsPermission
                      ? 'Update Permissions'
                      : failed
                      ? 'Try Again'
                      : meta
                      ? 'Connect Facebook & Instagram'
                      : 'Connect ${socialProviderName(provider)}',
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class SocialAccountPicker extends StatelessWidget {
  const SocialAccountPicker({
    super.key,
    required this.candidates,
    required this.isMeta,
  });
  final List<Map<String, dynamic>> candidates;
  final bool isMeta;

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(isMeta ? 'Choose your Business Page' : 'Choose your account'),
    content: SizedBox(
      width: 520,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Choose the account that belongs to this Business. Connecting does not approve any posts.',
            ),
            const SizedBox(height: 12),
            for (final candidate in candidates)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        candidate['accountDisplayName']?.toString() ??
                            'Business account',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(isMeta ? 'Facebook Page' : 'Business account'),
                      if (isMeta)
                        Text(
                          (candidate['linkedHandle']?.toString() ?? '')
                                  .isNotEmpty
                              ? 'Linked Instagram: @${candidate['linkedHandle']}'
                              : "Instagram isn't connected yet.",
                        ),
                      const SizedBox(height: 8),
                      FilledButton.tonal(
                        onPressed: () => Navigator.pop(context, candidate),
                        child: Text(
                          'Connect ${candidate['accountDisplayName'] ?? 'this account'}',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
    ],
  );
}
