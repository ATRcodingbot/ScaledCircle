import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import 'protected_route_gate.dart';

/// Keep a campaign's initial read stable across the workspace permission poll.
/// The surrounding route gate still checks access on every refresh, and the
/// campaign's own screen retains its live document subscription.
class CampaignRouteContent extends StatefulWidget {
  const CampaignRouteContent({
    super.key,
    required this.campaignId,
    required this.actorUid,
    this.workspaceId,
    required this.isAdmin,
    required this.fallbackRoute,
    required this.load,
    required this.builder,
  });

  final String campaignId, actorUid, fallbackRoute;
  final String? workspaceId;
  final bool isAdmin;
  final Future<DocumentSnapshot<Map<String, dynamic>>> Function() load;
  final Widget Function(DocumentSnapshot<Map<String, dynamic>>) builder;

  @override
  State<CampaignRouteContent> createState() => _CampaignRouteContentState();
}

class _CampaignRouteContentState extends State<CampaignRouteContent> {
  late Future<DocumentSnapshot<Map<String, dynamic>>> _campaign;

  @override
  void initState() {
    super.initState();
    _campaign = widget.load();
  }

  @override
  void didUpdateWidget(CampaignRouteContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.campaignId != widget.campaignId ||
        oldWidget.actorUid != widget.actorUid ||
        oldWidget.workspaceId != widget.workspaceId) {
      _campaign = widget.load();
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) => FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
    future: _campaign,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      final campaign = snapshot.data;
      // A hard-deleted document has no workspace fields, so the maintained
      // tenant rules may deny its read instead of returning a missing doc.
      // Use the same recovery for inaccessible IDs without revealing whether
      // another Business owns one. Network/service failures remain distinct.
      final error = snapshot.error;
      final unavailable =
          error is FirebaseException &&
          const {'permission-denied', 'not-found'}.contains(error.code);
      if (snapshot.hasError ||
          campaign == null ||
          !campaign.exists ||
          campaign.data()?['status'] == 'deleted') {
        return RouteRecoveryScreen(
          title: snapshot.hasError && !unavailable
              ? 'Campaign temporarily unavailable'
              : 'Campaign no longer available',
          destination: widget.isAdmin
              ? widget.fallbackRoute
              : '/business/campaigns',
          actionLabel: widget.isAdmin
              ? 'Return to Dashboard'
              : 'Return to Campaigns',
        );
      }
      if (!widget.isAdmin &&
          campaign.data()?['businessId'] !=
              (widget.workspaceId ?? widget.actorUid)) {
        return RouteRecoveryScreen(
          title: "You don't have access to this campaign.",
          destination: widget.fallbackRoute,
        );
      }
      return widget.builder(campaign);
    },
  );
}
