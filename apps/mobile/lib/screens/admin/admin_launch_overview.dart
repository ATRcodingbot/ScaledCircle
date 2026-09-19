import 'package:flutter/material.dart';

/// Read-only summaries. Actions delegate to existing authorized Admin screens.
class AdminLaunchOverview extends StatelessWidget {
  const AdminLaunchOverview({
    required this.data,
    this.onBilling,
    this.onProviders,
    this.onAgents,
    this.onSocial,
    super.key,
  });
  final Map<String, dynamic> data;
  final VoidCallback? onBilling, onProviders;
  final VoidCallback? onAgents, onSocial;
  Map<String, dynamic> map(Object? v) =>
      v is Map ? Map<String, dynamic>.from(v) : {};
  String count(Object? v) => v is num ? '$v' : 'Unavailable';
  String state(Object? v) => switch (v) {
    'completed' || 'complete' || 'healthy' || 'connected' => 'Healthy',
    'active' => 'Authorized',
    'available' => 'Saved status available',
    'paused' => 'Paused',
    'stale_lease' => 'Needs attention: previous run has not cleared',
    'connected_write' => 'Connected for publishing',
    'connected_read' => 'Connected for analytics',
    'not_authorized' => 'Automatic publishing not authorized',
    'running' || 'preparing' => 'Running',
    'held' => 'Held',
    'failed' || 'needs_attention' => 'Needs attention',
    'not_run' => 'No completed run recorded',
    _ => 'Unavailable',
  };
  String date(Object? v) => v is num
      ? DateTime.fromMillisecondsSinceEpoch(
          v.toInt(),
        ).toLocal().toString().split('.').first
      : 'Unavailable';
  Widget section(
    String title,
    List<Widget> children, {
    VoidCallback? action,
    String? actionLabel,
  }) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          ...children,
          if (action != null)
            TextButton(
              onPressed: action,
              child: Text(actionLabel ?? 'Open details'),
            ),
        ],
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final billing = map(data['billing']), email = map(data['email']);
    final runtime = map(data['runtime']), release = map(data['release']);
    final businesses = data['businesses'] is List
        ? data['businesses'] as List
        : const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section('Marketplace readiness', [
          Text('New paid work: ${state(data['paidWork'])}'),
          if (data['payoutCertification'] is Map) ...[
            const Text(
              'LIVE Connect setup, genuine Scaler onboarding and payout readiness: Founder certified.',
            ),
            const Text('LIVE earning → cash-out → bank receipt: pending.'),
            const Text(
              'Certification history is not a live provider-readiness override.',
            ),
          ] else
            const Text('Payout certification evidence unavailable.'),
        ]),
        section(
          'Billing and accounts',
          [
            Text('Active memberships: ${count(billing['active'])}'),
            Text('Complimentary memberships: ${count(billing['comped'])}'),
            Text('Payment issues: ${count(billing['paymentIssues'])}'),
            Text('Team seat/access issues: ${count(billing['teamIssues'])}'),
            Text(
              'Cancellation scheduled: ${count(billing['cancellationScheduled'])}',
            ),
            Text(
              'Reconciliation issues: ${count(billing['reconciliationIssues'])}',
            ),
            const Text(
              'Customer payments, worker reserves and platform revenue are separate. No gross-payment revenue total is inferred.',
            ),
          ],
          action: onBilling,
          actionLabel: 'Review subscriptions',
        ),
        section(
          'ScaledCircle internal Growth',
          [
            Text('Research: ${state(map(data['internalGrowth'])['status'])}'),
            Text(
              'Last run: ${date(map(map(data['internalGrowth'])['lastRun'])['completedAt'])}',
            ),
            Text(
              'Result: ${state(map(map(data['internalGrowth'])['lastRun'])['status'])}',
            ),
            Text(
              'New: ${count(map(map(data['internalGrowth'])['lastRun'])['newProspectCount'])} · Duplicates: ${count(map(map(data['internalGrowth'])['lastRun'])['duplicatesExcludedCount'])} · Unavailable sources: ${count(map(map(data['internalGrowth'])['lastRun'])['unavailableSources'])}',
            ),
            Text(
              'Next eligible research: ${date(map(data['internalGrowth'])['nextResearchAfter'])}',
            ),
            Text(
              'Awaiting review: ${count(map(map(data['internalGrowth'])['summary'])['awaitingApproval'])}',
            ),
            const Text(
              'Separate internal workspace. Its results do not certify Attractive Remodel research.',
            ),
          ],
          action: onAgents,
          actionLabel: 'Open internal Growth workspace',
        ),
        section('Growth and Social workspaces', [
          if (businesses.isEmpty)
            const Text('No workspace run summaries available.'),
          for (final item in businesses)
            Builder(
              builder: (context) {
                final b = map(item),
                    r = map(b['research']),
                    s = map(b['social']);
                return ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: Text(b['name'] as String? ?? 'Business workspace'),
                  subtitle: Text(
                    'Research: ${state(r['status'])} • Social: ${state(s['authorization'])}',
                  ),
                  children: [
                    ListTile(
                      title: Text('Last research: ${date(r['lastRunAt'])}'),
                      subtitle: Text(
                        'Next eligible run: ${date(r['nextRunAt'])}\nNew opportunities: ${count(r['newOpportunities'])} • Duplicates suppressed: ${count(r['duplicatesSuppressed'])}\nSource checks: ${count(r['sourceChecks'])} • Unavailable sources: ${count(r['unavailableSources'])}',
                      ),
                    ),
                    const Text(
                      'A completed cycle with zero new opportunities is a valid result.',
                    ),
                    ListTile(
                      title: Text('Social worker: ${state(s['workerStatus'])}'),
                      subtitle: Text(
                        'Last completed: ${date(s['lastRunAt'])}\nNext worker invocation: ${s['nextWorkerRun'] ?? 'Unavailable'}\nScheduled: ${count(s['scheduled'])} • Publishing: ${count(s['publishing'])}\nPublished: ${count(s['published'])} • Needs attention: ${count(s['needsAttention'])}',
                      ),
                    ),
                    Text(
                      'Scheduled under current strategy: ${count(s['managedScheduled'])}',
                    ),
                    const Text(
                      'Counts include historical/manual posts; they do not certify autonomous publication.',
                    ),
                    for (final connection
                        in (s['connections'] as List? ?? const []))
                      Text(
                        '${map(connection)['provider'] == 'instagram' ? 'Instagram' : 'Facebook'}: ${state(map(connection)['status'])}',
                      ),
                    ExpansionTile(
                      title: const Text('Technical evidence'),
                      children: [
                        SelectableText(
                          'Workspace: ${b['businessId']}\nResearch run: ${r['runId'] ?? 'Unavailable'}',
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
          const Text(
            'ScaledCircle internal research uses its separate internal workspace. Review it in Growth operations; it is not inferred from Attractive Remodel.',
          ),
          if (onAgents != null)
            TextButton(
              onPressed: onAgents,
              child: const Text('Open Growth operations'),
            ),
          if (onSocial != null)
            TextButton(
              onPressed: onSocial,
              child: const Text('Open Social operations'),
            ),
        ]),
        section(
          'Email and provider readiness',
          [
            Text(
              email['branding'] == 'verified_checkpoint'
                  ? 'Google branding: verified at the maintained launch checkpoint.'
                  : 'Google branding: unavailable.',
            ),
            const Text(
              'Gmail restricted-scope review remains pending. Founder demo video and external review are required before general customer onboarding.',
            ),
            if (email['mailboxes'] is List)
              for (final mailbox in email['mailboxes'] as List)
                Text(
                  'Saved mailbox connection: ${state(map(mailbox)['health'])}',
                ),
            const Text(
              'Saved connection status is not a fresh provider probe.',
            ),
            Text(
              'Notification delivery issues: ${count(data['notificationFailures'])}',
            ),
          ],
          action: onProviders,
          actionLabel: 'Review provider configuration',
        ),
        section('Release evidence', [
          Text('Control-plane readback: ${date(runtime['checkedAt'])}'),
          Text('Hosting: ${runtime['hostingVersion'] ?? 'Unavailable'}'),
          Text(
            'Hosting source: ${runtime['hostingSource'] ?? 'Unavailable in release metadata'}',
          ),
          Text('Rules: ${runtime['rulesVersion'] ?? 'Unavailable'}'),
          Text(
            'Function inventory: ${runtime['functions'] is List ? (runtime['functions'] as List).length : 'Unavailable'}',
          ),
          Text('Native checkpoint: ${release['checkedAt'] ?? 'Unavailable'}'),
          Text(
            'iOS: ${map(release['ios'])['version'] ?? 'Unavailable'} (${map(release['ios'])['build'] ?? '-'}) · ${map(release['ios'])['state'] ?? 'Unavailable'}',
          ),
          Text(
            'Android: ${map(release['android'])['version'] ?? 'Unavailable'} (${map(release['android'])['build'] ?? '-'}) · ${map(release['android'])['state'] ?? 'Unavailable'}',
          ),
          Text(release['note'] as String? ?? 'Native evidence unavailable.'),
          for (final blocker in (release['blockers'] as List? ?? const []))
            Text('Remaining: $blocker'),
          ExpansionTile(
            title: const Text('Function revisions and scheduled workers'),
            children: [
              for (final f in (runtime['functions'] as List? ?? const []))
                Text(
                  '${map(f)['name']}: ${map(f)['state']} · ${map(f)['revision'] ?? 'Unavailable'}',
                ),
              for (final w in (runtime['workers'] as List? ?? const []))
                Text(
                  '${map(w)['name']}: ${map(w)['state']} · Next: ${map(w)['nextRunAt'] ?? 'Unavailable'}',
                ),
            ],
          ),
        ]),
      ],
    );
  }
}
