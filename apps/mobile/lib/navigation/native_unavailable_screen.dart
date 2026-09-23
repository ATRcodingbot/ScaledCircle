import 'package:flutter/material.dart';
import 'app_router.dart';
import '../widgets/authenticated_sign_out_button.dart';

/// An obsolete external destination must not instantiate a premium screen.
class NativeUnavailableScreen extends StatelessWidget {
  const NativeUnavailableScreen({super.key, this.homeRoute = '/'});
  final String homeRoute;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('ScaledCircle'),
      actions: const [AuthenticatedSignOutButton()],
    ),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'This link opens a tool that is not included in this app version.',
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => AppNavigation.replace(context, homeRoute),
              child: const Text('Return to my workspace'),
            ),
          ],
        ),
      ),
    ),
  );
}
