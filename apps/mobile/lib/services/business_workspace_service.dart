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
  ],
  'Campaign Manager': ['campaigns', 'authorizeCampaigns', 'analytics'],
  'Analyst': ['intelligence', 'analytics'],
  'Finance': ['payments', 'billing'],
  'Custom': [],
};
const businessPresetIds = {
  'Admin': 'admin',
  'Campaign Manager': 'campaignManager',
  'Analyst': 'analyst',
  'Finance': 'finance',
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
