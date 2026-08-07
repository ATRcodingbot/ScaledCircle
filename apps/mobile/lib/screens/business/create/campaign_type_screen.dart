import 'package:flutter/material.dart';

import 'flyer_campaign_screen.dart';
import 'cleanup_campaign_screen.dart';

class CampaignTypeScreen extends StatelessWidget {
  const CampaignTypeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Campaign'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [

            const Text(
              'What type of campaign are you creating?',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),

            const SizedBox(height: 30),

            _CampaignTypeCard(
              icon: Icons.local_post_office,
              title: 'Flyer Distribution',
              description:
                  'Have Scalers distribute marketing materials '
                  'with maps, zones, and GPS verification.',
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const FlyerCampaignScreen(),
                  ),
                );
              },
            ),

            const SizedBox(height: 20),

            _CampaignTypeCard(
              icon: Icons.cleaning_services,
              title: 'Job Site Cleanup',
              description:
                  'Hire Scalers for cleanup work using '
                  'before and after photo verification.',
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const CleanupCampaignScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}


class _CampaignTypeCard extends StatelessWidget {

  final IconData icon;
  final String title;
  final String description;
  final VoidCallback onTap;

  const _CampaignTypeCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });


  @override
  Widget build(BuildContext context) {

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),

      child: Card(
        elevation: 3,

        child: Padding(
          padding: const EdgeInsets.all(20),

          child: Row(
            children: [

              Icon(
                icon,
                size: 45,
              ),

              const SizedBox(width: 20),

              Expanded(
                child: Column(
                  crossAxisAlignment:
                      CrossAxisAlignment.start,

                  children: [

                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 8),

                    Text(description),

                  ],
                ),
              ),

              const Icon(
                Icons.arrow_forward_ios,
              ),
            ],
          ),
        ),
      ),
    );
  }
}