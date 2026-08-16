import 'package:flutter_app/services/artifact_export_service.dart';
import 'package:flutter_app/services/managed_growth_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final artifact = ManagedGrowthArtifact(
    id: 'private-business-uid-artifact',
    artifactType: 'social_package',
    generatedAt: DateTime.utc(2026, 8, 16),
    data: const {
      'title': 'Organic Social Draft',
      'summary': 'Grounded deck and fence content.',
      'sections': [
        {
          'heading': 'Facebook Feed Post',
          'content': 'A useful deck maintenance tip.',
        },
        {
          'heading': 'Instagram Story',
          'content': 'A short fence planning prompt.',
        },
      ],
      'limitations': ['Business review required.'],
      'model': 'must-not-export',
      'usage': {'tokens': 100},
    },
  );
  const service = ArtifactExportService();

  test('text export contains rendered content and excludes internal metadata', () {
    final output = service.text(
      artifact: artifact,
      businessName: 'Attractive Remodel',
      focus: 'Decks & Fences',
    );
    expect(output, contains('ORGANIC SOCIAL DRAFT'));
    expect(output, contains('Business: Attractive Remodel'));
    expect(output, contains('Focus: Decks & Fences'));
    expect(output, contains('A useful deck maintenance tip.'));
    expect(output, isNot(contains('must-not-export')));
    expect(output, isNot(contains('tokens')));
    expect(output, isNot(contains(artifact.id)));
  });

  test('safe filename contains business, type, focus and date but no UID', () {
    final filename = service.filename(
      artifact: artifact,
      businessName: 'Attractive Remodel',
      focus: 'Decks & Fences',
    );
    expect(
      filename,
      'attractive-remodel-social-package-decks-fences-2026-08-16.txt',
    );
    expect(filename, isNot(contains(artifact.id)));
  });

  test('social CSV has customer-facing columns and useful rows', () {
    final csv = service.socialCsv(artifact);
    expect(
      csv,
      startsWith(
        '"platform","content_type","title","body","cta","hashtags","notes"',
      ),
    );
    expect(csv, contains('"Facebook"'));
    expect(csv, contains('"Instagram"'));
    expect(csv, contains('A useful deck maintenance tip.'));
    expect(csv, isNot(contains('must-not-export')));
  });
}
