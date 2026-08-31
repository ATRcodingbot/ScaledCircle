import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../navigation/business_back_button.dart';
import '../../services/business_media_service.dart';
import '../../widgets/authenticated_media_preview.dart';

class BrandAssetsScreen extends StatefulWidget {
  const BrandAssetsScreen({super.key, this.service, this.generationService});
  final BusinessMediaGateway? service;
  final GeneratedVisualGateway? generationService;
  @override
  State<BrandAssetsScreen> createState() => _BrandAssetsScreenState();
}

class _BrandAssetsScreenState extends State<BrandAssetsScreen> {
  late final BusinessMediaGateway _service =
      widget.service ?? BusinessMediaService();
  late final GeneratedVisualGateway _generationService =
      widget.generationService ?? BusinessMediaService();
  final ImagePicker _picker = ImagePicker();
  final List<Map<String, dynamic>> _assets = [];
  bool _loading = true;
  bool _uploading = false;
  String? _error;
  String? _cursor;
  bool _hasMore = false;
  Map<String, dynamic> _brand = const {};
  List<String> _availableServices = const [];
  String _serviceCategorySource = 'brand_profile_manual';
  Map<String, dynamic> _generation = const {'capability': 'disabled'};
  bool _generating = false;
  bool _savingBrand = false;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
    _loadGeneration();
  }

  Future<void> _loadGeneration() async {
    try {
      final value = await _generationService.generationWorkspace();
      if (mounted) setState(() => _generation = value);
    } catch (_) {
      if (mounted) {
        setState(() => _generation = const {'capability': 'disabled'});
      }
    }
  }

  Future<void> _createGenerated({String? priorJobId}) async {
    final usage = _generation['usage'] is Map
        ? Map<String, dynamic>.from(_generation['usage'] as Map)
        : const <String, dynamic>{};
    if (usage['limitReached'] == true ||
        (usage['remaining'] as num?)?.toInt() == 0) {
      setState(
        () => _error =
            'You’ve used your generated visuals for this period. Use an existing image, upload your own photo, or wait until the displayed reset date.',
      );
      return;
    }
    final services =
        (_generation['approvedServiceCategories'] as List? ?? const [])
            .map((value) => value.toString())
            .where((value) => value.isNotEmpty)
            .toList();
    final directions =
        (_generation['visualDirections'] as List? ??
                const ['clean', 'friendly', 'premium', 'practical', 'modern'])
            .map((value) => value.toString())
            .toList();
    if (services.isEmpty) {
      setState(
        () => _error =
            'Add an approved service category before creating a visual.',
      );
      return;
    }
    var selectedService = services.first;
    var selectedDirection = directions.first;
    final create = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text(
            priorJobId == null
                ? 'Create a service visual'
                : 'Try another concept',
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Generated concepts illustrate a service. They are not photos of completed work, people, customers, or property.',
                ),
                if (priorJobId != null) ...[
                  const SizedBox(height: 10),
                  const Text(
                    'Try another uses 1 generated visual.',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ],
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: selectedService,
                  decoration: const InputDecoration(labelText: 'Service'),
                  items: services
                      .map(
                        (value) =>
                            DropdownMenuItem(value: value, child: Text(value)),
                      )
                      .toList(),
                  onChanged: (value) => setLocal(
                    () => selectedService = value ?? selectedService,
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedDirection,
                  decoration: const InputDecoration(
                    labelText: 'Visual direction',
                  ),
                  items: directions
                      .map(
                        (value) => DropdownMenuItem(
                          value: value,
                          child: Text(
                            value[0].toUpperCase() + value.substring(1),
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setLocal(
                    () => selectedDirection = value ?? selectedDirection,
                  ),
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
              child: Text(priorJobId == null ? 'Create visual' : 'Try another'),
            ),
          ],
        ),
      ),
    );
    if (create != true) return;
    setState(() {
      _generating = true;
      _error = null;
    });
    try {
      final requestId =
          'generated_${DateTime.now().microsecondsSinceEpoch}_${priorJobId ?? 'new'}';
      final job = await _generationService.requestGeneration(
        requestId: requestId,
        serviceCategory: selectedService,
        visualDirection: selectedDirection,
      );
      await _generationService.processGeneration(job['jobId'].toString());
      await Future.wait([_loadGeneration(), _load(reset: true)]);
    } catch (error) {
      final details =
          error is FirebaseFunctionsException && error.details is Map
          ? Map<String, dynamic>.from(error.details as Map)
          : const <String, dynamic>{};
      final monthlyLimit = details['reason'] == 'MONTHLY_LIMIT_REACHED';
      setState(
        () => _error = monthlyLimit
            ? 'You’ve used your generated visuals for this period. Use an existing image, upload your own photo, or wait until the displayed reset date.'
            : 'Generated visuals are temporarily unavailable. Your existing images and pages are unaffected.',
      );
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  Future<void> _load({bool reset = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _service.workspace(cursor: reset ? null : _cursor);
      final items = (data['assets'] as List? ?? const []).map(
        (e) => Map<String, dynamic>.from(e as Map),
      );
      setState(() {
        if (reset) _assets.clear();
        for (final item in items) {
          if (!_assets.any(
            (existing) => existing['assetId'] == item['assetId'],
          )) {
            _assets.add(item);
          }
        }
        _cursor = data['nextCursor']?.toString();
        _hasMore = data['hasMore'] == true;
        _brand = data['brandProfile'] is Map
            ? Map<String, dynamic>.from(data['brandProfile'] as Map)
            : const {};
        _availableServices =
            (data['availableServiceCategories'] as List? ?? const [])
                .map((value) => value.toString())
                .where((value) => value.isNotEmpty)
                .toList(growable: false);
        _serviceCategorySource =
            data['serviceCategorySource']?.toString() ?? 'brand_profile_manual';
      });
    } catch (_) {
      setState(() => _error = 'We couldn’t load Brand Assets. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _upload({String? assetId}) async {
    final image = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 12000,
      maxHeight: 12000,
    );
    if (image == null) return;
    final lower = image.name.toLowerCase();
    if (!lower.endsWith('.jpg') &&
        !lower.endsWith('.jpeg') &&
        !lower.endsWith('.png') &&
        !lower.endsWith('.webp')) {
      setState(() => _error = 'Choose a JPEG, PNG, or WebP image.');
      return;
    }
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final purpose = assetId == null ? await _choosePurpose() : null;
      if (assetId == null && purpose == null) return;
      await _service.upload(
        bytes: await image.readAsBytes(),
        filename: image.name,
        purpose:
            purpose ??
            _assets
                .firstWhere((a) => a['assetId'] == assetId)['purpose']
                .toString(),
        assetId: assetId,
      );
      await _load(reset: true);
    } catch (_) {
      setState(
        () => _error =
            'We couldn’t prepare this image. Check the file and try again.',
      );
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<String?> _choosePurpose() => showDialog<String>(
    context: context,
    builder: (context) => SimpleDialog(
      title: const Text('What are you adding?'),
      children: [
        SimpleDialogOption(
          onPressed: () => Navigator.pop(context, 'logo'),
          child: const Text('Logo'),
        ),
        SimpleDialogOption(
          onPressed: () => Navigator.pop(context, 'service_visual'),
          child: const Text('Business photo'),
        ),
      ],
    ),
  );

  Future<void> _review(Map<String, dynamic> asset) async {
    final revision = Map<String, dynamic>.from(asset['revision'] as Map);
    final alt = TextEditingController(
      text: revision['altText']?.toString() ?? '',
    );
    final service = TextEditingController(
      text: revision['serviceLabel']?.toString() ?? '',
    );
    var rights = revision['rightsAttestation'] == true;
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Review image'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: alt,
                  onChanged: (_) => setLocal(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Factual alt text',
                  ),
                ),
                TextField(
                  controller: service,
                  decoration: const InputDecoration(
                    labelText: 'Service label (optional)',
                  ),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: rights,
                  onChanged: (v) => setLocal(() => rights = v == true),
                  title: const Text(
                    'I own this image or have permission to use it.',
                  ),
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
              onPressed: rights && alt.text.trim().isNotEmpty
                  ? () => Navigator.pop(context, true)
                  : null,
              child: const Text('Approve image'),
            ),
          ],
        ),
      ),
    );
    if (approved != true) return;
    try {
      await _service.saveReviewMetadata(
        assetId: asset['assetId'].toString(),
        revisionId: revision['revisionId'].toString(),
        altText: alt.text,
        serviceLabel: service.text,
        rightsAttestation: rights,
      );
      await _service.approve(
        asset['assetId'].toString(),
        revision['revisionId'].toString(),
      );
      if (asset['purpose'] == 'logo') {
        await _service.selectLogo(
          asset['assetId'].toString(),
          revision['revisionId'].toString(),
        );
      }
      await _load(reset: true);
    } catch (_) {
      setState(
        () => _error =
            'We couldn’t approve this image. Review the details and try again.',
      );
    }
  }

  Future<void> _brandSettings() async {
    final primary = TextEditingController(
      text: _brand['primaryColor']?.toString() ?? '#176FD1',
    );
    final secondary = TextEditingController(
      text: _brand['secondaryColor']?.toString() ?? '#10243E',
    );
    final manualService = TextEditingController();
    var preset = _brand['stylePreset']?.toString() ?? 'clean';
    final manualMode = _serviceCategorySource == 'brand_profile_manual';
    final available = _availableServices.toSet();
    final approved = (_brand['approvedServiceCategories'] as List? ?? const [])
        .map((value) => value.toString())
        .where((value) => manualMode || available.contains(value))
        .toSet();
    if (manualMode) available.addAll(approved);
    String? serviceError;
    final action = await showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Brand settings'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: primary,
                    decoration: const InputDecoration(
                      labelText: 'Primary color (#RRGGBB)',
                    ),
                  ),
                  TextField(
                    controller: secondary,
                    decoration: const InputDecoration(
                      labelText: 'Secondary color (#RRGGBB)',
                    ),
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: preset,
                    decoration: const InputDecoration(
                      labelText: 'Style preset',
                    ),
                    items: const ['clean', 'bold', 'friendly', 'premium']
                        .map(
                          (value) => DropdownMenuItem(
                            value: value,
                            child: Text(
                              value[0].toUpperCase() + value.substring(1),
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setLocal(() => preset = value ?? 'clean'),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'ScaledCircle keeps text contrast readable when these colors are used in future customer-facing designs.',
                  ),
                  const Divider(height: 32),
                  Text(
                    'Services for visuals',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Choose the services ScaledCircle can use when creating marketing visuals.',
                  ),
                  const SizedBox(height: 12),
                  if (manualMode) ...[
                    const Text(
                      'Add only services your Business genuinely offers. These choices are used for visual concepts.',
                    ),
                    const SizedBox(height: 8),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: TextField(
                            key: const Key('brand-service-entry'),
                            controller: manualService,
                            maxLength: 80,
                            decoration: const InputDecoration(
                              labelText: 'Service',
                              hintText: 'Seasonal cleanup',
                            ),
                            onSubmitted: (_) {},
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: () => setLocal(() {
                            serviceError = null;
                            final value = manualService.text.trim().replaceAll(
                              RegExp(r'\s+'),
                              ' ',
                            );
                            if (value.isEmpty || value.length > 80) {
                              serviceError = 'Enter a service name.';
                              return;
                            }
                            if (approved.length >= 12) {
                              serviceError = 'Choose no more than 12 services.';
                              return;
                            }
                            final duplicate = available.any(
                              (item) =>
                                  item.toLowerCase() == value.toLowerCase(),
                            );
                            if (!duplicate) {
                              available.add(value);
                              approved.add(value);
                            }
                            manualService.clear();
                          }),
                          child: const Text('Add service'),
                        ),
                      ],
                    ),
                    if (available.isNotEmpty) const SizedBox(height: 8),
                  ],
                  if (available.isNotEmpty)
                    Semantics(
                      container: true,
                      label:
                          'Services for visuals. ${approved.length} selected.',
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: available
                            .map(
                              (service) => FilterChip(
                                label: Text(service),
                                selected: approved.contains(service),
                                onSelected: (selected) => setLocal(() {
                                  serviceError = null;
                                  if (selected && approved.length >= 12) {
                                    serviceError =
                                        'Choose no more than 12 services.';
                                    return;
                                  }
                                  selected
                                      ? approved.add(service)
                                      : approved.remove(service);
                                }),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  if (serviceError != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      serviceError!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text('${approved.length} of 12 selected'),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: serviceError == null
                  ? () => Navigator.pop(context, 'save')
                  : null,
              child: const Text('Save settings'),
            ),
          ],
        ),
      ),
    );
    // showDialog completes when pop starts; allow its exit animation to detach
    // the TextField before disposing the controller it still references.
    await Future<void>.delayed(const Duration(milliseconds: 250));
    manualService.dispose();
    if (action != 'save') return;
    setState(() {
      _savingBrand = true;
      _error = null;
    });
    try {
      await _service.updateBrand(
        primaryColor: primary.text,
        secondaryColor: secondary.text,
        stylePreset: preset,
        approvedServiceCategories: approved.toList(growable: false),
      );
      await Future.wait([_load(reset: true), _loadGeneration()]);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Brand settings saved.')));
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'We couldn’t save Brand Settings. Check your colors and service choices, then try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _savingBrand = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 600;
    return Scaffold(
      appBar: AppBar(
        leading: const BusinessBackButton(),
        title: const Text('Brand Assets'),
        actions: compact
            ? [
                IconButton(
                  onPressed: _savingBrand ? null : _brandSettings,
                  tooltip: 'Brand settings',
                  icon: const Icon(Icons.palette_outlined),
                ),
                IconButton(
                  onPressed: _uploading ? null : () => _upload(),
                  tooltip: 'Upload image',
                  icon: const Icon(Icons.upload),
                ),
              ]
            : [
                TextButton.icon(
                  onPressed: _savingBrand ? null : _brandSettings,
                  icon: const Icon(Icons.palette_outlined),
                  label: const Text('Brand settings'),
                ),
                TextButton.icon(
                  onPressed: _uploading ? null : () => _upload(),
                  icon: const Icon(Icons.upload),
                  label: const Text('Upload image'),
                ),
              ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Your logo and photos',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            const Text(
              'Keep reusable Business images here. You can still use ScaledCircle without uploading photos.',
            ),
            const SizedBox(height: 18),
            if (_generation['businessAuthorized'] == true &&
                _generation['capability'] == 'test_only')
              _GeneratedVisualPanel(
                generation: _generation,
                busy: _generating,
                onCreate: () => _createGenerated(),
                onChooseServices: _brandSettings,
                onUpload: () => _upload(),
                onApprove: (jobId) async {
                  await _generationService.approveGeneration(jobId);
                  await Future.wait([_loadGeneration(), _load(reset: true)]);
                },
                onReject: (jobId) async {
                  await _generationService.rejectGeneration(jobId);
                  await _loadGeneration();
                },
                onTryAnother: (jobId) => _createGenerated(priorJobId: jobId),
              )
            else if (_generation['businessAuthorized'] == true &&
                _generation['capability'] == 'enabled')
              _GeneratedVisualPanel(
                generation: _generation,
                busy: _generating,
                onCreate: () => _createGenerated(),
                onChooseServices: _brandSettings,
                onUpload: () => _upload(),
                onApprove: (jobId) async {
                  await _generationService.approveGeneration(jobId);
                  await Future.wait([_loadGeneration(), _load(reset: true)]);
                },
                onReject: (jobId) async {
                  await _generationService.rejectGeneration(jobId);
                  await _loadGeneration();
                },
                onTryAnother: (jobId) => _createGenerated(priorJobId: jobId),
              ),
            if (_generation['businessAuthorized'] == true &&
                _generation['capability'] == 'disabled')
              _GeneratedVisualUnavailableCard(
                message:
                    'Generated visuals are temporarily unavailable. Your existing images are unchanged.',
                generation: _generation,
              )
            else if (_generation['businessAuthorized'] != true &&
                _generation['capability'] != 'disabled')
              const _GeneratedVisualUnavailableCard(
                message:
                    'Generated visuals aren’t available for this account yet.',
              ),
            if (_uploading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: LinearProgressIndicator(
                  semanticsLabel: 'Uploading and processing image',
                ),
              ),
            if (_savingBrand)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: LinearProgressIndicator(
                  semanticsLabel: 'Saving Brand settings',
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (_loading && _assets.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (!_loading && _assets.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    children: [
                      const Icon(Icons.photo_library_outlined, size: 48),
                      const SizedBox(height: 12),
                      const Text(
                        'Add your logo or photos',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Media is optional. Upload an image when you’re ready.',
                      ),
                      const SizedBox(height: 18),
                      FilledButton.icon(
                        onPressed: () => _upload(),
                        icon: const Icon(Icons.upload),
                        label: const Text('Upload image'),
                      ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.maxWidth >= 900
                    ? 3
                    : constraints.maxWidth >= 600
                    ? 2
                    : 1;
                return GridView.count(
                  crossAxisCount: columns,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  childAspectRatio: columns == 1 ? 1.25 : .82,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  children: _assets
                      .where((a) => a['removed'] != true)
                      .map(
                        (asset) => _MediaCard(
                          asset: asset,
                          service: _service,
                          onReview: () => _review(asset),
                          onReject: () async {
                            final revision = Map<String, dynamic>.from(
                              asset['revision'] as Map,
                            );
                            await _service.reject(
                              asset['assetId'].toString(),
                              revision['revisionId'].toString(),
                            );
                            await _load(reset: true);
                          },
                          onReplace: () =>
                              _upload(assetId: asset['assetId'].toString()),
                          onRemove: () async {
                            await _service.remove(asset['assetId'].toString());
                            await _load(reset: true);
                          },
                        ),
                      )
                      .toList(),
                );
              },
            ),
            if (_hasMore)
              Center(
                child: OutlinedButton(
                  onPressed: _loading ? null : _load,
                  child: const Text('Load more'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GeneratedVisualUnavailableCard extends StatelessWidget {
  const _GeneratedVisualUnavailableCard({
    required this.message,
    this.generation = const <String, dynamic>{},
  });
  final String message;
  final Map<String, dynamic> generation;

  String _resetDate(Object? value) {
    final millis = (value as num?)?.toInt();
    if (millis == null) return 'the next UTC month';
    final date = DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${months[date.month - 1]} ${date.day}';
  }

  @override
  Widget build(BuildContext context) {
    final usage = generation['usage'] is Map
        ? Map<String, dynamic>.from(generation['usage'] as Map)
        : const <String, dynamic>{};
    final used = (usage['used'] as num?)?.toInt() ?? 0;
    final total = (usage['total'] as num?)?.toInt() ?? 0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.auto_awesome_outlined),
                SizedBox(width: 12),
                Expanded(child: Text('Generated service visuals')),
                Chip(label: Text('Beta')),
              ],
            ),
            if (total > 0) ...[
              const SizedBox(height: 8),
              Semantics(
                label:
                    '$used of $total generated visuals used this month. Resets ${_resetDate(usage['resetAt'])}.',
                child: Text(
                  '$used of $total used this month\nResets ${_resetDate(usage['resetAt'])}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              '$message You can still use existing Brand Assets, upload your own photo, or publish without a photo.',
            ),
            const SizedBox(height: 8),
            const Text('Try another uses 1 generated visual when generation is available.'),
          ],
        ),
      ),
    );
  }
}

class _GeneratedVisualPanel extends StatelessWidget {
  const _GeneratedVisualPanel({
    required this.generation,
    required this.busy,
    required this.onCreate,
    required this.onChooseServices,
    required this.onUpload,
    required this.onApprove,
    required this.onReject,
    required this.onTryAnother,
  });
  final Map<String, dynamic> generation;
  final bool busy;
  final VoidCallback onCreate;
  final VoidCallback onChooseServices;
  final VoidCallback onUpload;
  final Future<void> Function(String jobId) onApprove;
  final Future<void> Function(String jobId) onReject;
  final Future<void> Function(String jobId) onTryAnother;

  String _status(String value) => switch (value) {
    'queued' => 'Queued',
    'processing' => 'Creating visual',
    'review_required' => 'Ready for review · Approval required',
    'approved' => 'Approved',
    'rejected' => 'Rejected',
    'blocked' => 'Blocked by visual safety checks',
    'failed' => 'Temporarily unavailable',
    _ => 'Ready to generate',
  };

  String _resetDate(Object? value) {
    final millis = (value as num?)?.toInt();
    if (millis == null) return 'the next UTC month';
    final date = DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${months[date.month - 1]} ${date.day}';
  }

  @override
  Widget build(BuildContext context) {
    final approvedServices =
        (generation['approvedServiceCategories'] as List? ?? const [])
            .map((value) => value.toString())
            .where((value) => value.isNotEmpty)
            .toList(growable: false);
    final jobs = (generation['jobs'] as List? ?? const [])
        .whereType<Map>()
        .map((job) => Map<String, dynamic>.from(job))
        .toList();
    final usage = generation['usage'] is Map
        ? Map<String, dynamic>.from(generation['usage'] as Map)
        : const <String, dynamic>{};
    final used = (usage['used'] as num?)?.toInt() ?? 0;
    final total = (usage['total'] as num?)?.toInt() ?? 0;
    final pending = (usage['pending'] as num?)?.toInt() ?? 0;
    final limitReached =
        usage['limitReached'] == true || (total > 0 && used + pending >= total);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Create visuals for me',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            const Align(
              alignment: Alignment.centerLeft,
              child: Chip(label: Text('Beta')),
            ),
            const Text(
              'Create a generic service concept, review the exact image, and approve it before use. Test and local activity stays separate from customer media.',
            ),
            const SizedBox(height: 12),
            if (total > 0) ...[
              Semantics(
                label:
                    '$used of $total generated visuals used this month. Resets ${_resetDate(usage['resetAt'])}.',
                child: Text(
                  'Generated visuals\n$used of $total used this month${pending > 0 ? ' · $pending pending' : ''}\nResets ${_resetDate(usage['resetAt'])}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (limitReached) ...[
              const Text(
                'You’ve used your generated visuals for this period. Existing approved visuals remain available.',
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: busy ? null : onUpload,
                    icon: const Icon(Icons.upload_outlined),
                    label: const Text('Upload your own photo'),
                  ),
                  const Chip(label: Text('Existing visuals remain usable')),
                  const Chip(
                    label: Text('Publishing without a photo is available'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            if (approvedServices.isEmpty) ...[
              const Text(
                'Choose at least one service before creating a visual.',
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: busy ? null : onChooseServices,
                icon: const Icon(Icons.checklist_outlined),
                label: const Text('Choose services'),
              ),
            ] else if (!limitReached)
              FilledButton.icon(
                onPressed: busy ? null : onCreate,
                icon: const Icon(Icons.auto_awesome_outlined),
                label: Text(busy ? 'Creating visual' : 'Create service visual'),
              ),
            if (busy)
              const Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  LinearProgressIndicator(
                    semanticsLabel: 'Creating service concept visual',
                  ),
                  SizedBox(height: 6),
                  Text(
                    'This usually takes about a minute. You can leave this page and return later.',
                  ),
                ],
              ),
            for (final job in jobs) ...[
              const Divider(height: 28),
              Text(
                job['serviceCategory']?.toString() ?? 'Service concept',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                'Generated concept · ${_status(job['status']?.toString() ?? '')}',
                semanticsLabel:
                    'Generated concept status: ${_status(job['status']?.toString() ?? '')}',
              ),
              Text('Direction: ${job['visualDirection'] ?? 'selected style'}'),
              const SizedBox(height: 6),
              Text(
                generation['disclosure']?.toString() ??
                    "Service concept image — not a photo of this Business's completed work, team, customers, or property.",
              ),
              if (job['status'] == 'review_required')
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton(
                      onPressed: () => onApprove(job['jobId'].toString()),
                      child: const Text('Approve concept'),
                    ),
                    OutlinedButton(
                      onPressed: () => onTryAnother(job['jobId'].toString()),
                      child: const Text(
                        'Try another · Uses 1 generated visual',
                      ),
                    ),
                    TextButton(
                      onPressed: () => onReject(job['jobId'].toString()),
                      child: const Text('Remove'),
                    ),
                  ],
                ),
              if (job['status'] == 'approved')
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton(
                    onPressed: () => onTryAnother(job['jobId'].toString()),
                    child: const Text('Try another · Uses 1 generated visual'),
                  ),
                ),
              if (job['status'] == 'blocked')
                const Text(
                  'This concept couldn’t be used. It did not count against your monthly generated-visual allowance.',
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MediaCard extends StatelessWidget {
  const _MediaCard({
    required this.asset,
    required this.service,
    required this.onReview,
    required this.onReject,
    required this.onReplace,
    required this.onRemove,
  });
  final Map<String, dynamic> asset;
  final BusinessMediaGateway service;
  final VoidCallback onReview;
  final VoidCallback onReject;
  final VoidCallback onReplace;
  final VoidCallback onRemove;
  @override
  Widget build(BuildContext context) {
    final revision = asset['revision'] is Map
        ? Map<String, dynamic>.from(asset['revision'] as Map)
        : <String, dynamic>{};
    final status = revision['status']?.toString() ?? 'uploading';
    final approval = revision['approvalStatus']?.toString() ?? 'pending';
    final generated = revision['origin'] == 'generated_service_concept';
    final label = status == 'ready'
        ? (approval == 'approved' ? 'Approved' : 'Ready for review')
        : status == 'processing' || status == 'upload_pending'
        ? 'Processing'
        : 'File unsuitable';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: ColoredBox(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  child: AuthenticatedMediaPreview(
                    identity: '${asset['assetId']}:${revision['revisionId']}',
                    load: () => service.previewBytes(asset),
                    semanticLabel:
                        revision['altText']?.toString().isNotEmpty == true
                        ? revision['altText'].toString()
                        : 'Business image preview',
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              asset['title']?.toString() ?? 'Business image',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            Text(label, semanticsLabel: 'Status: $label'),
            Text(generated ? 'Generated concept' : 'Your photo'),
            if (generated && revision['truthfulnessDisclosure'] != null)
              Text(revision['truthfulnessDisclosure'].toString()),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                if (!generated && status == 'ready' && approval != 'approved')
                  FilledButton(
                    onPressed: onReview,
                    child: const Text('Review'),
                  ),
                if (!generated && status == 'ready' && approval == 'pending')
                  TextButton(onPressed: onReject, child: const Text('Reject')),
                if (!generated)
                  OutlinedButton(
                    onPressed: onReplace,
                    child: const Text('Replace'),
                  ),
                TextButton(onPressed: onRemove, child: const Text('Remove')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
