import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../business/business_dashboard.dart';
import '../jobs/jobs_marketplace_screen.dart';
import '../notifications/notifications_screen.dart';
import '../onboarding/account_type_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

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
      final credential =
          await FirebaseAuth.instance.signInWithEmailAndPassword(
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
            builder: (_) => const AccountTypeScreen(),
          ),
        );
        return;
      }

      final userData = userDocument.data();

      final accountType =
          userData?['accountType']?.toString();

      final loginNotification =
          await _buildLoginNotification(
        userId: user.uid,
        accountType: accountType,
      );

      if (!mounted) return;

      if (accountType == 'business') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => LoginNotificationWrapper(
              notification: loginNotification,
              child: const BusinessDashboard(),
            ),
          ),
        );

        return;
      }

      if (accountType == 'marketer') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => LoginNotificationWrapper(
              notification: loginNotification,
              child: const JobsMarketplaceScreen(),
            ),
          ),
        );

        return;
      }

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => const AccountTypeScreen(),
        ),
      );
    } on FirebaseAuthException catch (e) {
      String message = 'Login failed.';

      switch (e.code) {
        case 'user-not-found':
          message = 'No account found.';
          break;

        case 'wrong-password':
          message = 'Incorrect password.';
          break;

        case 'invalid-credential':
          message = 'Invalid email or password.';
          break;

        case 'invalid-email':
          message = 'Invalid email address.';
          break;

        case 'too-many-requests':
          message =
              'Too many login attempts. Please try again later.';
          break;

        case 'network-request-failed':
          message =
              'Network error. Check your internet connection.';
          break;

        default:
          message = e.message ?? 'Login failed.';
      }

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Unable to log in: $e',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  Future<LoginNotificationData?> _buildLoginNotification({
    required String userId,
    required String? accountType,
  }) async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('notifications')
          .where(
            'userId',
            isEqualTo: userId,
          )
          .where(
            'read',
            isEqualTo: false,
          )
          .get();

      if (snapshot.docs.isEmpty) {
        return null;
      }

      final notifications =
          List<QueryDocumentSnapshot>.from(
        snapshot.docs,
      );

      notifications.sort(
        (a, b) {
          final aData =
              a.data() as Map<String, dynamic>;

          final bData =
              b.data() as Map<String, dynamic>;

          final aTimestamp =
              aData['createdAt'] as Timestamp?;

          final bTimestamp =
              bData['createdAt'] as Timestamp?;

          if (aTimestamp == null &&
              bTimestamp == null) {
            return 0;
          }

          if (aTimestamp == null) {
            return 1;
          }

          if (bTimestamp == null) {
            return -1;
          }

          return bTimestamp.compareTo(
            aTimestamp,
          );
        },
      );

      if (accountType == 'business') {
        final applicationNotifications =
            notifications.where(
          (notification) {
            final data =
                notification.data()
                    as Map<String, dynamic>;

            return data['type'] ==
                'application_received';
          },
        ).toList();

        if (applicationNotifications.isNotEmpty) {
          final count =
              applicationNotifications.length;

          return LoginNotificationData(
            title: count == 1
                ? 'New Scaler Application'
                : 'New Scaler Applications',
            message: count == 1
                ? '1 Scaler has applied to one of your campaigns.'
                : '$count Scalers have applied to your campaigns.',
            notifications:
                applicationNotifications,
          );
        }

        final newest =
            notifications.first;

        final data =
            newest.data()
                as Map<String, dynamic>;

        return LoginNotificationData(
          title:
              data['title']?.toString() ??
                  'New Notification',
          message:
              data['message']?.toString() ??
                  '',
          notifications: [
            newest,
          ],
        );
      }

      if (accountType == 'marketer') {
        const priorityTypes = [
          'changes_requested',
          'application_accepted',
          'campaign_completed',
          'application_rejected',
          'completion_submitted',
          'application_received',
        ];

        QueryDocumentSnapshot?
            selectedNotification;

        for (final type in priorityTypes) {
          for (final notification
              in notifications) {
            final data =
                notification.data()
                    as Map<String, dynamic>;

            if (data['type'] == type) {
              selectedNotification =
                  notification;

              break;
            }
          }

          if (selectedNotification !=
              null) {
            break;
          }
        }

        selectedNotification ??=
            notifications.first;

        final data =
            selectedNotification.data()
                as Map<String, dynamic>;

        return LoginNotificationData(
          title:
              data['title']?.toString() ??
                  'New Notification',
          message:
              data['message']?.toString() ??
                  '',
          notifications: [
            selectedNotification,
          ],
        );
      }

      final newest =
          notifications.first;

      final data =
          newest.data()
              as Map<String, dynamic>;

      return LoginNotificationData(
        title:
            data['title']?.toString() ??
                'New Notification',
        message:
            data['message']?.toString() ??
                '',
        notifications: [
          newest,
        ],
      );
    } catch (e) {
      debugPrint(
        'Unable to load login notifications: $e',
      );

      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scaled Circle'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ListView(
            children: [
              const SizedBox(height: 40),

              const Text(
                'Welcome Back',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 8),

              const Text(
                'Log in to continue to Scaled Circle.',
              ),

              const SizedBox(height: 30),

              TextField(
                controller: emailController,
                keyboardType:
                    TextInputType.emailAddress,
                textInputAction:
                    TextInputAction.next,
                decoration:
                    const InputDecoration(
                  labelText: 'Email',
                  border:
                      OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextField(
                controller: passwordController,
                obscureText: true,
                textInputAction:
                    TextInputAction.done,
                onSubmitted: (_) {
                  if (!loading) {
                    login();
                  }
                },
                decoration:
                    const InputDecoration(
                  labelText: 'Password',
                  border:
                      OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 30),

              SizedBox(
                height: 55,
                child: ElevatedButton(
                  onPressed:
                      loading ? null : login,
                  child: loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child:
                              CircularProgressIndicator(
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          'Login',
                        ),
                ),
              ),

              const SizedBox(height: 20),

              TextButton(
                onPressed: loading
                    ? null
                    : () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                const RegisterScreen(),
                          ),
                        );
                      },
                child:
                    const Text(
                  'Create Account',
                ),
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

class LoginNotificationWrapper
    extends StatefulWidget {
  final Widget child;
  final LoginNotificationData? notification;

  const LoginNotificationWrapper({
    super.key,
    required this.child,
    required this.notification,
  });

  @override
  State<LoginNotificationWrapper>
      createState() =>
          _LoginNotificationWrapperState();
}

class _LoginNotificationWrapperState
    extends State<LoginNotificationWrapper> {
  bool _popupShown = false;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance
        .addPostFrameCallback(
      (_) {
        _showLoginNotification();
      },
    );
  }

  Future<void>
      _showLoginNotification() async {
    if (_popupShown) return;

    final notification =
        widget.notification;

    if (notification == null) {
      return;
    }

    _popupShown = true;

    if (!mounted) return;

    final openNotifications =
        await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          icon: const Icon(
            Icons.notifications_active,
            size: 42,
          ),
          title: Text(
            notification.title,
          ),
          content: Text(
            notification.message,
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  false,
                );
              },
              child: const Text(
                'OK',
              ),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(
                  dialogContext,
                  true,
                );
              },
              child: const Text(
                'View Notifications',
              ),
            ),
          ],
        );
      },
    );

    await _markDisplayedNotificationsRead(
      notification.notifications,
    );

    if (!mounted) return;

    if (openNotifications == true) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              const NotificationsScreen(),
        ),
      );
    }
  }

  Future<void>
      _markDisplayedNotificationsRead(
    List<QueryDocumentSnapshot>
        notifications,
  ) async {
    if (notifications.isEmpty) {
      return;
    }

    try {
      final firestore =
          FirebaseFirestore.instance;

      final batch =
          firestore.batch();

      for (final notification
          in notifications) {
        batch.update(
          notification.reference,
          {
            'read': true,
            'readAt':
                FieldValue.serverTimestamp(),
          },
        );
      }

      await batch.commit();
    } catch (e) {
      debugPrint(
        'Unable to mark login notifications read: $e',
      );
    }
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    return widget.child;
  }
}