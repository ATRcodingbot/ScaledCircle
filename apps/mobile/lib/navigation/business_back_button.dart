import 'package:flutter/material.dart';

import 'app_router.dart';
import 'app_routes.dart';

typedef BusinessBackGuard = Future<bool> Function();

class BusinessBackButton extends StatelessWidget {
  const BusinessBackButton({
    super.key,
    this.beforeNavigate,
    this.tooltip = 'Back to Business dashboard',
  });

  final BusinessBackGuard? beforeNavigate;
  final String tooltip;

  static Future<void> navigate(
    BuildContext context, {
    BusinessBackGuard? beforeNavigate,
  }) async {
    if (beforeNavigate != null && !await beforeNavigate()) return;
    if (!context.mounted) return;

    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
      return;
    }

    AppNavigation.replace(context, AppRoutes.businessDashboard);
  }

  @override
  Widget build(BuildContext context) => IconButton(
    key: const Key('business-page-back-button'),
    tooltip: tooltip,
    icon: const Icon(Icons.arrow_back),
    onPressed: () => navigate(context, beforeNavigate: beforeNavigate),
  );
}
