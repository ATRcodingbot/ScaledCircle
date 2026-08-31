import 'package:flutter/material.dart';

import '../../navigation/business_back_button.dart';
import '../../services/binary_artifact_download.dart';
import '../../services/physical_marketing_service.dart';
import '../../widgets/authenticated_media_preview.dart';

class PhysicalMarketingScreen extends StatefulWidget {
  const PhysicalMarketingScreen({super.key, this.service});

  final PhysicalMarketingGateway? service;

  @override
  State<PhysicalMarketingScreen> createState() =>
      _PhysicalMarketingScreenState();
}

class _PhysicalMarketingScreenState extends State<PhysicalMarketingScreen> {
  late final PhysicalMarketingGateway _service =
      widget.service ?? PhysicalMarketingService();
  late Future<Map<String, dynamic>> _workspace = _service.workspace();
  bool _working = false;

  void _reload() => setState(() => _workspace = _service.workspace());

  List<Map<String, dynamic>> _maps(dynamic value) =>
      (value as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

  Future<void> _create(Map<String, dynamic> workspace) async {
    final campaigns = _maps(workspace['campaigns']);
    final pages = _maps(workspace['landingPages']);
    final specs = _maps(workspace['productSpecs']);
    final media = _maps(workspace['approvedMedia']);
    final templates = _maps(workspace['templateSpecs']);
    final services = (workspace['availableServices'] as List? ?? const [])
        .map((item) => item.toString())
        .where((item) => item.trim().isNotEmpty)
        .toList();
    final suggestions = workspace['copySuggestions'] is Map
        ? Map<String, dynamic>.from(workspace['copySuggestions'] as Map)
        : <String, dynamic>{};
    final identity = workspace['businessIdentity'] is Map
        ? Map<String, dynamic>.from(workspace['businessIdentity'] as Map)
        : <String, dynamic>{};
    final businessName = identity['businessName']?.toString().trim() ?? '';
    if (businessName.isEmpty) {
      _message(
        'Add your Business name in Grow → Growth Plan → Set Up Your Growth Profile before creating a material.',
      );
      return;
    }
    if (campaigns.isEmpty ||
        pages.isEmpty ||
        specs.isEmpty ||
        templates.isEmpty ||
        services.isEmpty) {
      _message(
        'Complete your Business profile, choose services, create a campaign, and publish a Landing Page first.',
      );
      return;
    }
    var campaignId = campaigns.first['campaignId'].toString();
    var pageId = pages.first['landingPageId'].toString();
    var specId = specs
        .firstWhere(
          (item) => item['productType'] == 'door_hanger',
          orElse: () => specs.first,
        )['specId']
        .toString();
    var service = services.first;
    var templateId = templates
        .firstWhere(
          (item) => item['available'] == true,
          orElse: () => templates.first,
        )['templateId']
        .toString();
    String? mediaKey = media.isEmpty
        ? null
        : '${media.first['assetId']}|${media.first['revisionId']}';
    var includeBusinessPhone = false;
    Map<String, dynamic> copyFor(String value) => suggestions[value] is Map
        ? Map<String, dynamic>.from(suggestions[value] as Map)
        : <String, dynamic>{};
    var suggested = copyFor(service);
    final headline = TextEditingController(
      text: suggested['headline']?.toString() ?? '',
    );
    final offer = TextEditingController(
      text:
          workspace['authorizedOffer']?.toString() ??
          suggested['supportingText']?.toString() ??
          '',
    );
    final cta = TextEditingController(
      text: suggested['cta']?.toString() ?? 'Scan to learn more',
    );
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Create marketing material'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Choose a service, professional layout, approved image, and destination. ScaledCircle handles the print details.',
                    ),
                  ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      businessName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: specId,
                    decoration: const InputDecoration(labelText: 'Material'),
                    items: specs
                        .map(
                          (item) => DropdownMenuItem(
                            value: item['specId'].toString(),
                            child: Text(item['label'].toString()),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setLocal(() => specId = value ?? specId),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: service,
                    decoration: const InputDecoration(labelText: 'Service'),
                    items: services
                        .map(
                          (item) =>
                              DropdownMenuItem(value: item, child: Text(item)),
                        )
                        .toList(),
                    onChanged: (value) => setLocal(() {
                      service = value ?? service;
                      suggested = copyFor(service);
                      headline.text = suggested['headline']?.toString() ?? '';
                      cta.text =
                          suggested['cta']?.toString() ?? 'Scan to learn more';
                      if (templateId != 'door_hanger_offer_action_v1') {
                        offer.text =
                            suggested['supportingText']?.toString() ?? '';
                      }
                    }),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: templateId,
                    decoration: const InputDecoration(labelText: 'Template'),
                    items: templates
                        .where((item) => item['available'] == true)
                        .map(
                          (item) => DropdownMenuItem(
                            value: item['templateId'].toString(),
                            child: Text(item['label'].toString()),
                          ),
                        )
                        .toList(),
                    onChanged: (value) => setLocal(() {
                      templateId = value ?? templateId;
                      if (templateId == 'door_hanger_offer_action_v1') {
                        offer.text =
                            workspace['authorizedOffer']?.toString() ?? '';
                      } else if (offer.text.isEmpty) {
                        offer.text =
                            suggested['supportingText']?.toString() ?? '';
                      }
                    }),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: campaignId,
                    decoration: const InputDecoration(labelText: 'Campaign'),
                    items: campaigns
                        .map(
                          (item) => DropdownMenuItem(
                            value: item['campaignId'].toString(),
                            child: Text(item['name'].toString()),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setLocal(() => campaignId = value ?? campaignId),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: pageId,
                    decoration: const InputDecoration(
                      labelText: 'QR destination',
                    ),
                    items: pages
                        .map(
                          (item) => DropdownMenuItem(
                            value: item['landingPageId'].toString(),
                            child: Text(item['title'].toString()),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setLocal(() => pageId = value ?? pageId),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    initialValue: mediaKey,
                    decoration: const InputDecoration(
                      labelText: 'Approved image',
                    ),
                    items: <DropdownMenuItem<String?>>[
                      const DropdownMenuItem(
                        value: null,
                        child: Text('No image'),
                      ),
                      ...media.map(
                        (item) => DropdownMenuItem(
                          value: '${item['assetId']}|${item['revisionId']}',
                          child: Text(item['title'].toString()),
                        ),
                      ),
                    ],
                    onChanged: (value) => setLocal(() => mediaKey = value),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: headline,
                    decoration: const InputDecoration(
                      labelText: 'Headline',
                      helperText:
                          'Suggested from your selected service. You can edit it.',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: offer,
                    decoration: const InputDecoration(
                      labelText: 'Offer or supporting message',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: cta,
                    decoration: const InputDecoration(
                      labelText: 'Call to action',
                    ),
                  ),
                  if (identity['verifiedPhoneAvailable'] == true) ...[
                    const SizedBox(height: 8),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      value: includeBusinessPhone,
                      title: const Text('Include verified Business phone'),
                      subtitle: const Text(
                        'Uses the phone saved in your Business profile.',
                      ),
                      onChanged: (value) =>
                          setLocal(() => includeBusinessPhone = value),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed:
                  headline.text.trim().isEmpty ||
                      cta.text.trim().isEmpty ||
                      ((templateId == 'door_hanger_service_hero_v1' ||
                              templateId == 'door_hanger_offer_action_v1') &&
                          mediaKey == null) ||
                      (templateId == 'door_hanger_offer_action_v1' &&
                          offer.text.trim().isEmpty)
                  ? null
                  : () => Navigator.pop(context, true),
              child: const Text('Create draft'),
            ),
          ],
        ),
      ),
    );
    if (accepted != true) return;
    final selectedMedia = mediaKey?.split('|');
    await _run(() async {
      await _service.create(
        requestId: 'material_${DateTime.now().microsecondsSinceEpoch}',
        draft: {
          'productSpecId': specId,
          'sideCount': 2,
          'campaignId': campaignId,
          'service': service,
          'headline': headline.text,
          'offer': offer.text,
          'cta': cta.text,
          'includeBusinessPhone': includeBusinessPhone,
          'landingPageId': pageId,
          'media': selectedMedia == null
              ? null
              : {'assetId': selectedMedia[0], 'revisionId': selectedMedia[1]},
          'templateId': templateId,
        },
      );
      _message(
        'Draft created. Prepare the exact print proof when you are ready.',
      );
    });
  }

  Future<void> _prepare(String materialId) => _run(() async {
    await _service.prepare(materialId);
    _message(
      'Print quality and marketing content passed. Review the exact proof before approval.',
    );
  });

  Future<void> _approve(String materialId, String versionId) => _run(() async {
    await _service.approve(materialId, versionId);
    _message('Exact version approved and ready to download.');
  });

  Future<void> _download(String path, String filename, String mimeType) => _run(
    () async {
      final bytes = await _service.bytes(path, maximumBytes: 30 * 1024 * 1024);
      if (bytes == null) throw StateError('artifact_unavailable');
      await downloadBinaryArtifact(
        filename: filename,
        bytes: bytes,
        mimeType: mimeType,
      );
      _message('Download started. Check your downloads.');
    },
  );

  Future<void> _run(Future<void> Function() action) async {
    if (_working) return;
    setState(() => _working = true);
    try {
      await action();
      if (mounted) _reload();
    } catch (_) {
      if (mounted) {
        _message('That action could not be completed safely. Try again.');
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  void _message(String value) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const BusinessBackButton(),
      title: const Text('Physical Marketing — Beta'),
      actions: [
        IconButton(
          onPressed: _working ? null : _reload,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<Map<String, dynamic>>(
      future: _workspace,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError || !snapshot.hasData) {
          return Center(
            child: FilledButton(
              onPressed: _reload,
              child: const Text('Try again'),
            ),
          );
        }
        final workspace = snapshot.data!;
        final materials = _maps(workspace['materials']);
        final identity = workspace['businessIdentity'] is Map
            ? Map<String, dynamic>.from(workspace['businessIdentity'] as Map)
            : <String, dynamic>{};
        final missingBusinessName =
            identity['businessName']?.toString().trim().isEmpty ?? true;
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1120),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Create it once. Take it anywhere.',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Build a tracked, printer-ready material without learning bleed, DPI, or QR setup.',
                    ),
                    const SizedBox(height: 20),
                    const _FulfillmentChoices(),
                    const SizedBox(height: 20),
                    if (missingBusinessName) ...[
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(18),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.info_outline),
                              SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Add your Business name in Grow → Growth Plan → Set Up Your Growth Profile. ScaledCircle will never invent it for customer material.',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.icon(
                        onPressed: _working || missingBusinessName
                            ? null
                            : () => _create(workspace),
                        icon: const Icon(Icons.add),
                        label: const Text('Create material'),
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (materials.isEmpty)
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('No physical marketing materials yet.'),
                        ),
                      )
                    else
                      ...materials.map(
                        (material) => Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: _MaterialCard(
                            material: material,
                            service: _service,
                            busy: _working,
                            onPrepare: _prepare,
                            onApprove: _approve,
                            onDownload: _download,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _FulfillmentChoices extends StatelessWidget {
  const _FulfillmentChoices();

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final cards = const [
        _Choice(
          icon: Icons.download_outlined,
          title: 'Download File',
          subtitle: 'Print-ready PDF included',
          available: true,
        ),
        _Choice(
          icon: Icons.local_shipping_outlined,
          title: 'Ship to Me',
          subtitle: 'Professional printing — Coming Soon',
        ),
        _Choice(
          icon: Icons.store_outlined,
          title: 'Pick Up Nearby',
          subtitle: 'Integrated local pickup — Coming Soon',
        ),
      ];
      if (constraints.maxWidth < 760) {
        return Column(
          children: cards
              .map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: item,
                ),
              )
              .toList(),
        );
      }
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: cards
            .map(
              (item) => Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 10),
                  child: item,
                ),
              ),
            )
            .toList(),
      );
    },
  );
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.available = false,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool available;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          Icon(
            icon,
            color: available ? Theme.of(context).colorScheme.primary : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 3),
                Text(subtitle),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _MaterialCard extends StatelessWidget {
  const _MaterialCard({
    required this.material,
    required this.service,
    required this.busy,
    required this.onPrepare,
    required this.onApprove,
    required this.onDownload,
  });
  final Map<String, dynamic> material;
  final PhysicalMarketingGateway service;
  final bool busy;
  final Future<void> Function(String) onPrepare;
  final Future<void> Function(String, String) onApprove;
  final Future<void> Function(String, String, String) onDownload;

  Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  @override
  Widget build(BuildContext context) {
    final draft = _map(material['draft']);
    final version = _map(material['version']);
    final artifact = _map(version['artifact']);
    final proofs = (artifact['proofs'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    final printReadiness = _map(
      artifact['printReadiness'] ?? artifact['preflight'],
    );
    final marketingReadiness = _map(artifact['marketingReadiness']);
    final printReady = printReadiness['status'] == 'pass';
    final marketingReady = marketingReadiness['status'] == 'pass';
    final storedStatus = material['status']?.toString() ?? 'DRAFT';
    final status =
        storedStatus == 'ORDER_READY' && (!printReady || !marketingReady)
        ? 'READY_FOR_REVIEW'
        : storedStatus;
    final materialId = material['materialId'].toString();
    final versionId = version['versionId']?.toString();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final preview = proofs.isEmpty
                ? const SizedBox(
                    width: 190,
                    height: 300,
                    child: Card(child: Center(child: Text('Prepare proof'))),
                  )
                : Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    alignment: WrapAlignment.center,
                    children: proofs.map((item) {
                      final proof = Map<String, dynamic>.from(item);
                      final side = proof['side'] ?? '';
                      return SizedBox(
                        width: 158,
                        child: Column(
                          children: [
                            AspectRatio(
                              aspectRatio: 3.5 / 8.5,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: Theme.of(context).dividerColor,
                                  ),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(13),
                                  child: AuthenticatedMediaPreview(
                                    identity:
                                        proof['contentHash'] ??
                                        proof['storagePath'],
                                    semanticLabel:
                                        'Exact print proof side $side',
                                    fit: BoxFit.contain,
                                    load: () => service.bytes(
                                      proof['storagePath'].toString(),
                                      maximumBytes: 8 * 1024 * 1024,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(side == 1 ? 'Front' : 'Back'),
                          ],
                        ),
                      );
                    }).toList(),
                  );
            final details = Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  draft['headline']?.toString() ?? 'Marketing material',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 6),
                Text(
                  '${draft['service'] ?? ''} • ${draft['productSpecId'] ?? ''}',
                ),
                const SizedBox(height: 8),
                Semantics(
                  label: 'Status $status',
                  child: Chip(label: Text(status.replaceAll('_', ' '))),
                ),
                if (artifact.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(
                        avatar: Icon(
                          printReady ? Icons.check_circle : Icons.info_outline,
                          size: 18,
                        ),
                        label: Text(
                          'Print quality ${printReady ? 'Ready' : 'Needs attention'}',
                        ),
                      ),
                      Chip(
                        avatar: Icon(
                          marketingReady
                              ? Icons.check_circle
                              : Icons.info_outline,
                          size: 18,
                        ),
                        label: Text(
                          'Marketing content ${marketingReady ? 'Ready' : 'Needs attention'}',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text('PDF/X-4 • tracked QR • immutable exact version'),
                ],
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    if (status == 'DRAFT')
                      FilledButton.tonal(
                        onPressed: busy ? null : () => onPrepare(materialId),
                        child: const Text('Prepare proof'),
                      ),
                    if (status == 'READY_FOR_REVIEW' &&
                        versionId != null &&
                        printReady &&
                        marketingReady)
                      FilledButton(
                        onPressed: busy
                            ? null
                            : () => onApprove(materialId, versionId),
                        child: const Text('Approve exact version'),
                      ),
                    if (status == 'ORDER_READY' &&
                        artifact['storagePath'] != null)
                      FilledButton.icon(
                        onPressed: busy
                            ? null
                            : () => onDownload(
                                artifact['storagePath'].toString(),
                                '$materialId-print-ready.pdf',
                                'application/pdf',
                              ),
                        icon: const Icon(Icons.download_outlined),
                        label: const Text('Print-ready PDF'),
                      ),
                    if (status == 'ORDER_READY' &&
                        artifact['digitalJpgPath'] != null)
                      OutlinedButton.icon(
                        onPressed: busy
                            ? null
                            : () => onDownload(
                                artifact['digitalJpgPath'].toString(),
                                '$materialId-digital.jpg',
                                'image/jpeg',
                              ),
                        icon: const Icon(Icons.image_outlined),
                        label: const Text('Digital JPG'),
                      ),
                    OutlinedButton.icon(
                      onPressed: null,
                      icon: const Icon(Icons.print_outlined),
                      label: const Text('Print — Coming Soon'),
                    ),
                    OutlinedButton.icon(
                      onPressed: null,
                      icon: const Icon(Icons.mail_outline),
                      label: const Text('Print + Mail — Coming Soon'),
                    ),
                  ],
                ),
              ],
            );
            if (constraints.maxWidth < 680) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [preview, const SizedBox(height: 18), details],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 328, child: preview),
                const SizedBox(width: 24),
                Expanded(child: details),
              ],
            );
          },
        ),
      ),
    );
  }
}
