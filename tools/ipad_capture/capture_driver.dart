import 'dart:convert';
import 'dart:io';
import 'package:flutter_driver/flutter_driver.dart';

Future<void> main() async {
  FlutterDriver? driver;
  final env = Platform.environment;
  var stage = 'connect';
  var outcome = 'running';
  void report() {
    final path = env['IPAD_DRIVER_STATUS_FILE'];
    if (path != null) {
      File(
        path,
      ).writeAsStringSync(jsonEncode({'stage': stage, 'outcome': outcome}));
    }
  }

  try {
    report();
    driver = await FlutterDriver.connect(
      printCommunication: false,
      logCommunicationToFile: false,
    );
    stage = 'authenticate';
    report();
    final login = await driver.requestData(
      jsonEncode({
        'action': 'login',
        'email': env['IPAD_REVIEWER_EMAIL'],
        'password': env['IPAD_REVIEWER_PASSWORD'],
        'expectedUid': env['IPAD_REVIEWER_UID'],
      }),
      timeout: const Duration(seconds: 90),
    );
    if (login != 'authenticated') {
      outcome = login == 'refused' ? 'auth_refused' : 'auth_failed';
      throw StateError('Reviewer authentication failed');
    }
    const screens = [
      ('business-home', '/business', 'BusinessDashboard'),
      ('schedule', '/business/schedule', 'BusinessScheduleScreen'),
      ('campaigns', '/business/campaigns', 'BusinessCampaignsScreen'),
    ];
    for (final screen in screens) {
      stage = screen.$1;
      outcome = 'running';
      report();
      if (await driver.requestData(jsonEncode({'route': screen.$2})) !=
          'opened') {
        outcome = 'route_unavailable';
        throw StateError('Route unavailable');
      }
      outcome = 'screen_not_ready';
      await driver.waitFor(
        find.byType(screen.$3),
        timeout: const Duration(seconds: 60),
      );
      await Future<void>.delayed(const Duration(seconds: 8));
      await driver.waitForAbsent(
        find.byType('CircularProgressIndicator'),
        timeout: const Duration(seconds: 45),
      );
      outcome = 'screenshot_failed';
      final result = await Process.run('xcrun', [
        'simctl',
        'io',
        env['IPAD_SIMULATOR_UDID']!,
        'screenshot',
        '${env['IPAD_CAPTURE_OUTPUT']}/${screen.$1}.png',
      ]);
      if (result.exitCode != 0) throw StateError('Screenshot failed');
    }
    stage = 'complete';
    outcome = 'success';
    report();
  } catch (_) {
    if (outcome == 'running') outcome = 'failed';
    report();
    // Flutter driver errors may embed command payloads. Never print them.
    stderr.writeln(
      'iPad capture failed; no screenshots are approved for submission.',
    );
    exitCode = 1;
  } finally {
    if (driver != null) {
      try {
        await driver.requestData('{"action":"logout"}');
      } catch (_) {}
      try {
        await driver.close();
      } catch (_) {
        // Cleanup cannot expose a VM command payload.
      }
    }
  }
}
