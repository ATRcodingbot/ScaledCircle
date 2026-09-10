import '../../config/app_environment.dart';
import '../scaler/affiliate/scaler_affiliate_screen.dart';
import 'package:flutter/material.dart';
import '../../services/business_workspace_service.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import 'business_team_screen.dart';
import 'business_membership_screen.dart';
import 'profile/business_profile_screen.dart';
import '../auth/complete_business_profile_screen.dart';

class BusinessAccountScreen extends StatelessWidget {
  const BusinessAccountScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Account'),
      actions: const [AuthenticatedSignOutButton()],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              BusinessWorkspaceSession.value?['businessName']?.toString() ??
                  'Business Account',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            if (BusinessWorkspaceSession.value?['isOwner'] == true)
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit Business profile'),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const CompleteBusinessProfileScreen(),
                  ),
                ),
              ),
            if (BusinessWorkspaceSession.value?['isOwner'] == true)
              ListTile(
                leading: const Icon(Icons.business_outlined),
                title: const Text('Business Profile'),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const BusinessProfileScreen(),
                  ),
                ),
              ),
            ListTile(
              leading: const Icon(Icons.people_outline),
              title: const Text('Team'),
              subtitle: const Text('Members, invitations and seats'),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const BusinessTeamScreen()),
              ),
            ),
            if (BusinessWorkspaceSession.can('billing'))
              ListTile(
                leading: const Icon(Icons.credit_card_outlined),
                title: const Text('Billing / Plan'),
                subtitle: const Text('Manage, cancel or reactivate membership'),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const BusinessMembershipScreen(),
                  ),
                ),
              ),
            if ((AppEnvironmentConfig.isStaging ||
                    AppEnvironmentConfig.isLocal) &&
                BusinessWorkspaceSession.value?['isOwner'] == true)
              ListTile(
                leading: const Icon(Icons.share_outlined),
                title: const Text('Referrals'),
                subtitle: const Text('Businesses and Scalers you referred'),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ScalerAffiliateScreen(),
                  ),
                ),
              ),
            const Divider(),
            const ListTile(
              title: Text('Switch accounts'),
              subtitle: Text(
                'Use Sign Out at the top, then sign in with another account.',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
