import 'package:flutter/material.dart';

/// Presentation aliases only. Customer-authored titles are never rewritten.
String campaignDisplayName(String value) => switch (value) {
  'IOS_PHYSICAL_CERTIFICATION' => 'iOS Physical Certification',
  'ANDROID_PHYSICAL_CERTIFICATION' => 'Android Physical Certification',
  _ => value,
};

/// Status occupies its own line so it cannot consume the title's width.
class CampaignCardHeader extends StatelessWidget {
  const CampaignCardHeader({
    super.key,
    required this.title,
    required this.icon,
    this.subtitle,
    this.businessName,
    this.status,
  });

  final String title;
  final IconData icon;
  final String? subtitle;
  final String? businessName;
  final Widget? status;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final titleWidget = Text(
        campaignDisplayName(title),
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
      );
      // At large accessibility sizes the title gets the entire card width.
      final stacked =
          constraints.maxWidth / MediaQuery.textScalerOf(context).scale(1) <
          240;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (stacked) ...[
            CircleAvatar(child: Icon(icon)),
            const SizedBox(height: 8),
            titleWidget,
          ] else
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(child: Icon(icon)),
                const SizedBox(width: 12),
                Expanded(child: titleWidget),
              ],
            ),
          if (status != null) ...[const SizedBox(height: 8), status!],
          if (subtitle != null &&
              subtitle!.isNotEmpty &&
              subtitle != title) ...[
            const SizedBox(height: 4),
            Text(
              campaignDisplayName(subtitle!),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ],
          if (businessName != null && businessName!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(businessName!),
          ],
        ],
      );
    },
  );
}
