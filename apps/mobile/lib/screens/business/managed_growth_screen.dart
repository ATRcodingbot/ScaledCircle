import 'package:flutter/material.dart';

class ManagedGrowthScreen extends StatelessWidget {
  const ManagedGrowthScreen({super.key, this.postcardHandoff});

  final Map<String, dynamic>? postcardHandoff;

  @override
  Widget build(BuildContext context) {
    const packages = <(IconData, String, String)>[
      (
        Icons.calendar_month_outlined,
        '30-Day Growth Plan',
        'A coordinated four-week strategy, not disconnected daily ideas.',
      ),
      (
        Icons.share_outlined,
        'Social Content',
        'Generate, preview, edit, copy, and export a 30-day content package.',
      ),
      (
        Icons.campaign_outlined,
        'Advertising',
        'Ad concepts, audiences, creative briefs, and budget ranges. No automatic ad spend.',
      ),
      (
        Icons.search_outlined,
        'SEO Action Plan',
        'Service-page, local content, FAQ, title, meta, and internal-link recommendations.',
      ),
      (
        Icons.email_outlined,
        'Email Sequence',
        'Drafts for an existing consented audience. No scraped lists or automatic sending.',
      ),
      (
        Icons.markunread_mailbox_outlined,
        'Postcards / Direct Mail',
        'Postal delivery planned as its own physical channel, with printing, postage, and vendor costs separate.',
      ),
      (
        Icons.route_outlined,
        'Field Campaigns',
        'Verified local distribution and field execution. Standard jobs do not require homeowner conversations.',
      ),
      (
        Icons.record_voice_over_outlined,
        'Door-to-Door Outreach',
        'Optional person-to-person outreach with separate Business selection, disclosure, Scaler consent, and compensation.',
      ),
      (
        Icons.home_work_outlined,
        'Property Opportunities',
        'Use authoritative Property Intelligence to decide where to test a campaign.',
      ),
      (
        Icons.cloud_outlined,
        'Weather Opportunities',
        'Use authoritative Weather Intelligence to help decide when to act.',
      ),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Managed Growth — Beta')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Your marketing shouldn’t stop when you’re busy.',
            style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          const Text(
            'One strategy. Digital + physical. AI planned. Real-world execution. Results measured.',
          ),
          const SizedBox(height: 16),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'LIMITED BETA • Plans choose the right channel, area, and time instead of using every service. Overlapping physical campaigns require explicit coordinated-follow-up approval. No channel launches automatically.',
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (postcardHandoff != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Postcard draft context retained • ${postcardHandoff!['propertyCount'] ?? 'Unknown'} represented addresses • geometry preserved • Business approval required before any quote or fulfillment.',
                ),
              ),
            ),
          ...packages.map(
            (item) => Card(
              child: ListTile(
                leading: Icon(item.$1),
                title: Text(item.$2),
                subtitle: Text(item.$3),
                trailing: const Chip(label: Text('Generate / Export')),
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Separate spend',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          const Text(
            'The \$999 subscription covers software, intelligence, planning, and the creative/management layer. Advertising spend, printing, postage, and third-party media or vendor costs are separate. Revisions are scoped; this is not unlimited agency labor.',
          ),
        ],
      ),
    );
  }
}
