import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/business_workspace_service.dart';
import '../screens/auth/complete_business_profile_screen.dart';

/// Read-only completion projection. Saving stays in the existing owner editor.
class BusinessProfileCompletion extends StatefulWidget {
  const BusinessProfileCompletion({
    super.key,
    required this.businessId,
    required this.actorUid,
    this.child,
    this.load,
    this.edit,
    this.onContinue,
  });
  final String businessId, actorUid;
  final Widget? child;
  final Future<Map<String, dynamic>> Function()? load;
  final Future<void> Function()? edit;
  final VoidCallback? onContinue;
  @override
  State<BusinessProfileCompletion> createState() =>
      BusinessProfileCompletionState();
}

class BusinessProfileCompletionState extends State<BusinessProfileCompletion> {
  Map<String, dynamic>? _status;
  bool _error = false, _busy = true, _saved = false, _continue = false;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    refresh();
  }

  @override
  void didUpdateWidget(covariant BusinessProfileCompletion oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.actorUid != widget.actorUid ||
        oldWidget.businessId != widget.businessId) {
      _saved = false;
      _continue = false;
      refresh();
    }
  }

  bool get _current =>
      widget.load != null ||
      (FirebaseAuth.instance.currentUser?.uid == widget.actorUid &&
          BusinessWorkspaceSession.businessIdFor(widget.actorUid) ==
              widget.businessId);
  Future<void> refresh() async {
    final generation = ++_generation;
    setState(() {
      _busy = true;
      _error = false;
      _status = null;
    });
    try {
      final result =
          await (widget.load?.call() ?? BusinessWorkspaceService().context());
      if (!mounted || generation != _generation || !_current) return;
      final status = result['profileCompletion'];
      if (result['actorUid'] != widget.actorUid ||
          result['businessId'] != widget.businessId ||
          status is! Map ||
          status['businessId'] != widget.businessId ||
          status['complete'] is! bool) {
        throw StateError('Completion authority unavailable');
      }
      setState(() {
        _status = Map<String, dynamic>.from(status);
        _busy = false;
      });
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() {
          _error = true;
          _busy = false;
        });
      }
    }
  }

  Future<void> _edit() async {
    if (!_current || _status?['canEdit'] != true) return;
    if (widget.edit != null) {
      await widget.edit!();
    } else {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (editorContext) => CompleteBusinessProfileScreen(
            editing: true,
            expectedBusinessId: widget.businessId,
            onCompleted: () => Navigator.of(editorContext).pop(),
          ),
        ),
      );
    }
    if (!mounted || !_current) return;
    _saved = true;
    await refresh();
  }

  Widget _presentCard(Widget card) =>
      widget.child == null ? card : SingleChildScrollView(child: card);
  @override
  Widget build(BuildContext context) {
    if (_status?['complete'] == true && !_busy && !_error) {
      if (widget.child != null && (!_saved || _continue)) return widget.child!;
      if (!_saved) return const SizedBox.shrink();
      return _presentCard(
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Business profile complete'),
                FilledButton(
                  onPressed: () {
                    if (!_current) return;
                    if (widget.child != null) {
                      setState(() => _continue = true);
                    } else {
                      widget.onContinue?.call();
                    }
                  },
                  child: const Text('Continue to campaign'),
                ),
              ],
            ),
          ),
        ),
      );
    }
    const labels = {
      'businessName': 'Business name',
      'businessDescription': 'About your Business',
      'servicesOffered': 'Services offered',
      'serviceAreas': 'Service locations',
    };
    return _presentCard(
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_busy)
                const Text('Checking business profile…')
              else if (_error) ...[
                const Text(
                  'We couldn’t check your business profile right now.',
                ),
                TextButton(onPressed: refresh, child: const Text('Retry')),
              ] else ...[
                Text(
                  'Complete your business profile',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Add your required business details and service locations to start creating campaigns.',
                ),
                if ((_status?['missingFields'] as List? ?? []).isNotEmpty)
                  Text(
                    'Still needed: ${(_status!["missingFields"] as List).map((f) => labels[f]).whereType<String>().join(", ")}',
                  ),
                if (_status?['canEdit'] == true)
                  FilledButton(
                    onPressed: _edit,
                    child: const Text('Complete profile'),
                  )
                else
                  const Text(
                    'Ask your Business owner to complete the profile.',
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
