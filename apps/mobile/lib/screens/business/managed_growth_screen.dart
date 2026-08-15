import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/managed_growth_service.dart';
import 'business_growth_profile_wizard.dart';

class ManagedGrowthScreen extends StatefulWidget {
  const ManagedGrowthScreen({super.key, this.postcardHandoff});
  final Map<String, dynamic>? postcardHandoff;
  @override
  State<ManagedGrowthScreen> createState() => _ManagedGrowthScreenState();
}

class _ManagedGrowthScreenState extends State<ManagedGrowthScreen> {
  final _service = ManagedGrowthService();
  BusinessGrowthProfile? _profile;
  final Map<String, ManagedGrowthArtifact> _artifacts = {};
  bool _loading = true;

  static const _packages = <({IconData icon, String type, String title, String description})>[
    (
      icon: Icons.insights_outlined,
      type: 'business_analysis',
      title: 'AI Business Analysis',
      description:
          'A grounded growth assessment using only saved Business-supplied and authoritative platform information.',
    ),
    (
      icon: Icons.calendar_month_outlined,
      type: 'growth_plan_30_day',
      title: '30-Day Growth Plan',
      description:
          'A coordinated four-week plan using only channels supported by your objective and evidence.',
    ),
    (
      icon: Icons.share_outlined,
      type: 'social_package',
      title: 'Social Content',
      description:
          'Platform-specific drafts, CTAs, engagement prompts, keywords, posting windows, and creative briefs.',
    ),
    (
      icon: Icons.campaign_outlined,
      type: 'advertising_plan',
      title: 'Advertising Strategy',
      description:
          'Planning only: audience, geography, copy, creative, landing page, and budget allocation. No ad launch.',
    ),
    (
      icon: Icons.search_outlined,
      type: 'seo_plan',
      title: 'SEO Action Plan',
      description:
          'Pages, titles, metadata, FAQs, local themes, articles, GBP content, and internal links. No ranking guarantees.',
    ),
    (
      icon: Icons.email_outlined,
      type: 'email_sequence',
      title: 'Email Sequence',
      description:
          'Drafts for an existing consented audience. No scraped lists or automatic sending.',
    ),
    (
      icon: Icons.markunread_mailbox_outlined,
      type: 'direct_mail_plan',
      title: 'Postcards / Direct Mail',
      description:
          'A physical-channel draft with printing, postage, vendor cost, and the 20% management fee separated.',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final value = await _service.loadProfile();
      if (mounted) setState(() => _profile = value);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<String> _lines(String value) => value
      .split(RegExp(r'[,\n]'))
      .map((v) => v.trim())
      .where((v) => v.isNotEmpty)
      .toList(growable: false);

  Future<void> _editProfile() async {
    final payload = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) =>
            BusinessGrowthProfileWizard(initialProfile: _profile?.data),
      ),
    );
    if (payload != null) {
      try {
        final value = await _service.saveProfile(payload);
        if (mounted) {
          setState(() => _profile = value);
        }
      } on FirebaseFunctionsException catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.message ?? 'Unable to save the profile.'),
            ),
          );
        }
      }
    }
  }

  Future<void> _generate(String type, String title) async {
    if (_profile?.isReady != true) {
      await _editProfile();
      if (_profile?.isReady != true) return;
    }
    final instruction = TextEditingController();
    final budget = TextEditingController(
      text: _profile?.data['plannedAdBudget']?.toString() ?? '',
    );
    final platforms = TextEditingController(text: 'Facebook, Instagram');
    final audience = TextEditingController();
    var mode = 'organic_only';
    if (!mounted) return;
    final run = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: Text('Generate $title'),
          content: SizedBox(
            width: 560,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const ListTile(
                  leading: Icon(Icons.verified_outlined),
                  title: Text('Business Profile Ready'),
                  subtitle: Text(
                    'Saved profile context will be loaded automatically.',
                  ),
                ),
                TextField(
                  controller: instruction,
                  decoration: const InputDecoration(
                    labelText: 'Optional objective or instruction',
                    hintText:
                        "Example: Focus this month's content on decks and fences.",
                  ),
                ),
                if (type == 'growth_plan_30_day')
                  DropdownButtonFormField<String>(
                    initialValue: mode,
                    decoration: const InputDecoration(labelText: 'Mode'),
                    items: const [
                      DropdownMenuItem(
                        value: 'organic_only',
                        child: Text('Organic Only'),
                      ),
                      DropdownMenuItem(
                        value: 'organic_paid_planning',
                        child: Text('Organic + Paid Planning'),
                      ),
                      DropdownMenuItem(value: 'custom', child: Text('Custom')),
                    ],
                    onChanged: (value) =>
                        setModalState(() => mode = value ?? mode),
                  ),
                if (type == 'advertising_plan')
                  TextField(
                    controller: budget,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Planned Budget',
                      helperText: 'Actual Spend: Not connected',
                    ),
                  ),
                if (type == 'social_package')
                  TextField(
                    controller: platforms,
                    decoration: const InputDecoration(
                      labelText: 'Platforms',
                      helperText:
                          'Facebook, Instagram, Google Business Profile, LinkedIn, etc.',
                    ),
                  ),
                if (type == 'email_sequence')
                  TextField(
                    controller: audience,
                    decoration: const InputDecoration(
                      labelText: 'Existing consented audience',
                      helperText:
                          'Existing customers, past customers, or consented leads',
                    ),
                  ),
                const SizedBox(height: 10),
                const Text(
                  'Draft generation never publishes, sends, orders, funds, or launches a campaign.',
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Generate'),
            ),
          ],
        ),
      ),
    );
    if (run == true) {
      try {
        final value = await _service.generate(
          artifactType: type,
          instruction: instruction.text,
          mode: mode,
          platforms: _lines(platforms.text),
          audience: audience.text,
          plannedBudget: num.tryParse(budget.text),
          propertyContext: widget.postcardHandoff,
        );
        if (mounted) {
          setState(() => _artifacts[type] = value);
          await _view(value);
        }
      } on FirebaseFunctionsException catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                error.message ?? 'Generation is temporarily unavailable.',
              ),
            ),
          );
        }
      }
    }
    instruction.dispose();
    budget.dispose();
    platforms.dispose();
    audience.dispose();
  }

  Future<void> _copy(ManagedGrowthArtifact value, {bool export = false}) async {
    await Clipboard.setData(ClipboardData(text: value.toPlainText()));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            export
                ? 'Plain-text export copied to clipboard'
                : 'Copied to clipboard',
          ),
        ),
      );
    }
  }

  Future<void> _view(ManagedGrowthArtifact value) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(value.title),
      content: SizedBox(
        width: 720,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value.summary),
              for (final section in value.sections) ...[
                const SizedBox(height: 14),
                Text(
                  section['heading']?.toString() ?? '',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(section['content']?.toString() ?? ''),
              ],
              if (value.limitations.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text(
                  'LIMITATIONS',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(value.limitations.join('\n')),
              ],
              const SizedBox(height: 16),
              const Text(
                'Image Briefs are included where useful. Generate Image — Coming Soon / Beta.',
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton.icon(
          onPressed: () => _copy(value),
          icon: const Icon(Icons.copy),
          label: const Text('Copy'),
        ),
        TextButton.icon(
          onPressed: () => _copy(value, export: true),
          icon: const Icon(Icons.download_outlined),
          label: const Text('Export Text'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Managed Growth — Beta')),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Your marketing shouldn’t stop when you’re busy.',
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
              ),
              const Text('RIGHT CHANNEL • RIGHT AREA • RIGHT TIME'),
              Card(
                child: ListTile(
                  leading: Icon(
                    _profile?.isReady == true
                        ? Icons.check_circle_outline
                        : Icons.tune,
                  ),
                  title: Text(
                    _profile?.isReady == true
                        ? 'Business Profile Ready'
                        : 'Set Up Your Growth Profile',
                  ),
                  subtitle: Text(
                    _profile?.isReady == true
                        ? 'Profile version ${_profile!.profileVersion}. Saved context grounds every generation.'
                        : "Tell ScaledCircle about your business once. We'll reuse it for relevant marketing drafts.",
                  ),
                  trailing: TextButton(
                    onPressed: _editProfile,
                    child: Text(
                      _profile?.isReady == true
                          ? 'View / Edit'
                          : 'Set Up Profile',
                    ),
                  ),
                ),
              ),
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'LIMITED BETA • Drafts require Business approval. No channel launches automatically. Unknown facts remain unknown.',
                  ),
                ),
              ),
              if (widget.postcardHandoff != null)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      'Property context retained • ${widget.postcardHandoff!['propertyCount'] ?? 'Unknown'} represented addresses • no unavailable access characteristic inferred.',
                    ),
                  ),
                ),
              const Padding(
                padding: EdgeInsets.only(top: 12, bottom: 6),
                child: Text(
                  'What do you want to work on today?',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                ),
              ),
              ..._packages.map((item) {
                final artifact = _artifacts[item.type];
                final priority =
                    (_profile?.data['priorityServices'] as List? ?? const [])
                        .map((value) => value.toString())
                        .where((value) => value.isNotEmpty)
                        .firstOrNull;
                final friendlyTitle = switch (item.type) {
                  'business_analysis' =>
                    priority == null
                        ? 'Help me choose what to promote'
                        : 'Help me get more $priority jobs',
                  'growth_plan_30_day' => 'Plan my next 30 days',
                  'social_package' => "Create this week's posts",
                  'advertising_plan' => 'Create an ad plan',
                  'seo_plan' => 'Improve my Google / SEO presence',
                  'email_sequence' => 'Create an email',
                  'direct_mail_plan' => 'Plan a postcard campaign',
                  _ => item.title,
                };
                return Card(
                  child: ListTile(
                    leading: Icon(item.icon),
                    title: Text(friendlyTitle),
                    subtitle: Text(item.description),
                    trailing: Wrap(
                      spacing: 6,
                      children: [
                        if (artifact != null)
                          TextButton(
                            onPressed: () => _view(artifact),
                            child: const Text('View'),
                          ),
                        if (artifact != null)
                          IconButton(
                            tooltip: 'Copy',
                            onPressed: () => _copy(artifact),
                            icon: const Icon(Icons.copy_outlined),
                          ),
                        FilledButton(
                          onPressed: () => _generate(item.type, friendlyTitle),
                          child: Text(
                            artifact == null ? 'Generate' : 'Regenerate',
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
              const Card(
                child: ListTile(
                  enabled: false,
                  leading: Icon(Icons.image_outlined),
                  title: Text('Generate Image — Coming Soon / Beta'),
                  subtitle: Text(
                    'Creative briefs are available now. Image generation will remain optional and separately metered.',
                  ),
                ),
              ),
              const Text(
                'Separate spend',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const Text(
                'The \$999 list-price subscription covers software, intelligence, planning, and creative drafts. Worker pay, advertising spend, printing, postage, fulfillment, vendor costs, and future overages remain separate.',
              ),
            ],
          ),
  );
}
