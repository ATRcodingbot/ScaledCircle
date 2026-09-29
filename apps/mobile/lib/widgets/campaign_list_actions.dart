import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../services/business_operations_service.dart';
import '../services/business_workspace_service.dart';

typedef CampaignActionCall =
    Future<Map<String, dynamic>> Function(
      String operation,
      Map<String, dynamic> input,
      String? requestId,
    );

const campaignActionLabels = {
  'delete': 'Delete draft',
  'close': 'Cancel campaign',
  'archive': 'Archive',
  'restore': 'Restore to list',
};

bool campaignInList(Map<String, dynamic> data, {required bool archived}) =>
    data['status'] != 'deleted' &&
    (archived
        ? data['archived'] == true
        : data['archived'] != true &&
              data['hiddenFromBusinessHistory'] != true);

/// The overflow never navigates the enclosing campaign card. Actions and the
/// confirmation's version come from current server authority, not list labels.
class CampaignListActions extends StatefulWidget {
  const CampaignListActions({
    super.key,
    required this.businessId,
    required this.campaignId,
    required this.onManage,
    this.call,
    this.sessionKey,
    this.directAction,
    this.onConfirmed,
  });
  final String businessId, campaignId;
  final VoidCallback onManage;
  final CampaignActionCall? call;
  final Object? Function()? sessionKey;
  final String? directAction;
  final VoidCallback? onConfirmed;
  @override
  State<CampaignListActions> createState() => _CampaignListActionsState();
}

class _CampaignListActionsState extends State<CampaignListActions> {
  bool _loading = false;
  Object? _session() {
    if (widget.sessionKey != null) return widget.sessionKey!();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final workspace = BusinessWorkspaceSession.value;
    final permissions =
        (workspace?['permissions'] as List? ?? [])
            .map((permission) => permission.toString())
            .toList()
          ..sort();
    // Equivalent permission refreshes retain a confirmation. Account, workspace
    // or authority changes invalidate it; execution still rechecks server access.
    return (
      uid,
      workspace?['actorUid'],
      BusinessWorkspaceSession.businessIdFor(uid ?? ''),
      workspace?['isOwner'],
      permissions.join('|'),
    );
  }

  Future<void> _open() async {
    final owner = _session();
    final session = widget.sessionKey ?? _session;
    final service = BusinessOperationsService();
    final businessId = widget.businessId, campaignId = widget.campaignId;
    final call =
        widget.call ??
        (op, input, key) => service.call(businessId, op, input, requestId: key);
    setState(() => _loading = true);
    try {
      final state = await call('campaignListActions', {
        'campaignId': campaignId,
      }, null);
      if (!mounted || session() != owner) return;
      final name = state['name'] as String? ?? 'Untitled Campaign';
      final selected =
          widget.directAction != null &&
              (state['actions'] as List? ?? []).contains(widget.directAction)
          ? widget.directAction
          : await showDialog<String>(
              context: context,
              builder: (context) => AlertDialog(
                title: Text('Actions for $name'),
                scrollable: true,
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if ((state['reason'] as String? ?? '').isNotEmpty)
                      Text(state['reason'] as String),
                    for (final action
                        in (state['actions'] as List? ?? []).where(
                          campaignActionLabels.containsKey,
                        ))
                      TextButton(
                        onPressed: () => Navigator.pop(context, action),
                        child: Text(campaignActionLabels[action]!),
                      ),
                    TextButton(
                      onPressed: () => Navigator.pop(context, 'manage'),
                      child: const Text('Open campaign / Manage work'),
                    ),
                  ],
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                ],
              ),
            );
      if (!mounted || session() != owner || selected == null) return;
      if (selected == 'manage') {
        widget.onManage();
        return;
      }
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _CampaignActionConfirmation(
          name: name,
          action: selected,
          state: state,
          currentSession: () => session() == owner,
          onConfirmed: widget.onConfirmed,
          submit: () => call('changeCampaignListState', {
            'campaignId': campaignId,
            'action': selected,
            'expectedVersion': state['version'],
          }, requestId),
        ),
      );
    } on FirebaseFunctionsException catch (error) {
      if (mounted && session() == owner) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message ?? 'Actions unavailable. Try again.'),
          ),
        );
      }
    } catch (_) {
      if (mounted && session() == owner) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Actions unavailable. The campaign is unchanged. Try again.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // One logical request survives uncertain replies within the confirmation.
  late String requestId;
  @override
  Widget build(BuildContext context) => widget.directAction != null
      ? FilledButton.icon(
          onPressed: _loading
              ? null
              : () {
                  requestId = BusinessOperationsService().requestId();
                  _open();
                },
          icon: const Icon(Icons.delete_outline),
          label: Text(_loading ? 'Checking campaign…' : 'Delete Draft'),
        )
      : IconButton(
          tooltip: 'Campaign actions',
          onPressed: _loading
              ? null
              : () {
                  requestId = BusinessOperationsService().requestId();
                  _open();
                },
          icon: Icon(_loading ? Icons.hourglass_empty : Icons.more_vert),
        );
}

