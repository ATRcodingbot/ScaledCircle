import 'package:flutter/material.dart';

/// Availability copy only. This widget grants no execution or billing authority.
class CustomerCapabilityStatus extends StatelessWidget {
  const CustomerCapabilityStatus({super.key, this.foregroundColor});
  final Color? foregroundColor;

  static const capabilities = <({String title, String description})>[
    (
      title: 'Social Manager — Beta',
      description:
          'Plan content, review recommendations, and approve supported publishing. ScaledCircle is testing it on its own channels; results are still being measured.',
    ),
    (
      title: 'Lead Generation Research — Beta',
      description:
          'Prospect research, evidence, qualification and drafts. Research does not authorize outreach; delivered leads and sales are not guaranteed.',
    ),
    (
      title: 'Business Assistant — Beta',
      description:
          'Review business information and suggested next steps. Recommendations need your judgment and approval.',
    ),
    (
      title: 'Ad Manager — Beta',
      description:
          'Prepare advertising strategy, draft creative, and proposed budgets. Planning does not launch ads or authorize spend.',
    ),
    (
      title: 'Printing — Coming Soon',
      description:
          'Planned: order flyers or door hangers after reviewing quantity, total cost, and delivery estimates. Printing orders are not available yet.',
    ),
    (
      title: 'Postcard Campaigns — Beta',
      description:
          'Neighborhood mail fulfilled by ScaledCircle. The managed quote, print and mail workflow is being verified; customer payments are not enabled yet.',
    ),
  ];

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (final capability in capabilities)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: Text(
                  capability.title,
                  style: TextStyle(
                    color: foregroundColor,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                capability.description,
                style: TextStyle(height: 1.5, color: foregroundColor),
              ),
            ],
          ),
        ),
    ],
  );
}
