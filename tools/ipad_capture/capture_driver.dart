import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;
import 'dart:typed_data';
import 'package:flutter_driver/flutter_driver.dart';

const captureProtocol = 2;
const captureScreens = [
  ('business-home', '/business', 'BusinessDashboard'),
  ('schedule', '/business/schedule', 'BusinessScheduleScreen'),
  ('campaigns', '/business/campaigns', 'BusinessCampaignsScreen'),
];
const captureCategories = {
  'none',
  'driver_unavailable',
  'startup_not_ready',
  'harness_mismatch',
  'auth_refused',
  'auth_runtime_mismatch',
  'auth_input_whitespace_unsupported',
  'auth_timeout',
  'auth_failed',
  'auth_identity_mismatch',
  'auth_unverified',
  'auth_network_unavailable',
  'auth_invalid_credentials',
  'route_unavailable',
  'screen_not_ready',
  'screenshot_failed',
  'cleanup_failed',
  'stage_timeout',
  'invalid_input',
};
final captureStages = {
  'connect',
  'app-startup',
  'authenticate',
  'logout',
  'close',
  'complete',
  for (final screen in captureScreens)
    for (final step in ['navigation', 'readiness', 'capture'])
      '${screen.$1}-$step',
};

class CaptureFailure implements Exception {
  const CaptureFailure(this.category);
  final String category;
}

/// Only this fixed schema reaches CI logs or retained status artifacts.
class CaptureProgress {
  CaptureProgress(this.emit);
  final void Function(Map<String, Object?>) emit;
  final completedScreens = <String>[];

  Future<T> stage<T>(
    String name,
    Duration limit,
    Future<T> Function() action, {
    required String failureCategory,
  }) async {
    if (!captureStages.contains(name) ||
        !captureCategories.contains(failureCategory)) {
      throw const CaptureFailure('invalid_input');
    }
    final started = DateTime.now().toUtc();
    void record(String outcome, String category, {bool ended = false}) => emit({
      'protocol': captureProtocol,
      'stage': name,
      'outcome': outcome,
      'category': category,
      'startedAtUtc': started.toIso8601String(),
      'endedAtUtc': ended ? DateTime.now().toUtc().toIso8601String() : null,
      'deadlineAtUtc': started.add(limit).toIso8601String(),
      'timeoutSeconds': limit.inMilliseconds / 1000,
      'completedScreens': List<String>.of(completedScreens),
    });
    record('running', 'none');
    try {
      final result = await action().timeout(limit);
      record('success', 'none', ended: true);
      return result;
    } on TimeoutException {
      record('timeout', 'stage_timeout', ended: true);
      throw const CaptureFailure('stage_timeout');
    } catch (error) {
      final category =
          error is CaptureFailure && captureCategories.contains(error.category)
          ? error.category
          : failureCategory;
      record('failed', category, ended: true);
      // Never propagate a driver exception containing a request or VM URL.
      throw CaptureFailure(category);
    }
  }
}

abstract interface class CaptureTransport {
  Future<void> connect();
  Future<void> startup();
  Future<void> authenticate();
  Future<void> navigate(String route);
  Future<void> ready(String widgetType);
  Future<void> capture(String name);
  Future<void> logout();
  Future<void> close();
}

Future<void> captureSequence(
  CaptureTransport transport,
  CaptureProgress progress, {
  Duration? testLimit,
}) async {
  Duration limit(int seconds) => testLimit ?? Duration(seconds: seconds);
  try {
    await progress.stage(
      'connect',
      limit(60),
      transport.connect,
      failureCategory: 'driver_unavailable',
    );
    await progress.stage(
      'app-startup',
      limit(60),
      transport.startup,
      failureCategory: 'startup_not_ready',
    );
    await progress.stage(
      'authenticate',
      limit(75),
      transport.authenticate,
      failureCategory: 'auth_failed',
    );
    for (final screen in captureScreens) {
      await progress.stage(
        '${screen.$1}-navigation',
        limit(20),
        () => transport.navigate(screen.$2),
        failureCategory: 'route_unavailable',
      );
      await progress.stage(
        '${screen.$1}-readiness',
        limit(60),
        () => transport.ready(screen.$3),
        failureCategory: 'screen_not_ready',
      );
      await progress.stage('${screen.$1}-capture', limit(20), () async {
        await transport.capture(screen.$1);
        progress.completedScreens.add(screen.$1);
      }, failureCategory: 'screenshot_failed');
    }
    await progress.stage(
      'complete',
      limit(1),
      () async {},
      failureCategory: 'invalid_input',
    );
  } finally {
    // Cleanup cannot discard an already completed screenshot. History retains
    // the original failure even when the last current-status entry is cleanup.
    try {
      await progress.stage(
        'logout',
        limit(10),
        transport.logout,
        failureCategory: 'cleanup_failed',
      );
    } catch (_) {}
    try {
      await progress.stage(
        'close',
        limit(5),
        transport.close,
        failureCategory: 'cleanup_failed',
      );
    } catch (_) {}
  }
}

