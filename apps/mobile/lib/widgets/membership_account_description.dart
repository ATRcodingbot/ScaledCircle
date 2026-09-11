import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../services/business_workspace_service.dart';

String membershipAccountDescription(Map<String, dynamic>? membership) {
  if (membership?['complimentary'] == true) return 'View your plan and access';
  if (membership?['cancelAtPeriodEnd'] == true) {
    return 'Manage or reactivate your membership';
  }
  if (membership?['paidAccess'] == true) {
    return 'Change or manage your membership';
  }
  return 'View your plan and access';
}

class MembershipAccountDescription extends StatefulWidget {
  const MembershipAccountDescription({super.key});
  @override
  State<MembershipAccountDescription> createState() =>
      _MembershipAccountDescriptionState();
}

class _MembershipAccountDescriptionState
    extends State<MembershipAccountDescription> {
  late final Future<Map<String, dynamic>> _membership =
      BusinessWorkspaceService().call('getBusinessMembership', {
        'businessId': BusinessWorkspaceSession.businessIdFor(
          FirebaseAuth.instance.currentUser!.uid,
        ),
      });
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _membership,
    builder: (context, snapshot) =>
        Text(membershipAccountDescription(snapshot.data)),
  );
}
