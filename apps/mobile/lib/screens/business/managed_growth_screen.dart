import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/artifact_download.dart';
import '../../services/artifact_export_service.dart';
import '../../services/managed_growth_service.dart';
import 'business_growth_profile_wizard.dart';
import 'social_approval_screen.dart';

class ManagedGrowthScreen extends StatefulWidget {
  const ManagedGrowthScreen({super.key, this.postcardHandoff});
  final Map<String, dynamic>? postcardHandoff;
  @override
  State<ManagedGrowthScreen> createState() => _ManagedGrowthScreenState();
}

class _ManagedGrowthScreenState extends State<ManagedGrowthScreen> {
  final _service = ManagedGrowthService();
  final _exports = const ArtifactExportService();
  BusinessGrowthProfile? _profile;
  final Map<String, ManagedGrowthArtifact> _artifacts = {};
  String? _deliveryEmail;
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
      final values = await Future.wait([
        _service.loadProfile(),
        _service.loadArtifactDeliveryEmail(),
      ]);
      if (mounted) {
        setState(() {
          _profile = values[0] as BusinessGrowthProfile?;
          _deliveryEmail = values[1] as String?;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

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
    final selectedPlatforms = <String>{'Facebook', 'Instagram'};
    var socialAction = 'Call us';
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
                if (type == 'social_package') ...[
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Where should we prepare these posts?'),
                  ),
                  Wrap(
                    spacing: 6,
                    children:
                        ['Facebook', 'Instagram', 'Google Business', 'LinkedIn']
                            .map(
                              (platform) => FilterChip(
                                label: Text(platform),
                                selected: selectedPlatforms.contains(platform),
                                onSelected: (selected) => setModalState(
                                  () => selected
                                      ? selectedPlatforms.add(platform)
                                      : selectedPlatforms.remove(platform),
                                ),
                              ),
                            )
                            .toList(),
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: socialAction,
                    decoration: const InputDecoration(
                      labelText: 'What should people do?',
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'Call us',
                        child: Text('Call us'),
                      ),
                      DropdownMenuItem(
                        value: 'Request an estimate',
                        child: Text('Request an estimate'),
                      ),
                      DropdownMenuItem(
                        value: 'Visit our website',
                        child: Text('Visit our website'),
                      ),
                      DropdownMenuItem(
                        value: 'Send us a message',
                        child: Text('Send us a message'),
                      ),
                    ],
                    onChanged: (value) => setModalState(
                      () => socialAction = value ?? socialAction,
                    ),
                  ),
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.photo_outlined),
                    title: Text('Want to use a photo?'),
                    subtitle: Text(
                      'Choose or upload your photo after the posts are ready. Create Image is Coming Soon / Beta.',
                    ),
                  ),
                ],
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
          instruction: type == 'social_package'
              ? '${instruction.text.trim()}\nPeople should: $socialAction'
                    .trim()
              : instruction.text,
          mode: mode,
          platforms: selectedPlatforms.toList(),
          audience: audience.text,
          plannedBudget: num.tryParse(budget.text),
          propertyContext: widget.postcardHandoff,
        );
        if (mounted) {
          setState(() => _artifacts[type] = value);
          if (type == 'social_package') {
            await _openSocial(value, title);
          } else {
            await _view(value, onRegenerate: () => _generate(type, title));
          }
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
    audience.dispose();
  }

  Future<void> _openSocial(ManagedGrowthArtifact artifact, String title) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SocialApprovalScreen(
            artifact: artifact,
            businessName: _businessName,
            onMore: () => _view(
              artifact,
              onRegenerate: () => _generate('social_package', title),
            ),
          ),
        ),
      );

  String get _businessName =>
      _profile?.data['businessName']?.toString() ?? 'Your business';

  String? get _focus =>
      (_profile?.data['priorityServices'] as List? ?? const [])
          .map((value) => value.toString().trim())
          .where((value) => value.isNotEmpty)
          .firstOrNull;

  Future<void> _download(
    ManagedGrowthArtifact value, {
    bool csv = false,
  }) async {
    final content = csv
        ? _exports.socialCsv(value)
        : _exports.text(
            artifact: value,
            businessName: _businessName,
            focus: _focus,
          );
    final filename = _exports.filename(
      artifact: value,
      businessName: _businessName,
      focus: _focus,
      extension: csv ? 'csv' : 'txt',
    );
    await downloadArtifact(
      filename: filename,
      content: content,
      mimeType: csv ? 'text/csv' : 'text/plain',
    );
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Downloaded $filename')));
    }
  }

  Future<void> _editDeliveryEmail() async {
    final controller = TextEditingController(
      text: _deliveryEmail ?? _service.authenticatedEmail ?? '',
    );
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Generated file email'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: 'Where should ScaledCircle send generated files?',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (save == true) {
      try {
        final email = await _service.saveArtifactDeliveryEmail(controller.text);
        if (mounted) setState(() => _deliveryEmail = email);
      } on FirebaseFunctionsException catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.message ?? 'Unable to save the email.'),
            ),
          );
        }
      }
    }
    controller.dispose();
  }

  Future<void> _email(ManagedGrowthArtifact value) async {
    final controller = TextEditingController(
      text: _deliveryEmail ?? _service.authenticatedEmail ?? '',
    );
    var remember = _deliveryEmail != null;
    var sending = false;
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: !sending,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: const Text('Where should we send this?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: controller,
                enabled: !sending,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email address'),
              ),
              CheckboxListTile(
                value: remember,
                onChanged: sending
                    ? null
                    : (value) => setModalState(() => remember = value == true),
                title: const Text('Remember this email for generated files'),
                contentPadding: EdgeInsets.zero,
              ),
              const Text(
                'This sends only this generated file. It does not send a marketing campaign.',
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: sending ? null : () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: sending
                  ? null
                  : () async {
                      setModalState(() => sending = true);
                      try {
                        final result = await _service.emailArtifact(
                          artifact: value,
                          recipient: controller.text,
                          remember: remember,
                        );
                        if (remember && mounted) {
                          setState(
                            () => _deliveryEmail =
                                result['artifactDeliveryEmail']?.toString(),
                          );
                        }
                        if (dialogContext.mounted) {
                          Navigator.pop(dialogContext);
                        }
                        if (mounted) {
                          ScaffoldMessenger.of(this.context).showSnackBar(
                            SnackBar(
                              content: Text(
                                result['status'] == 'already_queued'
                                    ? 'This file is already queued for delivery.'
                                    : 'File queued for delivery.',
                              ),
                            ),
                          );
                        }
                      } on FirebaseFunctionsException catch (error) {
                        if (dialogContext.mounted) {
                          setModalState(() => sending = false);
                        }
                        if (mounted) {
                          ScaffoldMessenger.of(this.context).showSnackBar(
                            SnackBar(
                              content: Text(
                                error.message ?? 'Unable to send this file.',
                              ),
                            ),
                          );
                        }
                      }
                    },
              child: sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Send File'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
  }

  Future<void> _copy(ManagedGrowthArtifact value) async {
    await Clipboard.setData(
      ClipboardData(
        text: _exports.text(
          artifact: value,
          businessName: _businessName,
          focus: _focus,
        ),
      ),
    );
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Copied to clipboard')));
    }
  }

  Future<void> _view(
    ManagedGrowthArtifact value, {
    VoidCallback? onRegenerate,
  }) => showDialog<void>(
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
          label: const Text('Copy All'),
        ),
        TextButton.icon(
          onPressed: () => _download(value),
          icon: const Icon(Icons.download_outlined),
          label: const Text('Download'),
        ),
        if (value.artifactType == 'social_package')
          TextButton.icon(
            onPressed: () => _download(value, csv: true),
            icon: const Icon(Icons.table_view_outlined),
            label: const Text('Download CSV'),
          ),
        TextButton.icon(
          onPressed: () => _email(value),
          icon: const Icon(Icons.email_outlined),
          label: const Text('Email'),
        ),
        if (onRegenerate != null)
          TextButton.icon(
            onPressed: () {
              Navigator.pop(context);
              onRegenerate();
            },
            icon: const Icon(Icons.refresh),
            label: const Text('Regenerate'),
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
              Card(
                child: ListTile(
                  leading: const Icon(Icons.attach_email_outlined),
                  title: const Text('Generated file delivery'),
                  subtitle: Text(
                    _deliveryEmail ??
                        'Uses your account email unless you choose another address.',
                  ),
                  trailing: TextButton(
                    onPressed: _editDeliveryEmail,
                    child: const Text('Edit'),
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
                  'WHAT DO YOU WANT TO WORK ON?',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                ),
              ),
              LayoutBuilder(
                builder: (context, constraints) {
                  final width = constraints.maxWidth >= 720
                      ? (constraints.maxWidth - 24) / 3
                      : constraints.maxWidth;
                  final priority =
                      (_profile?.data['priorityServices'] as List? ?? const [])
                          .map((value) => value.toString())
                          .where((value) => value.isNotEmpty)
                          .firstOrNull;
                  final choices = <(IconData, String, String)>[
                    (
                      Icons.calendar_month_outlined,
                      'Create this week’s marketing',
                      'social_package',
                    ),
                    (
                      Icons.trending_up,
                      priority == null
                          ? 'Help me get more jobs'
                          : 'Help me get more $priority jobs',
                      'business_analysis',
                    ),
                    (
                      Icons.rate_review_outlined,
                      'Review my social posts',
                      'social_package',
                    ),
                    (
                      Icons.event_note_outlined,
                      'Build a 30-day plan',
                      'growth_plan_30_day',
                    ),
                    (
                      Icons.campaign_outlined,
                      'Promote a service',
                      'advertising_plan',
                    ),
                    (
                      Icons.travel_explore_outlined,
                      'Analyze an area',
                      'business_analysis',
                    ),
                  ];
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: choices
                        .map(
                          (choice) => SizedBox(
                            width: width,
                            child: Card(
                              child: InkWell(
                                onTap: () {
                                  final existing = _artifacts[choice.$3];
                                  if (choice.$2 == 'Review my social posts' &&
                                      existing != null) {
                                    _openSocial(existing, choice.$2);
                                  } else {
                                    _generate(choice.$3, choice.$2);
                                  }
                                },
                                borderRadius: BorderRadius.circular(12),
                                child: ConstrainedBox(
                                  constraints: const BoxConstraints(
                                    minHeight: 112,
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Icon(choice.$1),
                                        const SizedBox(height: 12),
                                        Text(
                                          choice.$2,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              const Padding(
                padding: EdgeInsets.only(top: 24, bottom: 6),
                child: Text(
                  'More Marketing Tools',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
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
                  child: Column(
                    children: [
                      ListTile(
                        leading: Icon(item.icon),
                        title: Text(friendlyTitle),
                        subtitle: Text(item.description),
                        trailing: FilledButton(
                          onPressed: () => _generate(item.type, friendlyTitle),
                          child: Text(
                            artifact == null ? 'Generate' : 'Regenerate',
                          ),
                        ),
                      ),
                      if (artifact != null)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                          child: Wrap(
                            alignment: WrapAlignment.end,
                            spacing: 6,
                            runSpacing: 6,
                            children: item.type == 'social_package'
                                ? [
                                    FilledButton.tonalIcon(
                                      onPressed: () =>
                                          _openSocial(artifact, friendlyTitle),
                                      icon: const Icon(Icons.preview_outlined),
                                      label: const Text('Preview & Approve'),
                                    ),
                                    PopupMenuButton<String>(
                                      tooltip: 'More',
                                      itemBuilder: (_) => const [
                                        PopupMenuItem(
                                          value: 'view',
                                          child: Text(
                                            'Download / Email / Copy All',
                                          ),
                                        ),
                                      ],
                                      onSelected: (_) => _view(
                                        artifact,
                                        onRegenerate: () =>
                                            _generate(item.type, friendlyTitle),
                                      ),
                                      child: const Chip(label: Text('More')),
                                    ),
                                  ]
                                : [
                                    TextButton(
                                      onPressed: () => _view(
                                        artifact,
                                        onRegenerate: () =>
                                            _generate(item.type, friendlyTitle),
                                      ),
                                      child: const Text('View'),
                                    ),
                                    TextButton.icon(
                                      onPressed: () => _download(artifact),
                                      icon: const Icon(Icons.download_outlined),
                                      label: const Text('Download'),
                                    ),
                                    TextButton.icon(
                                      onPressed: () => _email(artifact),
                                      icon: const Icon(Icons.email_outlined),
                                      label: const Text('Email'),
                                    ),
                                    TextButton.icon(
                                      onPressed: () => _copy(artifact),
                                      icon: const Icon(Icons.copy_all_outlined),
                                      label: const Text('Copy All'),
                                    ),
                                  ],
                          ),
                        ),
                    ],
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
