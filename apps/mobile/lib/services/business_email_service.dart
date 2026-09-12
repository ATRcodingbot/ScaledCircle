import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'business_workspace_service.dart';

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
  'sent' => 'Sent — delivery not confirmed',
  'draft' => 'Draft — not sent',
  'sending' ||
  'needs_reconciliation' => 'Send status needs checking — do not resend',
  _ => 'Awaiting review',
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
