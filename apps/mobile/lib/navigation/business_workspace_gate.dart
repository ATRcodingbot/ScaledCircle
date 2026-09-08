import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../services/business_workspace_service.dart';
import '../widgets/authenticated_sign_out_button.dart';
import 'app_router.dart';

class BusinessWorkspaceGate extends StatefulWidget {
  const BusinessWorkspaceGate({
    super.key,
    required this.builder,
    required this.user,
    required this.profile,
  });
  final Widget Function(User, Map<String, dynamic>) builder;
  final User user;
  final Map<String, dynamic> profile;
  @override
  State<BusinessWorkspaceGate> createState() => _BusinessWorkspaceGateState();
}

class _BusinessWorkspaceGateState extends State<BusinessWorkspaceGate> {
  Map<String, dynamic>? _workspace;
  bool _failed = false, _refreshing = false;
  Timer? _accessTimer;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _membership;
  @override
  void initState() {
    super.initState();
    _load();
    _accessTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _reloadPermissions(),
    );
  }

  @override
  void dispose() {
    _membership?.cancel();
    _accessTimer?.cancel();
    super.dispose();
  }

  void _hidePrivateScreens() {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    });
  }

  Future<void> _load() async {
    try {
      final workspace = await BusinessWorkspaceService().context();
      if (!mounted) return;
      setState(() {
        _workspace = workspace;
        _failed = false;
      });
      if (workspace['isOwner'] != true && _membership == null) {
        _membership = FirebaseFirestore.instance
            .doc(
              'businessWorkspaces/${workspace['businessId']}/members/${widget.user.uid}',
            )
            .snapshots()
            .listen(
              (snapshot) {
                if (snapshot.metadata.isFromCache) return;
                if (snapshot.data()?['status'] != 'active') {
                  BusinessWorkspaceSession.clear();
                  _hidePrivateScreens();
                  if (mounted) {
                    setState(() {
                      _workspace = null;
                      _failed = true;
                    });
                  }
                } else {
                  _reloadPermissions();
                }
              },
              onError: (_) {
                BusinessWorkspaceSession.clear();
                _hidePrivateScreens();
                if (mounted) {
                  setState(() {
                    _workspace = null;
                    _failed = true;
                  });
                }
              },
            );
      }
    } catch (_) {
      BusinessWorkspaceSession.clear();
      _hidePrivateScreens();
      if (mounted) {
        setState(() {
          _workspace = null;
          _failed = true;
        });
      }
    }
  }

  Future<void> _reloadPermissions() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      final current = await BusinessWorkspaceService().context();
      if (mounted) {
        if (_workspace?['permissions'].toString() !=
            current['permissions'].toString()) {
          _hidePrivateScreens();
        }
        setState(() => _workspace = current);
      }
    } catch (_) {
      BusinessWorkspaceSession.clear();
      _hidePrivateScreens();
      if (mounted) {
        setState(() {
          _workspace = null;
          _failed = true;
        });
      }
    } finally {
      _refreshing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_workspace != null) {
      return KeyedSubtree(
        key: ValueKey(
          '${_workspace!['businessId']}:${_workspace!['permissions']}',
        ),
        child: widget.builder(widget.user, {
          ...widget.profile,
          'role': 'business',
          'activeView': 'business',
          'businessId': _workspace!['businessId'],
        }),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business workspace'),
        actions: const [AuthenticatedSignOutButton()],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_failed) ...[
                const Text(
                  'This workspace is unavailable or your access changed. No private information is shown.',
                ),
                FilledButton(onPressed: _load, child: const Text('Retry')),
                TextButton(
                  onPressed: () => AppNavigation.replace(context, '/'),
                  child: const Text('Return to account'),
                ),
              ] else ...[
                const CircularProgressIndicator(),
                const Text('Opening your Business…'),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
