import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/auth/login_screen.dart';

void main() {
  test('notification timestamps normalize safely for web sorting', () {
    final instant = DateTime.utc(2030, 9, 3, 12, 30);

    expect(
      notificationCreatedAtEpochMillis(Timestamp.fromDate(instant)),
      instant.millisecondsSinceEpoch,
    );
    expect(
      notificationCreatedAtEpochMillis(instant),
      instant.millisecondsSinceEpoch,
    );
    expect(
      notificationCreatedAtEpochMillis(instant.toIso8601String()),
      instant.millisecondsSinceEpoch,
    );
    expect(notificationCreatedAtEpochMillis(null), 0);
    expect(notificationCreatedAtEpochMillis(const Object()), 0);
  });
}
