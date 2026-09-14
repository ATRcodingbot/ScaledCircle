import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import 'package:flutter/material.dart';
import '../../services/mobile_notifications_service.dart';
import '../../navigation/context_back_button.dart';

class NotificationPreferencesScreen extends StatefulWidget {
  const NotificationPreferencesScreen({super.key, this.invoke});
  final Future<Map<String, dynamic>> Function(String, Map<String, dynamic>)?
  invoke;
  @override
  State<NotificationPreferencesScreen> createState() =>
      _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState
    extends State<NotificationPreferencesScreen> {
  Map<String, dynamic>? prefs;
  String? feedback;
  bool busy = false;
  final service = MobileNotificationsService.instance;
  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> input = const {},
  ]) => widget.invoke?.call(action, input) ?? service.call(action, input);
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final result = await call('settings');
      if (mounted) {
        setState(() {
          prefs = result;
          feedback = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => feedback =
              'Notification preferences could not load. Please try again.',
        );
      }
    }
  }

  Future<void> run(Future<String> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final result = await action();
      if (mounted) setState(() => feedback = result);
    } catch (_) {
      if (mounted) {
        setState(
          () => feedback =
              'Could not complete this notification request. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<String> save(Map<String, dynamic> next) async {
    final result = await call('configure', next);
    if (mounted) setState(() => prefs = result);
    return 'Notification preferences saved.';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AuthenticatedAppBar(
      leading: const ContextBackButton(),
      title: const Text('Notification preferences'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'Choose useful updates. Your in-app Notifications remain available when device notifications are off.',
        ),
        const SizedBox(height: 16),
        if (feedback != null)
          Semantics(liveRegion: true, child: Text(feedback!)),
        if (prefs == null)
          TextButton(
            onPressed: busy ? null : load,
            child: const Text('Retry preferences'),
          ),
        if (prefs != null) ...[
          SwitchListTile(
            title: const Text('Mobile push notifications'),
            subtitle: const Text('Allow updates on your registered devices.'),
            value: prefs!['enabled'] == true,
            onChanged: busy
                ? null
                : (value) => run(() async {
                    if (value && MobileNotificationsService.supported) {
                      final message = await service.enable();
                      await load();
                      return message;
                    }
                    final result = await save({...prefs!, 'enabled': value});
                    if (!value) await service.disableDevice();
                    return result;
                  }),
          ),
          for (final category in const {
            'work': 'Work & Schedule',
            'customers': 'Leads & Replies',
            'growth': 'Growth Summary',
            'social': 'Social Attention',
            'email': 'Email Campaign Results',
            'money': 'Money & Billing',
            'marketplace': 'Marketplace Work',
          }.entries)
            SwitchListTile(
              title: Text(category.value),
              value:
                  (prefs!['categories'] as Map? ?? {})[category.key] != false,
              onChanged: busy
                  ? null
                  : (value) => run(
                      () => save({
                        ...prefs!,
                        'categories': {
                          ...Map<String, dynamic>.from(
                            prefs!['categories'] as Map,
                          ),
                          category.key: value,
                        },
                      }),
                    ),
            ),
          SwitchListTile(
            title: const Text('Grouped Growth updates'),
            subtitle: const Text(
              'Receive grouped summaries instead of routine preparation updates. Turn off to keep Growth summaries in-app only.',
            ),
            value: prefs!['growthDigest'] == true,
            onChanged: busy
                ? null
                : (value) =>
                      run(() => save({...prefs!, 'growthDigest': value})),
          ),
          const Text(
            'Security / Account: required notices remain available. Lock-screen previews do not include customer details, addresses or payment amounts.',
          ),
          if (MobileNotificationsService.supported) ...[
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: busy
                  ? null
                  : () => run(() async {
                      await service.check();
                      return 'Notification check requested. Allow up to one minute, then tap the push. Repeating within five minutes uses the same check.';
                    }),
              child: const Text('Send a notification check'),
            ),
          ] else
            const Text(
              'Install the updated iOS or Android app to register a device and check push delivery.',
            ),
        ],
      ],
    ),
  );
}