Future<void> commitScreenshot(io.File pending, io.File destination) async {
  final bytes = await pending.readAsBytes();
  if (bytes.length < 24 ||
      !const [
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
      ].asMap().entries.every((e) => bytes[e.key] == e.value) ||
      ByteData.sublistView(bytes).getUint32(16) != 2064 ||
      ByteData.sublistView(bytes).getUint32(20) != 2752 ||
      await destination.exists()) {
    throw const CaptureFailure('screenshot_failed');
  }
  await pending.rename(destination.path);
}

Map<String, dynamic> captureReply(String raw) {
  try {
    final value = jsonDecode(raw);
    if (value is Map && value['protocol'] == captureProtocol) {
      return Map<String, dynamic>.from(value);
    }
  } catch (_) {}
  throw const CaptureFailure('harness_mismatch');
}

class FlutterCaptureTransport implements CaptureTransport {
  FlutterCaptureTransport(this.environment);
  final Map<String, String> environment;
  FlutterDriver? _driver;
  FlutterDriver get driver =>
      _driver ?? (throw const CaptureFailure('driver_unavailable'));

  @override
  Future<void> connect() async {
    _driver = await FlutterDriver.connect(
      printCommunication: false,
      logCommunicationToFile: false,
    );
  }

  Future<Map<String, dynamic>> request(
    Map<String, Object?> input,
    Duration timeout,
  ) async {
    return captureReply(
      await driver
          .requestData(jsonEncode(input), timeout: timeout)
          .timeout(timeout),
    );
  }

