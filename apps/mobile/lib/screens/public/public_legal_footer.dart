import 'package:flutter/material.dart';

import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';

class PublicLegalFooter extends StatelessWidget {
  const PublicLegalFooter({super.key, this.dark = true});

  final bool dark;

  @override
  Widget build(BuildContext context) {
    final foreground = dark ? const Color(0xFFB8C9D8) : const Color(0xFF42566B);
    return Semantics(
      label: 'Legal and support links',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
        color: dark ? const Color(0xFF020914) : const Color(0xFFF3F7FA),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1080),
            child: Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [
                Text('ScaledCircle · operated by Scaled Circle LLC', style: TextStyle(color: foreground)),
                _FooterLink('Legal', AppRoutes.legal, foreground),
                _FooterLink('Terms', AppRoutes.terms, foreground),
                _FooterLink('Privacy', AppRoutes.privacy, foreground),
                _FooterLink('Payments & Refunds', AppRoutes.refunds, foreground),
                _FooterLink('Support', AppRoutes.support, foreground),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FooterLink extends StatelessWidget {
  const _FooterLink(this.label, this.route, this.color);
  final String label;
  final String route;
  final Color color;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: () => AppNavigation.push(context, route),
    child: Text(label, style: TextStyle(color: color, decoration: TextDecoration.underline)),
  );
}
