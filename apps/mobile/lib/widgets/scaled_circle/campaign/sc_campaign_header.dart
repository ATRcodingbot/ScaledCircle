import 'package:flutter/material.dart';

import '../sc_card.dart';
import '../sc_stat_chip.dart';

class ScCampaignHeader extends StatelessWidget {
  final IconData icon;
  final String campaignType;
  final String title;
  final String description;

  final double pay;
  final int scalerCount;

  final String locationText;

  const ScCampaignHeader({
    super.key,

    required this.icon,
    required this.campaignType,
    required this.title,
    required this.description,
    required this.pay,
    required this.scalerCount,
    required this.locationText,
  });

  @override
  Widget build(BuildContext context) {
    return ScCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),

                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),

                  color: Theme.of(
                    context,
                  ).colorScheme.primary.withValues(alpha: .12),
                ),

                child: Icon(
                  icon,

                  size: 30,

                  color: Theme.of(context).colorScheme.primary,
                ),
              ),

              const SizedBox(width: 14),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,

                  children: [
                    Text(
                      campaignType,

                      style: Theme.of(context).textTheme.labelLarge,
                    ),

                    const SizedBox(height: 4),

                    Text(
                      title,

                      style: const TextStyle(
                        fontSize: 22,

                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          Text(description, style: const TextStyle(fontSize: 15)),

          const SizedBox(height: 20),

          Wrap(
            spacing: 10,

            runSpacing: 10,

            children: [
              ScStatChip(
                icon: Icons.payments_outlined,

                label: "\$${pay.toStringAsFixed(0)}",
              ),

              ScStatChip(
                icon: Icons.groups_outlined,

                label: "$scalerCount Scalers",
              ),

              ScStatChip(icon: Icons.location_on_outlined, label: locationText),
            ],
          ),
        ],
      ),
    );
  }
}
