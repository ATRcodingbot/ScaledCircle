import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../services/business_workspace_service.dart';
import '../widgets/authenticated_sign_out_button.dart';
import 'app_router.dart';
import 'workspace_presentation.dart';
import '../screens/business/business_member_home.dart';
import '../screens/business/business_schedule_screen.dart';

class BusinessWorkspaceGate extends StatefulWidget {
  const BusinessWorkspaceGate({
    super.key,
    required this.builder,
    required this.user,
    required this.profile,
    required this.routeName,
  });
  final Widget Function(User, Map<String, dynamic>) builder;
  final User user;
  final Map<String, dynamic> profile;
  final String routeName;
  @override
  State<BusinessWorkspaceGate> createState() => _BusinessWorkspaceGateState();
}

class _BusinessWorkspaceGateState extends State<BusinessWorkspaceGate> {
  Map<String, dynamic>? _workspace;
  bool _failed = false, _refreshing = false;
  Timer? _accessTimer;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _membership;
  StreamSubscription<User?>? _auth;
  int _requestGeneration = 0;
  int _membershipGeneration = 0;
  String? _membershipPath;
  @override
  void initState() {
    super.initState();
    _auth = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user?.uid != widget.user.uid) _invalidateAccess();
    });
    _load();
    _accessTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _reloadPermissions(),
    );
  }

  @override
  void dispose() {
    _requestGeneration++;
    _membershipGeneration++;
    _membership?.cancel();
    _auth?.cancel();
    _accessTimer?.cancel();
    super.dispose();
  }

  void _hidePrivateScreens() {
    if (!mounted) return;
    final navigator = Navigator.of(context);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Auth may remove this gate before the frame ends. Its private overlays
      // still belong to the Navigator and must also leave on sign-out.
      if (navigator.mounted) navigator.popUntil((r) => r.isFirst);
    });
  }

  @override
  void didUpdateWidget(BusinessWorkspaceGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.user.uid != widget.user.uid ||
        oldWidget.profile['activeBusinessId'] !=
            widget.profile['activeBusinessId']) {
      _invalidateAccess();
      _watchMembership(null);
      _load();
    }
  }

  String _accessIdentity(Map<String, dynamic> workspace) {
    final permissions = Set<String>.from(
      workspace['permissions'] as List? ?? [],
    ).toList()..sort();
    return '${workspace['actorUid']}:${workspace['businessId']}:'
        '${workspace['isOwner'] == true}:$permissions';
  }

  void _invalidateAccess() {
    if (!mounted) return;
    _requestGeneration++;
    _refreshing = false;
    // An old gate must never clear a newer account's accepted context.
    if (BusinessWorkspaceSession.value?['actorUid'] == widget.user.uid) {
      BusinessWorkspaceSession.clear();
    }
    _hidePrivateScreens();
    setState(() {
      _workspace = null;
      _failed = true;
    });
  }

  void _watchMembership(Map<String, dynamic>? workspace) {
    final path = workspace == null || workspace['isOwner'] == true
        ? null
        : 'businessWorkspaces/${workspace['businessId']}/members/${widget.user.uid}';
    if (_membershipPath == path) return;
    _membershipPath = path;
    final generation = ++_membershipGeneration;
    _membership?.cancel();
    _membership = null;
    if (path == null) return;
    final uid = widget.user.uid;
    bool current() =>
        mounted &&
        generation == _membershipGeneration &&
        FirebaseAuth.instance.currentUser?.uid == uid;
    void ended() {
      if (!current()) return;
      // Permission-denied listeners terminate. A successful Retry must attach
      // a new listener instead of retaining the terminated subscription's path.
      _watchMembership(null);
      _invalidateAccess();
    }

    _membership = FirebaseFirestore.instance
        .doc(path)
        .snapshots()
        .listen(
          (snapshot) {
            if (!current() || snapshot.metadata.isFromCache) return;
            if (snapshot.data()?['status'] != 'active') {
              _invalidateAccess();
            } else {
              // An active membership can still have changed permissions. Its
              // new check must supersede a request made before this snapshot.
              _reloadPermissions(supersedePending: true);
            }
          },
          onError: (_) => ended(),
          onDone: ended,
        );
  }

  Future<void> _load() => _reloadPermissions();

  Future<void> _reloadPermissions({bool supersedePending = false}) async {
    if (_refreshing && !supersedePending) return;
    _refreshing = true;
    final generation = ++_requestGeneration;
    final uid = widget.user.uid;
    bool current() =>
        mounted &&
        generation == _requestGeneration &&
        widget.user.uid == uid &&
        FirebaseAuth.instance.currentUser?.uid == uid;
    try {
      // Commit only after the gate also validates the request generation.
      // A response started before revocation cannot repopulate the session.
      final workspace = await BusinessWorkspaceService().context(
        cacheSession: false,
      );
      if (!current()) return;
      if (_workspace != null &&
          _accessIdentity(_workspace!) != _accessIdentity(workspace)) {
        _hidePrivateScreens();
      }
      BusinessWorkspaceSession.value = workspace;
      setState(() {
        _workspace = workspace;
        _failed = false;
      });
      _watchMembership(workspace);
    } catch (_) {
      if (current()) _invalidateAccess();
    } finally {
      if (generation == _requestGeneration) _refreshing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_workspace != null) {
      final access = WorkspacePresentation(_workspace!);
      if (!access.allowsRoute(widget.routeName)) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Business workspace'),
            actions: const [MemberAccountActions()],
          ),
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Your workspace responsibilities do not include this page.',
                  ),
                  TextButton(
                    onPressed: () =>
                        AppNavigation.replace(context, '/business'),
                    child: const Text('Open my workspace'),
                  ),
                ],
              ),
            ),
          ),
        );
      }
      return KeyedSubtree(
        key: ValueKey(_accessIdentity(_workspace!)),
        child:
            Uri.tryParse(widget.routeName)?.path == '/business' && !access.owner
            ? BusinessWorkspaceHome(
                workspace: _workspace!,
                ownerBuilder: (_) => const SizedBox.shrink(),
                scheduleBuilder: (_) => BusinessScheduleScreen(
                  businessId: _workspace!['businessId'],
                  workspaceHome: true,
                ),
              )
            : widget.builder(widget.user, {
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
