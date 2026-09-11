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
  int get draftPosts => plans
      .expand((p) => (p['items'] as List? ?? const []).whereType<Map>())
      .where((item) {
        final variants = (item['variants'] as List? ?? const [])
            .whereType<Map>();
        const finalStates = ['approved', 'scheduled', 'published'];
        return variants.isEmpty
            ? !finalStates.contains(item['status'])
            : variants.any((v) => !finalStates.contains(v['status']));
      })
      .length;

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
      ? 'Review Draft Posts'
      : 'View Posts';

  String? get contentAction => (count('scheduled') ?? 0) > 0
      ? 'Review scheduled content'
      : draftPosts > 0
      ? 'Review Draft Posts'
      : null;
}

/// A successful callable receipt holds presentation while readback catches up.
/// It never edits the workspace, plan approval, or post states.
class SocialPlanApprovalReadback {
  final Map<String, int> _receipts = {};
  bool get pending => _receipts.isNotEmpty;
  void acknowledge(String planId, int version) => _receipts[planId] = version;
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
