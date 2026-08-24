import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../config/app_environment.dart';
import '../../navigation/app_routes.dart';
import '../../navigation/app_router.dart';
import '../../widgets/scaled_circle_brand.dart';

import '../notifications/notifications_screen.dart';
import '../public/early_access_pending_screen.dart';
import '../public/waitlist_screen.dart';
import 'forgot_password_screen.dart';
import 'register_screen.dart';

int notificationCreatedAtEpochMillis(Object? value) {
  if (value is Timestamp) {
    return value.millisecondsSinceEpoch;
  }
  if (value is DateTime) {
    return value.millisecondsSinceEpoch;
  }
  if (value is int) {
    return value;
  }
  if (value is String) {
    return DateTime.tryParse(value)?.millisecondsSinceEpoch ?? 0;
  }
  return 0;
}

int compareLoginNotificationsNewestFirst(
  QueryDocumentSnapshot first,
  QueryDocumentSnapshot second,
) {
  final firstData = first.data() as Map<String, dynamic>;
  final secondData = second.data() as Map<String, dynamic>;
  final timestampOrder = notificationCreatedAtEpochMillis(
    secondData['createdAt'],
  ).compareTo(notificationCreatedAtEpochMillis(firstData['createdAt']));
  return timestampOrder != 0 ? timestampOrder : first.id.compareTo(second.id);
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.returnRoute});
  final String? returnRoute;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();

  bool loading = false;

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> login() async {
    setState(() {
      loading = true;
    });

    try {
      final credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: emailController.text.trim(),
        password: passwordController.text.trim(),
      );

      final user = credential.user;

      if (user == null) {
        throw FirebaseAuthException(
          code: 'user-not-found',
          message: 'Unable to load user.',
        );
      }

      final userDocument = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();

      if (!mounted) return;

      if (!userDocument.exists) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => EarlyAccessPendingScreen(
              email: user.email ?? emailController.text.trim(),
              role: null,
            ),
          ),
        );
        return;
      }

      final userData = userDocument.data();

      final role = userData?['role']?.toString().toLowerCase();
      final approvedForBeta =
          role == 'admin' ||
          userData?['active'] == true ||
          userData?['betaAccess'] == 'approved';

      if (!approvedForBeta) {
        if (widget.returnRoute != null) {
          AppNavigation.replace(context, widget.returnRoute!);
          return;
        }
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => EarlyAccessPendingScreen(
              email: user.email ?? emailController.text.trim(),
              role: role,
            ),
          ),
        );
        return;
      }

      if (widget.returnRoute != null) {
        AppNavigation.replace(context, widget.returnRoute!);
        return;
      }

      final accountType = (userData?['activeView'] ?? userData?['accountType'])
          ?.toString()
          .toLowerCase();

      final loginNotification = await _buildLoginNotification(
        userId: user.uid,
        accountType: accountType,
      );

      if (!mounted) return;

      if (role == 'admin') {
        AppNavigation.replace(context, AppRoutes.adminDashboard);
        return;
      }
      if (accountType == 'business' ||
          accountType == 'scaler' ||
          accountType == 'marketer') {
        AppNavigation.replace(
          context,
          accountType == 'business'
              ? AppRoutes.businessDashboard
              : AppRoutes.scalerDashboard,
          arguments: loginNotification,
        );
        return;
      }

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => EarlyAccessPendingScreen(
            email: user.email ?? emailController.text.trim(),
            role: role,
          ),
        ),
      );
    } on FirebaseAuthException catch (e) {
      final message = _loginAuthErrorMessage(e);

      if (AppEnvironmentConfig.isLocal) {
        debugPrint('LOCAL Firebase Auth error code=${e.code}');
      }

      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to log in: $e')));
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  String _loginAuthErrorMessage(FirebaseAuthException error) {
    if (AppEnvironmentConfig.isLocal) {
      return 'Firebase Auth error: ${error.code}';
    }

    switch (error.code) {
      case 'user-not-found':
        return 'No account found.';

      case 'wrong-password':
        return 'Incorrect password.';

      case 'invalid-credential':
        return 'Invalid email or password.';

      case 'invalid-email':
        return 'Invalid email address.';

      case 'too-many-requests':
        return 'Too many login attempts. Please try again later.';

      case 'network-request-failed':
        return 'Network error. Check your internet connection.';

      default:
        return error.message ?? 'Login failed.';
    }
  }

  Future<LoginNotificationData?> _buildLoginNotification({
    required String userId,
    required String? accountType,
  }) async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('notifications')
          .where('userId', isEqualTo: userId)
          .where('read', isEqualTo: false)
          .get();

      if (snapshot.docs.isEmpty) {
        return null;
      }

      final notifications = List<QueryDocumentSnapshot>.from(snapshot.docs);

      notifications.sort(compareLoginNotificationsNewestFirst);

      if (accountType == 'business') {
        final applicationNotifications = notifications.where((notification) {
          final data = notification.data() as Map<String, dynamic>;

          return data['type'] == 'application_received';
        }).toList();

        if (applicationNotifications.isNotEmpty) {
          final count = applicationNotifications.length;

          return LoginNotificationData(
            title: count == 1
                ? 'New Scaler Application'
                : 'New Scaler Applications',
            message: count == 1
                ? '1 Scaler has applied to one of your campaigns.'
                : '$count Scalers have applied to your campaigns.',
            notifications: applicationNotifications,
          );
        }

        final newest = notifications.first;

        final data = newest.data() as Map<String, dynamic>;

        return LoginNotificationData(
          title: data['title']?.toString() ?? 'New Notification',
          message: data['message']?.toString() ?? '',
          notifications: [newest],
        );
      }

      if (accountType == 'scaler' || accountType == 'marketer') {
        const priorityTypes = [
          'changes_requested',
          'application_accepted',
          'campaign_completed',
          'application_rejected',
          'completion_submitted',
          'application_received',
        ];

        QueryDocumentSnapshot? selectedNotification;

        for (final type in priorityTypes) {
          for (final notification in notifications) {
            final data = notification.data() as Map<String, dynamic>;

            if (data['type'] == type) {
              selectedNotification = notification;

              break;
            }
          }

          if (selectedNotification != null) {
            break;
          }
        }

        selectedNotification ??= notifications.first;

        final data = selectedNotification.data() as Map<String, dynamic>;

        return LoginNotificationData(
          title: data['title']?.toString() ?? 'New Notification',
          message: data['message']?.toString() ?? '',
          notifications: [selectedNotification],
        );
      }

      final newest = notifications.first;

      final data = newest.data() as Map<String, dynamic>;

      return LoginNotificationData(
        title: data['title']?.toString() ?? 'New Notification',
        message: data['message']?.toString() ?? '',
        notifications: [newest],
      );
    } catch (e) {
      debugPrint('Unable to load login notifications: $e');

      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const ScaledCircleBrand(), centerTitle: true),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ListView(
            children: [
              const SizedBox(height: 40),

              const Text(
                'Welcome Back',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 8),

              const Text('Log in to continue to ScaledCircle.'),

              const SizedBox(height: 30),

              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextField(
                controller: passwordController,
                obscureText: true,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) {
                  if (!loading) {
                    login();
                  }
                },
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 30),

              SizedBox(
                height: 55,
                child: ElevatedButton(
                  onPressed: loading ? null : login,
                  child: loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Login'),
                ),
              ),

              const SizedBox(height: 8),

              SizedBox(
                height: 48,
                child: TextButton.icon(
                  onPressed: loading
                      ? null
                      : () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ForgotPasswordScreen(
                                initialEmail: emailController.text.trim(),
                              ),
                            ),
                          );
                        },
                  icon: const Icon(Icons.lock_reset),
                  label: const Text('Forgot your password?'),
                ),
              ),

              const SizedBox(height: 12),

              OutlinedButton(
                onPressed: loading
                    ? null
                    : () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const RegisterScreen(),
                          ),
                        );
                      },
                child: const Text('Create Account'),
              ),

              const SizedBox(height: 8),

              TextButton(
                onPressed: loading
                    ? null
                    : () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const WaitlistScreen(),
                          ),
                        );
                      },
                child: const Text('Get Email Alerts Without an Account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LoginNotificationData {
  final String title;
  final String message;
  final List<QueryDocumentSnapshot> notifications;

  const LoginNotificationData({
    required this.title,
    required this.message,
    required this.notifications,
  });
}

