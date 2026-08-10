import 'package:flutter/material.dart';

import '../models/user/user_profile.dart';
import '../navigation/app_routes.dart';
import '../services/user/user_service.dart';

class AccountModeSwitchButton extends StatefulWidget {
  const AccountModeSwitchButton({
    super.key,
    required this.targetView,
  });

  final UserRole targetView;

  @override
  State<AccountModeSwitchButton> createState() =>
      _AccountModeSwitchButtonState();
}

class _AccountModeSwitchButtonState extends State<AccountModeSwitchButton> {
  final UserService _userService = UserService();

  bool _switching = false;

  Future<void> _switchView() async {
    setState(() {
      _switching = true;
    });

    try {
      final accountType = UserProfile.roleValue(widget.targetView);

      await _userService.switchAccountView(accountType: accountType);

      if (!mounted) {
        return;
      }

      final route = widget.targetView == UserRole.business
          ? AppRoutes.businessDashboard
          : AppRoutes.scalerDashboard;

      Navigator.pushReplacementNamed(context, route);
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to switch account view: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _switching = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final switchingToBusiness = widget.targetView == UserRole.business;

    return IconButton(
      tooltip: switchingToBusiness
          ? 'Switch to Business view'
          : 'Switch to Scaler view',
      onPressed: _switching ? null : _switchView,
      icon: _switching
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(
              switchingToBusiness
                  ? Icons.business_outlined
                  : Icons.directions_walk_outlined,
            ),
    );
  }
}
