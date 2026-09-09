import 'package:flutter/material.dart';
import 'app_router.dart';

/// Returns to the real caller, with a safe destination for direct links.
class ContextBackButton extends StatelessWidget {
  const ContextBackButton({super.key, this.fallback = '/'});
  final String fallback;

  @override
  Widget build(BuildContext context) => BackButton(
    onPressed: () {
      final navigator = Navigator.of(context);
      if (navigator.canPop()) {
        navigator.pop();
      } else if (!(AppRouterScope.maybeOf(context)?.popPreviousRoute(context) ??
          false)) {
        AppNavigation.replace(context, fallback);
      }
    },
  );
}
