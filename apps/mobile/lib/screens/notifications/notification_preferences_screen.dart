import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import 'package:flutter/material.dart';
import '../../services/mobile_notifications_service.dart';
import '../../navigation/context_back_button.dart';

class NotificationPreferencesScreen extends StatefulWidget {
  const NotificationPreferencesScreen({super.key, this.invoke, this.service});
  final MobileNotificationsService? service;
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
  String? preferenceError;
  bool busy = false;
  bool deviceFeedback = false;
  MobileNotificationsService get service =>
      widget.service ?? MobileNotificationsService.instance;
  Future<Map<String, dynamic>> call(
    String action, [
    Map<String, dynamic> input = const {},
  ]) async {
    try {
      return await (widget.invoke?.call(action, input) ??
          service.call(action, input));
    } on NotificationRequestFailure {
      rethrow;
    } catch (_) {
      throw NotificationRequestFailure(action, 'unknown');
    }
  }

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
          preferenceError = null;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(
          () => preferenceError =
              'Notification preferences could not load. ${error is NotificationRequestFailure ? error.message : 'Retry preferences.'}',
        );
      }
    }
  }

  Future<void> run(
    Future<String> Function() action, {
    bool forDevice = false,
  }) async {
    if (busy) return;
    setState(() {
      busy = true;
      feedback = null;
      deviceFeedback = forDevice;
    });
    try {
      final result = await action();
      if (mounted) setState(() => feedback = result);
    } catch (error) {
      if (mounted) {
        setState(
          () => feedback = error is NotificationRequestFailure
              ? error.message
              : 'This action could not be confirmed. Retry preferences to check the saved state. Reference: request/unknown.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<String> save(Map<String, dynamic> next) async {
    final result = await call('configure', next);
    if (mounted) {
      setState(() {
        prefs = result;
        preferenceError = null;
      });
    }
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
        if (feedback != null && !deviceFeedback)
          Semantics(liveRegion: true, child: Text(feedback!)),
        if (preferenceError != null)
          Semantics(liveRegion: true, child: Text(preferenceError!)),
        if (prefs == null || preferenceError != null)
          TextButton(
            onPressed: busy ? null : load,
            child: const Text('Retry preferences'),
          ),
        if (prefs != null) ...[
          SwitchListTile(
            title: const Text('Mobile push notifications'),
            subtitle: const Text(
              'Saved account preference. Device registration is shown separately below.',
            ),
            value: prefs!['enabled'] == true,
            onChanged: busy || preferenceError != null
                ? null
                : (value) => run(() async {
                    if (value && MobileNotificationsService.supported) {
                      try {
                        return await service.enable();
                      } finally {
                        await load();
                      }
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
              onChanged: busy || preferenceError != null
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
            onChanged: busy || preferenceError != null
                ? null
                : (value) =>
                      run(() => save({...prefs!, 'growthDigest': value})),
          ),
          const Text(
            'Security / Account: required notices remain available. Lock-screen previews do not include customer details, addresses or payment amounts.',
          ),
          if (MobileNotificationsService.supported) ...[
            const SizedBox(height: 16),
            ValueListenableBuilder<NotificationDeviceReadiness>(
              valueListenable: service.readiness,
              builder: (context, device, _) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(liveRegion: true, child: Text(device.message)),
                  if (feedback != null && deviceFeedback)
                    Semantics(liveRegion: true, child: Text(feedback!)),
                  OutlinedButton(
                    onPressed:
                        busy ||
                            preferenceError != null ||
                            prefs!['enabled'] != true
                        ? null
                        : () => run(service.registerDevice, forDevice: true),
                    child: const Text('Retry device registration'),
                  ),
                  OutlinedButton(
                    onPressed:
                        busy ||
                            preferenceError != null ||
                            prefs!['enabled'] != true ||
                            !service.canCheck
                        ? null
                        : () => run(() async {
                            await service.check();
                            return 'Notification check accepted. Open Notifications for the existing check. Delivery still needs confirmation on this device.';
                          }, forDevice: true),
                    child: const Text('Send a notification check'),
                  ),
                ],
              ),
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
