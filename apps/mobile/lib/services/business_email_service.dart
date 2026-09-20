import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'business_workspace_service.dart';

Map<String, dynamic> businessEmailConnectionInput(
  Map<String, dynamic> input, {
  required bool providerSelectionSupported,
}) {
  if (providerSelectionSupported) return Map.of(input);
  if (input['provider'] != 'google') {
    throw StateError('This mailbox provider is not available yet.');
  }
  return {'read': input['read'], 'send': input['send']};
}

class BusinessEmailService {
  Future<Map<String, dynamic>> call(
    String operation, [
    Map<String, dynamic> input = const {},
  ]) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) throw StateError('Sign in to your Business.');
    final response = await FirebaseFunctions.instanceFor(region: 'us-east1')
        .httpsCallable('businessEmailOperationsV1')
        .call({
          'businessId': BusinessWorkspaceSession.businessIdFor(uid),
          'operation': operation,
          'input': input,
        })
        .timeout(const Duration(seconds: 120));
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>?> availability() async {
    try {
      return await call('load');
    } on FirebaseFunctionsException catch (e) {
      if ([
        'permission-denied',
        'not-found',
        'unimplemented',
      ].contains(e.code)) {
        return null;
      }
      rethrow;
    }
  }
}

String businessEmailState(dynamic state) => switch (state) {
  'received' => 'New inquiry — no email sent',
  'queued' => 'Campaign approved — waiting for its send window',
  'suppressed' => 'Skipped — recipient is excluded',
  'held' => 'Needs attention — nothing sent',
  'sent' => 'Sent — delivery not confirmed',
  'draft' => 'Draft — not sent',
  'sending' ||
  'needs_reconciliation' => 'Send status needs checking — do not resend',
  _ => 'Awaiting review',
};

String businessEmailHealth(dynamic health) => switch (health) {
  'read_only' => 'Read Only · Send permission needed',
  'read_permission_needed' =>
    'Connected · Read permission needed to check replies',
  'needs_attention' => 'Needs Attention',
  'reconnect_required' => 'Reconnect Required',
  'not_connected' => 'Not connected',
  _ => 'Connected',
};

String businessEmailOutcome(dynamic state) => switch (state) {
  'interested' => 'Interested',
  'not_interested' => 'Not interested',
  'follow_up_required' => 'Follow-up needed',
  'meeting' => 'Meeting booked',
  'appointment' => 'Appointment booked',
  'estimate' => 'Estimate provided',
  'won' => 'Work won',
  'lost' => 'Work lost',
  'do_not_contact' => 'Do not contact',
  'unsubscribed' => 'Unsubscribed',
  'bounced' => 'Bounced / invalid address',
  _ => 'Needs evidence review',
};
