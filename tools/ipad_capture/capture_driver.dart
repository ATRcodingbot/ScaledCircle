import 'dart:convert';
import 'dart:io';
import 'package:flutter_driver/flutter_driver.dart';

Future<void> main() async {
  FlutterDriver? driver;
  try {
    driver = await FlutterDriver.connect(
      printCommunication: false,
      logCommunicationToFile: false,
    );
    final env = Platform.environment;
    final login = await driver.requestData(
      jsonEncode({
        'action': 'login',
        'email': env['IPAD_REVIEWER_EMAIL'],
        'password': env['IPAD_REVIEWER_PASSWORD'],
        'expectedUid': env['IPAD_REVIEWER_UID'],
      }),
      timeout: const Duration(seconds: 90),
    );
    if (login != 'authenticated')
      throw StateError('Reviewer authentication failed');
    const screens = [
      ('business-home', '/business', 'BusinessDashboard'),
      ('schedule', '/business/schedule', 'BusinessScheduleScreen'),
      ('campaigns', '/business/campaigns', 'BusinessCampaignsScreen'),
    ];
    for (final screen in screens) {
      if (await driver.requestData(jsonEncode({'route': screen.$2})) !=
          'opened') {
        throw StateError('Route unavailable');
      }
      await driver.waitFor(
        find.byType(screen.$3),
        timeout: const Duration(seconds: 60),
      );
      await Future<void>.delayed(const Duration(seconds: 8));
      await driver.waitForAbsent(
        find.byType('CircularProgressIndicator'),
        timeout: const Duration(seconds: 45),
      );
      final result = await Process.run('xcrun', [
        'simctl',
        'io',
        env['IPAD_SIMULATOR_UDID']!,
        'screenshot',
        '${env['IPAD_CAPTURE_OUTPUT']}/${screen.$1}.png',
      ]);
      if (result.exitCode != 0) throw StateError('Screenshot failed');
    }
  } catch (_) {
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
      await driver.close();
    }
  }
}