  @override
  Future<void> startup() async {
    final deadline = DateTime.now().add(const Duration(seconds: 55));
    while (DateTime.now().isBefore(deadline)) {
      final result = await request({
        'action': 'status',
      }, const Duration(seconds: 5));
      if (result['outcome'] == 'startup_ready') return;
      if (result['outcome'] != 'startup_pending') {
        throw const CaptureFailure('startup_not_ready');
      }
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    throw const CaptureFailure('startup_not_ready');
  }

  @override
  Future<void> authenticate() async {
    final email = environment['IPAD_REVIEWER_EMAIL'];
    final password = environment['IPAD_REVIEWER_PASSWORD'];
    if (email == null ||
        email.isEmpty ||
        password == null ||
        password.isEmpty) {
      throw const CaptureFailure('invalid_input');
    }
    // The pinned LoginScreen trims both fields. Refuse incompatible input rather
    // than silently changing password bytes or modifying the released app.
    if (email.trim() != email || password.trim() != password) {
      throw const CaptureFailure('auth_input_whitespace_unsupported');
    }
    final initial = await request({
      'action': 'verify-login',
      'expectedUid': environment['IPAD_REVIEWER_UID'],
    }, const Duration(seconds: 5));
    if (initial['outcome'] != 'auth_pending') {
      throw CaptureFailure(
        initial['category'] == 'auth_runtime_mismatch'
            ? 'auth_runtime_mismatch'
            : 'auth_refused',
      );
    }
    // Enter the actual maintained login fields; await each edit before submit.
    await driver.setSemantics(true, timeout: const Duration(seconds: 5));
    await driver.tap(find.bySemanticsLabel('Email'));
    await driver.enterText(email);
    await driver.tap(find.bySemanticsLabel('Password'));
    await driver.enterText(password);
    await driver.tap(find.text('Login'));
    for (var attempt = 0; attempt < 45; attempt++) {
      final result = await request({
        'action': 'verify-login',
        'expectedUid': environment['IPAD_REVIEWER_UID'],
      }, const Duration(seconds: 3));
      if (result['outcome'] == 'authenticated') return;
      if (result['outcome'] != 'auth_pending') {
        final category = result['category'];
        throw CaptureFailure(
          category is String && captureCategories.contains(category)
              ? category
              : 'auth_failed',
        );
      }
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    throw const CaptureFailure('auth_timeout');
  }

  @override
  Future<void> navigate(String route) async {
    final result = await request({'route': route}, const Duration(seconds: 15));
    if (result['outcome'] != 'opened') {
      throw const CaptureFailure('route_unavailable');
    }
  }

  @override
  Future<void> ready(String widgetType) async {
    // Frame-sync must not wait indefinitely behind a continuous loading animation.
    // Application auth, workspace, network and permission gates are unchanged.
    await driver
        .runUnsynchronized(() async {
          await driver.waitFor(
            find.byType(widgetType),
            timeout: const Duration(seconds: 40),
          );
          await driver.waitForAbsent(
            find.byType('CircularProgressIndicator'),
            timeout: const Duration(seconds: 40),
          );
          final deadline = DateTime.now().add(const Duration(seconds: 50));
          while (true) {
            final result = await request({
              'action': 'screen-status',
              'screen': widgetType,
            }, const Duration(seconds: 5));
            if (result['outcome'] == 'screen_ready') break;
            if (result['outcome'] != 'screen_not_ready') {
              throw CaptureFailure(
                result['category'] is String &&
                        captureCategories.contains(result['category'])
                    ? result['category'] as String
                    : 'screen_not_ready',
              );
            }
            if (!DateTime.now().isBefore(deadline)) {
              throw const CaptureFailure('screen_not_ready');
            }
            await Future<void>.delayed(const Duration(milliseconds: 500));
          }
          await driver.waitUntilFirstFrameRasterized().timeout(
            const Duration(seconds: 5),
          );
        }, timeout: const Duration(seconds: 5))
        .timeout(const Duration(seconds: 55));
    // This proves only the observed Flutter readiness conditions. OS-native
    // permission overlays and image correctness require manual PNG review.
  }

  @override
  Future<void> capture(String name) async {
    if (!captureScreens.any((screen) => screen.$1 == name)) {
      throw const CaptureFailure('invalid_input');
    }
    final folder = environment['IPAD_CAPTURE_OUTPUT'];
    final simulator = environment['IPAD_SIMULATOR_UDID'];
    if (folder == null ||
        simulator == null ||
        folder.isEmpty ||
        simulator.isEmpty) {
      throw const CaptureFailure('invalid_input');
    }
    final pending = io.File('$folder/$name.pending.png');
    final destination = io.File('$folder/$name.png');
    io.Process? process;
    Future<void> confirmScreen() async {
      final widgetType = captureScreens
          .firstWhere((screen) => screen.$1 == name)
          .$3;
      final result = await request({
        'action': 'screen-status',
        'screen': widgetType,
      }, const Duration(seconds: 2));
      if (result['outcome'] != 'screen_ready') {
        throw const CaptureFailure('screen_not_ready');
      }
    }

    try {
      await confirmScreen();
      process = await io.Process.start('xcrun', [
        'simctl',
        'io',
        simulator,
        'screenshot',
        pending.path,
      ]);
      final drained = Future.wait([
        process.stdout.drain<void>(),
        process.stderr.drain<void>(),
      ]);
      final code = await process.exitCode.timeout(const Duration(seconds: 12));
      await drained.timeout(const Duration(seconds: 1));
      if (code != 0) throw const CaptureFailure('screenshot_failed');
      await confirmScreen();
      await commitScreenshot(pending, destination);
    } finally {
      process?.kill(io.ProcessSignal.sigkill);
      if (await pending.exists()) await pending.delete();
    }
  }

  @override
  Future<void> logout() async {
    if (_driver == null) return;
    final result = await request({
      'action': 'logout',
    }, const Duration(seconds: 8));
    if (result['outcome'] != 'signed_out') {
      throw const CaptureFailure('cleanup_failed');
    }
  }

  @override
  Future<void> close() async {
    await _driver?.close();
  }
}

Future<void> main() async {
  final environment = io.Platform.environment;
  final statusPath = environment['IPAD_DRIVER_STATUS_FILE'];
  if (statusPath == null || statusPath.isEmpty) {
    io.stderr.writeln('Capture driver: invalid_input');
    io.exit(1);
  }
  final progress = CaptureProgress((event) {
    final encoded = jsonEncode(event);
    final temporary = io.File('$statusPath.pending');
    temporary.writeAsStringSync(encoded, flush: true);
    temporary.renameSync(statusPath);
    io.File(
      '$statusPath.events.jsonl',
    ).writeAsStringSync('$encoded\n', mode: io.FileMode.append, flush: true);
    io.stdout.writeln('Capture driver stage: $encoded');
  });
  var result = 0;
  try {
    await captureSequence(FlutterCaptureTransport(environment), progress);
  } catch (_) {
    io.stderr.writeln(
      'Capture driver stopped; completed screenshots remain candidates for manual review.',
    );
    result = 1;
  }
  await io.stdout.flush();
  await io.stderr.flush();
  // A late VM connection future cannot keep this process alive after its bounds.
  io.exit(result);
}
