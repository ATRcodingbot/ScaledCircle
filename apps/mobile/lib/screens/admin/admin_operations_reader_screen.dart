import 'package:flutter/material.dart';
import '../../services/admin_operations_service.dart';
import 'admin_role_gate.dart';
import 'admin_launch_overview.dart';
import 'admin_campaign_timeline_screen.dart';

class AdminOperationsReaderScreen extends StatefulWidget {
  const AdminOperationsReaderScreen({super.key});
  @override
  State<AdminOperationsReaderScreen> createState() => _ReaderState();
}

class _ReaderState extends State<AdminOperationsReaderScreen> {
  final service = AdminOperationsService();
  late Future<AdminOperationsSnapshot> pending = service.loadOverview(
    includeInternalWorkspace: false,
  );
  @override
  Widget build(BuildContext context) => AdminRoleGate(
    allowOperationsRead: true,
    builder: (_) => Scaffold(
      appBar: AppBar(
        title: const Text('Operations · Read only'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
            onPressed: () => setState(
              () => pending = service.loadOverview(
                includeInternalWorkspace: false,
              ),
            ),
          ),
        ],
      ),
      body: FutureBuilder<AdminOperationsSnapshot>(
        future: pending,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData) {
            return const Center(
              child: Text(
                'Operations access is unavailable. Ask your administrator to review your access.',
              ),
            );
          }
          final view = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Read-only platform operations. Workspace editing requires separately granted Team permissions.',
              ),
              if (view.partial)
                const Text(
                  'Some sources are unavailable. Counts are not complete.',
                ),
              for (final issue in view.exceptions)
                ListTile(
                  title: Text(issue.summary),
                  subtitle: Text(issue.recommendedAction),
                  onTap: issue.campaignId != null
                      ? () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => AdminCampaignTimelineScreen(
                              campaignId: issue.campaignId!,
                            ),
                          ),
                        )
                      : () => showDialog<void>(
                          context: context,
                          builder: (_) => AlertDialog(
                            title: Text(issue.summary),
                            content: SelectableText(
                              '${issue.recommendedAction}\nReference: ${issue.entityId ?? issue.id}',
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text('Close'),
                              ),
                            ],
                          ),
                        ),
                ),
              AdminLaunchOverview(data: view.launch),
            ],
          );
        },
      ),
    ),
  );
}
