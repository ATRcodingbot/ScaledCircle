import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';

const customerStageLabels = <String, String>{
  'new_lead': 'New lead',
  'contacted': 'Contacted',
  'estimate_scheduled': 'Estimate scheduled',
  'estimate_given': 'Estimate given',
  'won': 'Won',
  'lost': 'Lost',
  'job_scheduled': 'Job scheduled',
  'in_progress': 'In progress',
  'completed': 'Completed',
  'follow_up': 'Follow-up',
};
const workTypeLabels = <String, String>{
  'estimate': 'Estimate',
  'job': 'Job',
  'follow_up': 'Follow-up',
  'meeting': 'Meeting',
  'task': 'Task',
};
const workStatusLabels = <String, String>{
  'scheduled': 'Scheduled',
  'in_progress': 'In progress',
  'completed': 'Completed',
  'canceled': 'Canceled',
  'open': 'Open',
  'done': 'Done',
};
const operationNotificationLabels = <String, String>{
  'assignedJobs': 'Assigned-job updates',
  'scheduleChanges': 'Schedule changes',
  'leadUpdates': 'Lead updates',
  'customerReplies': 'Customer replies',
  'estimateReminders': 'Estimate reminders',
  'paymentBilling': 'Payment and billing alerts',
  'growthApprovals': 'Growth approvals',
  'socialApprovals': 'Social approvals',
};

class BusinessOperationsService {
  String requestId() => List.generate(
    24,
    (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
  Future<Map<String, dynamic>> call(
    String businessId,
    String operation,
    Map<String, dynamic> input, {
    String? requestId,
  }) async {
    final response = await FirebaseFunctions.instanceFor(region: 'us-east1')
        .httpsCallable('businessOperationsV1')
        .call({
          'businessId': businessId,
          'operation': operation,
          'input': input,
          'requestId': ?requestId,
        })
        .timeout(const Duration(seconds: 65));
    return Map<String, dynamic>.from(response.data as Map);
  }
}

/// Every returned item was authorized by the server. Filtering never grants access.
List<Map<String, dynamic>> operationRows(dynamic value) =>
    (value as List? ?? [])
        .map((x) => Map<String, dynamic>.from(x as Map))
        .toList();

bool matchesCustomerSearch(Map<String, dynamic> customer, String search) =>
    ['name', 'company', 'email', 'phone', 'location']
        .map((k) => customer[k] ?? '')
        .join(' ')
        .toLowerCase()
        .contains(search.trim().toLowerCase());
