import 'package:flutter/material.dart';

String socialEvidenceText(dynamic raw, String fallback) {
  final value = raw?.toString().trim() ?? '';
  if (value.isEmpty ||
      RegExp(
        r'\b(not[ _-]?found|undefined|null|nan)\b',
        caseSensitive: false,
      ).hasMatch(value) ||
      RegExp(
        r'\[[a-z_-]+/[a-z_-]+\]|\bHTTP\s*\d{3}\b|^[A-Z][A-Z_]+$',
      ).hasMatch(value)) {
    return fallback;
  }
  return value;
}

String socialQualityLabel(dynamic value) => switch (value) {
  'keep' => 'Ready for your review',
  'improve' => 'Improve this post',
  'replace' => 'Prepare a better version',
  'reschedule' => 'Choose a future time',
  'strong' => 'Strong',
  'needs_attention' => 'Needs attention',
  _ => 'Not assessed yet',
};
String socialCustomerTime(BuildContext context, dynamic raw) {
  final date = DateTime.tryParse(raw?.toString() ?? '')?.toLocal();
  if (date == null) return 'Choose a time';
  final labels = MaterialLocalizations.of(context);
  return '${labels.formatMediumDate(date)} · ${labels.formatTimeOfDay(TimeOfDay.fromDateTime(date))} (device time)';
}

List<String> socialQualityAdvice(Map assessment) {
  final scores = assessment['scores'] as Map? ?? const {};
  const advice = {
    'businessRelevance': 'Make the connection to your Business clear.',
    'serviceRelevance':
        'Describe the specific service this post helps explain.',
    'localRelevance':
        'Mention the relevant service area when it fits the post.',
    'hookStrength': 'Open with a clear, useful reason to keep reading.',
    'copyQuality': 'Use concise, complete copy that explains the value.',
    'ctaQuality': 'Add a clear next step and its correct destination.',
    'repetition': 'Use a distinct angle instead of repeating another draft.',
    'keywordQuality': 'Use natural words customers use for this service.',
    'hashtagQuality': 'Keep hashtags relevant and avoid repetition.',
  };
  return [
    for (final entry in advice.entries)
      if (scores[entry.key] is num && (scores[entry.key] as num) < 75)
        entry.value,
    if (assessment['recommendation'] == 'reschedule')
      'Choose a future publish time, then check quality again.',
  ];
}

// Invalidates customer read models after an authoritative approval receipt.
final socialReviewRevision = ValueNotifier<int>(0);

bool socialPlanApproved(Map plan) =>
    plan['status'] == 'approved' &&
    plan['planVersion'] is num &&
    (plan['planVersion'] as num) > 0 &&
    plan['approvedVersion'] == plan['planVersion'];

String socialPostStateLabel(dynamic state) => switch (state) {
  'approved' => 'Approved',
  'scheduled' => 'Scheduled',
  'published' => 'Published',
  'ready_for_review' || 'needs_review' => 'Needs review',
  'draft' || null => 'Draft',
  _ => 'Needs status review',
};

class SocialPlanPresentation {
  SocialPlanPresentation(this.plans, this.runtime);
  final List<Map<String, dynamic>> plans;
  final Map<String, dynamic> runtime;

  bool get allApproved => plans.isNotEmpty && plans.every(socialPlanApproved);
  List<Map> get ideas => plans
      .expand((p) => (p['items'] as List? ?? const []).whereType<Map>())
      .toList();
  List<Map> get versions => ideas.expand((i) {
    final variants = (i['variants'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    return variants.isEmpty ? [i] : variants;
  }).toList();
  int versionsInState(String state) =>
      versions.where((v) => v['status'] == state).length;
  Map<String, List<Map>> get byPlatform {
    final result = <String, List<Map>>{};
    for (final version in versions) {
      (result[version['provider']?.toString() ?? 'unknown'] ??= []).add(
        version,
      );
    }
    return result;
  }

  int get draftPosts => plans
      .expand((p) => (p['items'] as List? ?? const []).whereType<Map>())
      .fold<int>(0, (total, item) {
        final variants = (item['variants'] as List? ?? const [])
            .whereType<Map>();
        const finalStates = ['approved', 'scheduled', 'published'];
        return total +
            (variants.isEmpty
                ? (!finalStates.contains(item['status']) ? 1 : 0)
                : variants
                      .where((v) => !finalStates.contains(v['status']))
                      .length);
      });

  int? count(String key) {
    if (runtime['available'] != true) return null;
    final value = (runtime['summary'] as Map?)?['counters'] as Map?;
    final number = value?[key];
    return number is num && number >= 0 ? number.toInt() : null;
  }

  String get primaryAction => plans.isEmpty
      ? 'Start Plan'
      : !allApproved
      ? 'Review 30-Day Plan'
      : draftPosts > 0
      ? 'Review Content'
      : (count('scheduled') ?? 0) > 0
      ? 'View Schedule'
      : (count('published') ?? 0) > 0
      ? 'View Results'
      : 'Review Content';

  String? get contentAction => (count('scheduled') ?? 0) > 0
      ? 'View Schedule'
      : draftPosts > 0
      ? 'Review Content'
      : null;
}

/// A successful callable receipt holds presentation while readback catches up.
/// It never edits the workspace, plan approval, or post states.
class SocialPlanApprovalReadback {
  final Map<String, int> _receipts = {};
  bool get pending => _receipts.isNotEmpty;
  void acknowledge(String planId, int version) {
    _receipts[planId] = version;
    socialReviewRevision.value++;
  }

  void reconcile(List<Map<String, dynamic>> plans) {
    _receipts.removeWhere(
      (id, version) => plans.any(
        (p) =>
            p['id'] == id &&
            ((socialPlanApproved(p) && p['planVersion'] == version) ||
                (p['planVersion'] is num &&
                    (p['planVersion'] as num) > version)),
      ),
    );
  }
}
