import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/business/social_operations_screen.dart';
import 'package:flutter_app/services/social_operations_service.dart';
import 'package:flutter_app/widgets/customer_social_post_editor.dart';
import 'customer_social_editor_test.dart' show EditorService;

class NotificationPostService extends EditorService {
  bool unavailable = false;
  int previews = 0;
  @override
  Future<SocialOperationsWorkspace> load() async =>
      const SocialOperationsWorkspace({
        'managedPublishingAvailable': true,
        'plans': [],
      });
  @override
  Future<Map<String, dynamic>> previewPost(Map<String, dynamic> input) async {
    expect(input['itemId'], 'rolling_post');
    expect(input['provider'], 'instagram');
    previews++;
    if (unavailable) throw StateError('temporary provider failure');
    return {
      ...post(),
      'provider': 'instagram',
      'publicationStatus': 'scheduled',
    };
  }
}

void main() {
  testWidgets(
    'notification opens rolling post absent from original plan and retries safely',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1200, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final service = NotificationPostService()..unavailable = true;
      await tester.pumpWidget(
        MaterialApp(
          home: SocialOperationsScreen(
            service: service,
            initialItemId: 'rolling_post',
            initialProvider: 'instagram',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(service.previews, 1);
      expect(find.text('Retry'), findsOneWidget);
      service.unavailable = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(service.previews, 3); // Retry plus the editor's current-revision readback.
      expect(find.byType(CustomerSocialPostEditor), findsOneWidget);
      expect(find.text('Scheduled'), findsWidgets);
      expect(service.calls, isEmpty);
    },
  );
}
