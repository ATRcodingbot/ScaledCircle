import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final root = Directory.current.path;
  final screen = File(
    '$root/lib/screens/business/social_approval_screen.dart',
  ).readAsStringSync();
  final service = File(
    '$root/lib/services/social_workflow_service.dart',
  ).readAsStringSync();
  final managed = File(
    '$root/lib/screens/business/managed_growth_screen.dart',
  ).readAsStringSync();

  test('Social uses a visual preview and plain approval actions', () {
    for (final text in [
      'Your Posts Are Ready',
      'Preview',
      'Everything look good?',
      'Approve & Schedule',
      'Post Now',
      'Save for Later',
      'Try Another Version',
    ]) {
      expect(screen, contains(text));
    }
  });

  test('Social generation asks simple Business questions', () {
    expect(managed, contains('Where should we prepare these posts?'));
    expect(managed, contains('What should people do?'));
    expect(managed, contains('Want to use a photo?'));
    expect(managed, isNot(contains('OAuth')));
    expect(managed, isNot(contains('Access Token')));
  });

  test('unapproved providers are accurately gated and exports are More', () {
    expect(screen, contains('Connection requires approval'));
    expect(screen, contains('Export instead'));
    expect(screen, contains('Download / Email / Copy All'));
    expect(screen, contains("const Chip(label: Text('More'))"));
  });

  test(
    'editing and explicit scheduling use backend-authoritative callables',
    () {
      for (final callable in [
        'createSocialPostDraft',
        'updateSocialPostDraft',
        'approveSocialPostDraft',
        'scheduleSocialPostDraft',
        'registerSocialMediaItem',
      ]) {
        expect(service, contains(callable));
      }
      expect(screen, contains('Post this now?'));
      expect(screen, contains('showDatePicker'));
    },
  );

  test(
    'media library is owner scoped and photo claims are Business supplied',
    () {
      expect(service, contains("'social_media/\$_uid/\$mediaId/\$safeName'"));
      expect(screen, contains('My Photos'));
      expect(screen, contains("We'll use only details you provide."));
      expect(screen, contains('Create Image — Coming Soon'));
    },
  );

  test('Flutter contains no provider credentials or publishing API calls', () {
    final combined = '$screen\n$service';
    for (final forbidden in [
      'access_token',
      'refresh_token',
      'graph.facebook.com',
      'linkedin.com/v2',
      'mybusiness.googleapis.com',
      'client_secret',
    ]) {
      expect(combined.toLowerCase(), isNot(contains(forbidden)));
    }
  });
}
