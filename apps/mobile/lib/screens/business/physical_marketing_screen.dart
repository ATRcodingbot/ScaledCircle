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
    if (campaigns.isEmpty || pages.isEmpty || specs.isEmpty) {
      _message(
        'Create a campaign and publish a Landing Page before making a tracked print file.',
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
    String? mediaKey;
    final service = TextEditingController(text: 'Seasonal cleanup');
    final headline = TextEditingController(text: 'Refresh your outdoor space');
    final offer = TextEditingController(
      text: 'Professional help for a cleaner property',
    );
    final cta = TextEditingController(text: 'See what we can do');
    final phone = TextEditingController();
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
                      'Choose the campaign and message. ScaledCircle handles the print layout, QR, bleed, and proof.',
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
                      labelText: 'Approved image (optional)',
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
                    controller: service,
                    decoration: const InputDecoration(labelText: 'Service'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: headline,
                    decoration: const InputDecoration(labelText: 'Headline'),
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
                  const SizedBox(height: 12),
                  TextField(
                    controller: phone,
                    decoration: const InputDecoration(
                      labelText: 'Phone (optional)',
                    ),
                  ),
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
              onPressed: () => Navigator.pop(context, true),
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
          'service': service.text,
          'headline': headline.text,
          'offer': offer.text,
          'cta': cta.text,
          'phone': phone.text,
          'landingPageId': pageId,
          'media': selectedMedia == null
              ? null
              : {'assetId': selectedMedia[0], 'revisionId': selectedMedia[1]},
          'template': 'clean',
        },
      );
      _message(
        'Draft created. Prepare the exact print proof when you are ready.',
      );
    });
  }

  Future<void> _prepare(String materialId) => _run(() async {
    await _service.prepare(materialId);
    _message('Print preflight passed. Review the exact proof before approval.');
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
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.icon(
                        onPressed: _working ? null : () => _create(workspace),
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
    final proof = proofs.isEmpty
        ? null
        : Map<String, dynamic>.from(proofs.first);
    final status = material['status']?.toString() ?? 'DRAFT';
    final materialId = material['materialId'].toString();
    final versionId = version['versionId']?.toString();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final preview = SizedBox(
              width: 190,
              child: AspectRatio(
                aspectRatio: 3.5 / 8.5,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border.all(color: Theme.of(context).dividerColor),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: proof == null
                      ? const Center(child: Text('Prepare proof'))
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(13),
                          child: AuthenticatedMediaPreview(
                            identity:
                                proof['contentHash'] ?? proof['storagePath'],
                            semanticLabel: 'Exact print proof',
                            fit: BoxFit.contain,
                            load: () => service.bytes(
                              proof['storagePath'].toString(),
                              maximumBytes: 8 * 1024 * 1024,
                            ),
                          ),
                        ),
                ),
              ),
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
                  const Text('Print preflight passed • PDF/X-4 • tracked QR'),
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
                    if (status == 'READY_FOR_REVIEW' && versionId != null)
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
                children: [
                  Center(child: preview),
                  const SizedBox(height: 18),
                  details,
                ],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                preview,
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