class _CampaignActionConfirmation extends StatefulWidget {
  const _CampaignActionConfirmation({
    required this.name,
    required this.action,
    required this.state,
    required this.submit,
    required this.currentSession,
    this.onConfirmed,
  });
  final String name, action;
  final Map<String, dynamic> state;
  final Future<Map<String, dynamic>> Function() submit;
  final bool Function() currentSession;
  final VoidCallback? onConfirmed;
  @override
  State<_CampaignActionConfirmation> createState() =>
      _CampaignActionConfirmationState();
}

class _CampaignActionConfirmationState
    extends State<_CampaignActionConfirmation> {
  bool _pending = false, _confirmed = false;
  String? _error;
  Future<void> _submit() async {
    if (!widget.currentSession()) {
      Navigator.pop(context);
      return;
    }
    setState(() {
      _pending = true;
      _error = null;
    });
    try {
      final result = await widget.submit();
      if (!mounted) return;
      if (!widget.currentSession()) {
        Navigator.pop(context);
        return;
      }
      if (result['confirmed'] != true) throw StateError('Unconfirmed');
      if (widget.onConfirmed != null) {
        Navigator.pop(context);
        widget.onConfirmed!();
        return;
      }
      setState(() => _confirmed = true);
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) return;
      if (!widget.currentSession()) {
        Navigator.pop(context);
        return;
      }
      setState(
        () => _error =
            error.message ??
            'Not confirmed. Retry safely or close and refresh the list.',
      );
    } catch (_) {
      if (!mounted) return;
      if (!widget.currentSession()) {
        Navigator.pop(context);
        return;
      }
      setState(
        () => _error =
            'The result is not confirmed. Retry safely or close and refresh the list.',
      );
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = campaignActionLabels[widget.action]!;
    return AlertDialog(
      title: Text(
        _confirmed
            ? '$label confirmed'
            : '${widget.action == 'delete' ? 'Delete' : label} ‘${widget.name}’?',
      ),
      scrollable: true,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _confirmed
                ? 'The server confirmed this change.'
                : switch (widget.action) {
                    'delete' =>
                      'This removes this unfinished draft. Required audit history and shared assets are retained.',
                    'close' => widget.state['financialNotice'] as String,
                    'archive' =>
                      'Move this completed campaign to Archived. Work history and outstanding payment obligations remain available.',
                    _ =>
                      'Return this campaign to the list without reopening its work.',
                  },
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!, semanticsLabel: _error),
            ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _pending ? null : () => Navigator.pop(context),
          child: Text(_confirmed ? 'Done' : 'Cancel'),
        ),
        if (!_confirmed)
          FilledButton(
            onPressed: _pending ? null : _submit,
            child: Text(
              _pending
                  ? 'Confirming…'
                  : _error == null
                  ? label
                  : 'Retry safely',
            ),
          ),
      ],
    );
  }
}