class LoginNotificationWrapper extends StatefulWidget {
  final Widget child;
  final LoginNotificationData? notification;

  const LoginNotificationWrapper({
    super.key,
    required this.child,
    required this.notification,
  });

  @override
  State<LoginNotificationWrapper> createState() =>
      _LoginNotificationWrapperState();
}

class _LoginNotificationWrapperState extends State<LoginNotificationWrapper> {
  bool _popupShown = false;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _showLoginNotification();
    });
  }

  Future<void> _showLoginNotification() async {
    if (_popupShown) return;

    final notification = widget.notification;

    if (notification == null) {
      return;
    }

    _popupShown = true;

    if (!mounted) return;

    final openNotifications = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          icon: const Icon(Icons.notifications_active, size: 42),
          title: Text(notification.title),
          content: Text(notification.message),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('OK'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('View Notifications'),
            ),
          ],
        );
      },
    );

    await _markDisplayedNotificationsRead(notification.notifications);

    if (!mounted) return;

    if (openNotifications == true) {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const NotificationsScreen()),
      );
    }
  }

  Future<void> _markDisplayedNotificationsRead(
    List<QueryDocumentSnapshot> notifications,
  ) async {
    if (notifications.isEmpty) {
      return;
    }

    try {
      final firestore = FirebaseFirestore.instance;

      final batch = firestore.batch();

      for (final notification in notifications) {
        batch.update(notification.reference, {
          'read': true,
          'readAt': FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
    } catch (e) {
      debugPrint('Unable to mark login notifications read: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
