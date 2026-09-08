/// Presentation of authoritative work state, independent of device GPS state.
enum WorkSection { active, review, completed, other }

WorkSection workSection(String? status) => switch (status) {
  'submitted' ||
  'review_pending' ||
  'verification_pending' ||
  'incomplete_review' => WorkSection.review,
  'completed' || 'approved' || 'paid' => WorkSection.completed,
  'assigned' ||
  'accepted' ||
  'in_progress' ||
  'paused' ||
  'paused_work_window' ||
  'paused_out_of_window' ||
  'ready' => WorkSection.active,
  _ => WorkSection.other,
};

bool workIsSubmitted(String? status) =>
    workSection(status) == WorkSection.review;

String routeCaptureLabel(Map<String, dynamic> zone) {
  if (workIsSubmitted(zone['status']?.toString())) {
    return 'Route captured · awaiting review';
  }
  if (workSection(zone['status']?.toString()) == WorkSection.completed) {
    return 'Work approved';
  }
  if (zone['status'] == 'paused_work_window') {
    return 'Work paused · route saved';
  }
  if (zone['status'] == 'incomplete_review') return 'Saved work needs review';
  if (zone['gpsTracking'] == true && zone['activeTrackingSessionId'] != null) {
    return 'Route tracking active';
  }
  if (zone['routeId'] != null) return 'Route captured';
  return 'Route tracking begins with Start Job';
}
