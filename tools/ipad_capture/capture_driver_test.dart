import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'capture_driver.dart';

class FakeCaptureTransport implements CaptureTransport {
  FakeCaptureTransport(this.directory);
  final Directory directory;
  final calls = <String>[];
  bool failSchedule = false;
  bool hangConnect = false;
  bool secretAuthFailure = false;
  @override
  Future<void> connect() async {
    calls.add('connect');
    if (hangConnect) await Completer<void>().future;
  }

  @override
  Future<void> startup() async {
    calls.add('startup');
  }

  @override
  Future<void> authenticate(CaptureProgress progress) async {
    calls.add('authenticate');
    if (secretAuthFailure) throw StateError('SECRET_SENTINEL_PASSWORD_VM_URL');
  }

  @override
  Future<void> navigate(String route) async {
    calls.add(route);
  }

  @override
  Future<void> ready(String widgetType) async {
    calls.add(widgetType);
    if (failSchedule && widgetType == 'BusinessScheduleScreen') {
      throw const CaptureFailure('screen_not_ready');
    }
  }

  @override
  Future<void> capture(String name) async {
    calls.add(name);
    final pending = File('${directory.path}/$name.pending.png');
    await pending.writeAsBytes(pngHeader());
    await commitScreenshot(pending, File('${directory.path}/$name.png'));
  }

  @override
  Future<void> diagnostic(String name) async {
    calls.add('diagnostic-$name');
  }

  @override
  Future<void> logout() async {
    calls.add('logout');
  }

  @override
  Future<void> close() async {
    calls.add('close');
  }
}

Uint8List pngHeader({int width = 2064, int height = 2752}) {
  final bytes = Uint8List(24);
  bytes.setRange(0, 8, [137, 80, 78, 71, 13, 10, 26, 10]);
  ByteData.sublistView(bytes).setUint32(16, width);
  ByteData.sublistView(bytes).setUint32(20, height);
  return bytes;
}

void main() {
  late Directory directory;
  late FakeCaptureTransport transport;
  late List<Map<String, Object?>> events;
  late CaptureProgress progress;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('ipad-capture-test-');
    transport = FakeCaptureTransport(directory);
    events = [];
    progress = CaptureProgress(events.add);
  });
  tearDown(() async {
    // Only this test's newly created temporary directory is removed.
    await directory.delete(recursive: true);
  });

  test(
    'safe production events include deadlines and complete screenshot history',
    () async {
      await captureSequence(transport, progress);
      expect(progress.completedScreens, [
        'business-home',
        'schedule',
        'campaigns',
      ]);
      for (final event in events) {
        expect(captureStages, contains(event['stage']));
        expect(captureCategories, contains(event['category']));
        expect(
          DateTime.parse(
            event['deadlineAtUtc']! as String,
          ).isAfter(DateTime.parse(event['startedAtUtc']! as String)),
          isTrue,
        );
        expect(event['endedAtUtc'] == null, event['outcome'] == 'running');
      }
      expect(
        events
            .where(
              (e) =>
                  e['stage'] == 'business-home-capture' &&
                  e['outcome'] == 'success',
            )
            .single['completedScreens'],
        ['business-home'],
      );
      final fixture = Platform.environment['IPAD_TEST_EVENT_FIXTURE'];
      if (fixture != null) {
        await File(
          fixture,
        ).writeAsString('${events.map(jsonEncode).join('\n')}\n', flush: true);
      }
    },
  );

  test('timeout is bounded and still attempts bounded cleanup', () async {
    transport.hangConnect = true;
    await expectLater(
      captureSequence(
        transport,
        progress,
        testLimit: const Duration(milliseconds: 20),
      ),
      throwsA(
        isA<CaptureFailure>().having(
          (e) => e.category,
          'category',
          'stage_timeout',
        ),
      ),
    );
    expect(
      events.any((e) => e['stage'] == 'connect' && e['outcome'] == 'timeout'),
      isTrue,
    );
    expect(transport.calls, [
      'connect',
      'diagnostic-failure',
      'logout',
      'close',
    ]);
  });

  test('secret-bearing transport error becomes fixed category only', () async {
    transport.secretAuthFailure = true;
    await expectLater(
      captureSequence(transport, progress),
      throwsA(
        isA<CaptureFailure>().having(
          (e) => e.category,
          'category',
          'auth_failed',
        ),
      ),
    );
    expect(jsonEncode(events), isNot(contains('SECRET_SENTINEL')));
    expect(progress.completedScreens, isEmpty);
    expect(transport.calls, isNot(contains('/business')));
    expect(transport.calls.indexOf('diagnostic-failure'), lessThan(transport.calls.indexOf('logout')));
  });

  test('Home remains complete when Schedule readiness fails', () async {
    transport.failSchedule = true;
    await expectLater(
      captureSequence(transport, progress),
      throwsA(isA<CaptureFailure>()),
    );
    expect(await File('${directory.path}/business-home.png').exists(), isTrue);
    expect(await File('${directory.path}/schedule.png').exists(), isFalse);
    expect(progress.completedScreens, ['business-home']);
    expect(transport.calls, isNot(contains('/business/campaigns')));
    expect(
      events.any(
        (e) =>
            e['stage'] == 'business-home-capture' && e['outcome'] == 'success',
      ),
      isTrue,
    );
    expect(
      events.any(
        (e) => e['stage'] == 'schedule-readiness' && e['outcome'] == 'failed',
      ),
      isTrue,
    );
  });

  test('untrusted or mismatched harness reply has no payload in failure', () {
    for (final raw in [
      'SECRET_SENTINEL',
      '{"protocol":1,"password":"SECRET_SENTINEL"}',
    ]) {
      expect(
        () => captureReply(raw),
        throwsA(
          isA<CaptureFailure>().having(
            (e) => e.category,
            'category',
            'harness_mismatch',
          ),
        ),
      );
    }
    expect(
      captureReply('{"protocol":2,"outcome":"startup_ready"}')['outcome'],
      'startup_ready',
    );
  });

  test('wrong dimensions never become a completed screenshot', () async {
    final pending = File('${directory.path}/wrong.pending.png');
    final target = File('${directory.path}/wrong.png');
    await pending.writeAsBytes(pngHeader(width: 1));
    await expectLater(
      commitScreenshot(pending, target),
      throwsA(isA<CaptureFailure>()),
    );
    expect(await target.exists(), isFalse);
    expect(await pending.exists(), isTrue);
  });
}
