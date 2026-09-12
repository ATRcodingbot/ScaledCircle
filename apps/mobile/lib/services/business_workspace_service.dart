import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

const businessPermissionLabels = <String, String>{
  'campaigns': 'Campaigns',
  'authorizeCampaigns': 'Authorize Campaigns',
  'payments': 'Payments',
  'intelligence': 'Intelligence & Growth Tools',
  'analytics': 'Analytics & Results',
  'teamManagement': 'Team Management',
  'billing': 'Billing & Plan',
  'customersView': 'View customers and leads',
  'customersEdit': 'Edit customers and leads',
  'scheduleView': 'View schedule',
  'scheduleEdit': 'Edit schedule',
  'assignPeople': 'Assign people',
  'jobsView': 'View all internal jobs',
  'jobsAssigned': 'View assigned internal jobs',
  'jobsEdit': 'Edit internal jobs',
  'jobsStatus': 'Update assigned job status',
  'communicationsRead': 'Read authorized customer conversations',
  'communicationsSend': 'Send approved customer email',
  'outreachApproval': 'Approve Growth outreach',
  'workspaceSettings': 'Edit Business settings',
  'integrations': 'Manage Business integrations',
};
const businessPresets = <String, List<String>>{
  'Admin': [
    'campaigns',
    'authorizeCampaigns',
    'payments',
    'intelligence',
    'analytics',
    'teamManagement',
    'billing',
    'customersView',
    'customersEdit',
    'scheduleView',
    'scheduleEdit',
    'assignPeople',
    'jobsView',
    'jobsAssigned',
    'jobsEdit',
    'jobsStatus',
    'communicationsRead',
    'communicationsSend',
    'outreachApproval',
    'workspaceSettings',
    'integrations',
  ],
  'Campaign Manager': ['campaigns', 'authorizeCampaigns', 'analytics'],
  'Analyst': ['intelligence', 'analytics'],
  'Finance': ['payments', 'billing'],
  'Office Manager': [
    'customersView',
    'customersEdit',
    'scheduleView',
    'scheduleEdit',
    'assignPeople',
    'jobsView',
    'jobsEdit',
    'jobsStatus',
    'communicationsRead',
    'communicationsSend',
  ],
  'Project Manager': [
    'customersView',
    'scheduleView',
    'scheduleEdit',
    'assignPeople',
    'jobsView',
    'jobsEdit',
    'jobsStatus',
  ],
  'Sales': [
    'customersView',
    'customersEdit',
    'scheduleView',
    'scheduleEdit',
    'communicationsRead',
    'communicationsSend',
  ],
  'Field User': ['jobsAssigned', 'jobsStatus'],
  'Custom': [],
};
const businessPresetIds = {
  'Admin': 'admin',
  'Campaign Manager': 'campaignManager',
  'Analyst': 'analyst',
  'Finance': 'finance',
  'Office Manager': 'officeManager',
  'Project Manager': 'projectManager',
  'Sales': 'sales',
  'Field User': 'fieldUser',
  'Custom': 'custom',
};

/// UI routing metadata only. Every server action and Firestore read rechecks
/// canonical membership; this value never grants authority.
abstract final class BusinessWorkspaceSession {
  static Map<String, dynamic>? value;
  static String businessIdFor(String uid) =>
      value?['actorUid'] == uid ? value!['businessId'].toString() : uid;
  static bool can(String permission) =>
      value?['actorUid'] == FirebaseAuth.instance.currentUser?.uid &&
      (value?['permissions'] as List? ?? []).contains(permission);
  static void clear() => value = null;
}

class BusinessWorkspaceService {
  Future<Map<String, dynamic>> call(
    String name, [
    Map<String, dynamic> data = const {},
  ]) async {
    final result = await FirebaseFunctions.instanceFor(
      region: 'us-east1',
    ).httpsCallable(name).call(data).timeout(const Duration(seconds: 25));
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> context() async {
    final value = await call('getBusinessWorkspaceContext');
    if (value['actorUid'] != FirebaseAuth.instance.currentUser?.uid) {
      throw StateError('Session changed');
    }
    BusinessWorkspaceSession.value = value;
    return value;
  }
}
