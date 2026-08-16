import 'managed_growth_service.dart';

class ArtifactExportService {
  const ArtifactExportService();

  String text({
    required ManagedGrowthArtifact artifact,
    required String businessName,
    String? focus,
  }) {
    final output = StringBuffer()
      ..writeln(artifact.title.toUpperCase())
      ..writeln('Business: ${businessName.trim().isEmpty ? 'Your business' : businessName.trim()}');
    if (focus?.trim().isNotEmpty == true) {
      output.writeln('Focus: ${focus!.trim()}');
    }
    output
      ..writeln('Generated: ${_date(artifact.generatedAt)}')
      ..writeln()
      ..writeln(artifact.summary);
    for (final section in artifact.sections) {
      output
        ..writeln()
        ..writeln((section['heading'] ?? '').toString().toUpperCase())
        ..writeln(section['content'] ?? '');
    }
    if (artifact.limitations.isNotEmpty) {
      output
        ..writeln()
        ..writeln('LIMITATIONS')
        ..writeln(artifact.limitations.join('\n'));
    }
    return output.toString().trim();
  }

  String filename({
    required ManagedGrowthArtifact artifact,
    required String businessName,
    String? focus,
    String extension = 'txt',
  }) {
    final parts = <String>[
      _slug(businessName, fallback: 'business'),
      _slug(artifact.artifactType.replaceAll('_', ' '), fallback: 'managed-growth'),
      if (focus?.trim().isNotEmpty == true) _slug(focus!, fallback: 'draft'),
      _date(artifact.generatedAt),
    ];
    return '${parts.join('-')}.$extension';
  }

  String socialCsv(ManagedGrowthArtifact artifact) {
    final rows = <List<String>>[
      const [
        'platform',
        'content_type',
        'title',
        'body',
        'cta',
        'hashtags',
        'notes',
      ],
      for (final section in artifact.sections)
        [
          _platform(section['heading']?.toString() ?? ''),
          'Draft',
          section['heading']?.toString() ?? '',
          section['content']?.toString() ?? '',
          '',
          '',
          'Business review required before publishing.',
        ],
    ];
    return rows.map((row) => row.map(_csv).join(',')).join('\r\n');
  }

  String _platform(String heading) {
    final lower = heading.toLowerCase();
    for (final platform in const [
      'Facebook',
      'Instagram',
      'Google Business Profile',
      'LinkedIn',
      'TikTok',
    ]) {
      if (lower.contains(platform.toLowerCase())) return platform;
    }
    return 'General';
  }

  String _csv(String value) => '"${value.replaceAll('"', '""')}"';

  String _slug(String value, {required String fallback}) {
    final slug = value
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    return slug.isEmpty ? fallback : slug.substring(0, slug.length.clamp(0, 48));
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
}
