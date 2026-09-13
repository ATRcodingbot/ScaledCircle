import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../services/mobile_notifications_service.dart';
import '../screens/notifications/notifications_screen.dart';

class MobileNotificationCoordinator extends StatefulWidget {
  const MobileNotificationCoordinator({
    super.key,
    required this.navigatorKey,
    required this.child,
  });
  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;
  @override
  State<MobileNotificationCoordinator> createState() =>
      _MobileNotificationCoordinatorState();
}

class _MobileNotificationCoordinatorState
    extends State<MobileNotificationCoordinator>
    with WidgetsBindingObserver {
  StreamSubscription<String>? taps, messages;
  StreamSubscription<User?>? auth;
  String? pending;
  final handled = <String>{};
  final service = MobileNotificationsService.instance;
  bool opening = false;
  @override
  void initState() {
    super.initState();
    if (!MobileNotificationsService.supported) return;
    WidgetsBinding.instance.addObserver(this);
    taps = service.opened.stream.listen((id) {
      pending = id;
      _open();
    });
    messages = service.foreground.stream.listen((id) async {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid == null) return;
      try {
        final result = await service.call('open', {'notificationId': id});
        if (!mounted ||
            result['available'] != true ||
            FirebaseAuth.instance.currentUser?.uid != uid) {
          return;
        }
      } catch (_) {
        return;
      }
      final context = widget.navigatorKey.currentContext;
      if (context == null ||
          !context.mounted ||
          FirebaseAuth.instance.currentUser == null) {
        return;
      }
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(
          content: const Text('You have a new ScaledCircle notification.'),
          action: SnackBarAction(
            label: 'View',
            onPressed: () {
              pending = id;
              _open();
            },
          ),
        ),
      );
    });
    auth = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user != null) _open();
    });
    service.start();
    pending = service.takeInitialId();
    WidgetsBinding.instance.addPostFrameCallback((_) => _open());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      service.refresh();
      _open();
    }
  }

  Future<void> _open() async {
    final id = pending, uid = FirebaseAuth.instance.currentUser?.uid;
    if (id == null || uid == null || opening || handled.contains('$uid:$id')) {
      return;
    }
    final navigator = widget.navigatorKey.currentState;
    if (navigator == null) return;
    opening = true;
    try {
      final result = await service.call('open', {'notificationId': id});
      if (!mounted || FirebaseAuth.instance.currentUser?.uid != uid) return;
      handled.add('$uid:$id');
      pending = null;
      unawaited(
        navigator.push(
          MaterialPageRoute(
            builder: (_) => NotificationsScreen(
              initialNotificationId: result['available'] == true ? id : null,
              initialResolvedData: result['available'] == true ? result : null,
              unavailableDestination: result['available'] != true,
            ),
          ),
        ),
      );
    } catch (_) {
      // Keep the pending identity for the next resume; no unauthenticated route.
    } finally {
      opening = false;
    }
  }

  @override
  void dispose() {
    taps?.cancel();
    messages?.cancel();
    auth?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
