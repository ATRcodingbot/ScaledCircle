import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../navigation/business_back_button.dart';
import '../../services/business_media_service.dart';

class BrandAssetsScreen extends StatefulWidget {
  const BrandAssetsScreen({super.key, this.service});
  final BusinessMediaGateway? service;
  @override
  State<BrandAssetsScreen> createState() => _BrandAssetsScreenState();
}

class _BrandAssetsScreenState extends State<BrandAssetsScreen> {
  late final BusinessMediaGateway _service =
      widget.service ?? BusinessMediaService();
  final ImagePicker _picker = ImagePicker();
  final List<Map<String, dynamic>> _assets = [];
  bool _loading = true;
  bool _uploading = false;
  String? _error;
  String? _cursor;
  bool _hasMore = false;
  Map<String, dynamic> _brand = const {};

  @override
  void initState() {
    super.initState();
    _load(reset: true);
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
    var preset = _brand['stylePreset']?.toString() ?? 'clean';
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Brand settings'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
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
                decoration: const InputDecoration(labelText: 'Style preset'),
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
                onChanged: (value) => setLocal(() => preset = value ?? 'clean'),
              ),
              const SizedBox(height: 8),
              const Text(
                'ScaledCircle keeps text contrast readable when these colors are used in future customer-facing designs.',
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save settings'),
            ),
          ],
        ),
      ),
    );
    if (save != true) return;
    try {
      await _service.updateBrand(
        primaryColor: primary.text,
        secondaryColor: secondary.text,
        stylePreset: preset,
      );
      await _load(reset: true);
    } catch (_) {
      setState(() => _error = 'Use colors in #RRGGBB format and try again.');
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
                  onPressed: _brandSettings,
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
                  onPressed: _brandSettings,
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
            if (_uploading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: LinearProgressIndicator(
                  semanticsLabel: 'Uploading and processing image',
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
              child: FutureBuilder<Uint8List?>(
                future: service.previewBytes(asset),
                builder: (context, snapshot) => ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: snapshot.data == null
                      ? Container(
                          color: Theme.of(
                            context,
                          ).colorScheme.surfaceContainerHighest,
                          child: const Icon(Icons.image_outlined, size: 48),
                        )
                      : Image.memory(
                          snapshot.data!,
                          fit: BoxFit.cover,
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
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                if (status == 'ready' && approval != 'approved')
                  FilledButton(
                    onPressed: onReview,
                    child: const Text('Review'),
                  ),
                if (status == 'ready' && approval == 'pending')
                  TextButton(onPressed: onReject, child: const Text('Reject')),
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
