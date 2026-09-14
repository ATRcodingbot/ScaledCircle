import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/social_operations_service.dart';
import '../services/business_media_service.dart';
import '../screens/business/brand_assets_screen.dart';
import '../models/social_plan_presentation.dart';
import 'social_candidate_preview.dart';
import 'social_asset_choice.dart';

/// Preparation is intentionally separate from the exact approval confirmation.
class CustomerSocialPostEditor extends StatefulWidget {
  const CustomerSocialPostEditor({
    super.key,
    required this.post,
    required this.service,
    this.onSchedule,
    this.onPrevious,
    this.onNext,
    this.positionLabel,
  });
  final VoidCallback? onPrevious, onNext;
  final String? positionLabel;
  final Map<String, dynamic> post;
  final SocialOperationsService service;
  final Future<void> Function(Map<String, dynamic>)? onSchedule;
  @override
  State<CustomerSocialPostEditor> createState() =>
      _CustomerSocialPostEditorState();
}

class _CustomerSocialPostEditorState extends State<CustomerSocialPostEditor> {
  late Map<String, dynamic> _post = Map.of(widget.post);
  late final _copy = TextEditingController(
    text: (_post['reviewedPost']?['variant']?['copy'] ?? '').toString(),
  );
  late final _cta = TextEditingController(
    text: (_post['reviewedPost']?['variant']?['callToAction'] ?? '').toString(),
  );
  late final _destination = TextEditingController(
    text: (_post['reviewedPost']?['variant']?['destinationUrl'] ?? '')
        .toString(),
  );
  late DateTime? _time = DateTime.tryParse(
    _post['scheduledFor']?.toString() ?? '',
  )?.toLocal();
  bool _busy = false, _changed = false, _editing = false;
  final Set<String> _loadedPreviewImages = {};
  bool get _imagesVisible =>
      (_post['reviewedPost']?['images'] as List? ?? []).whereType<Map>().every(
        (image) => _loadedPreviewImages.contains(image['url'].toString()),
      ) &&
      (_post['reviewCandidate'] == null ||
          _loadedPreviewImages.contains(_post['reviewCandidate']['sha256']));
  late bool _textOnly =
      _post['reviewedPost']?['variant']?['mediaRequirement'] == 'none';
  String? _error, _creativeNotice;
  Map<String, dynamic> _generation = {};
  bool get _generationAvailable =>
      _generation['availability']?['available'] == true;
  Map<String, dynamic>? _quality;
  Map<String, dynamic> get _identity => {
    'itemId': _post['itemId'],
    'provider': _post['provider'],
    'version': _post['version'],
  };
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _run(
          (_post['ready'] == true &&
                      _post['creativeNeedsPreparation'] != true) ||
                  _post['publicationStatus'] != null
              ? _refresh
              : _prepare,
        );
      }
    });
  }

  Future<void> _prepare() async {
    final result = await widget.service
        .preparePost({
          ..._identity,
          'action': 'auto',
          'confirmOwnerExecution': true,
        })
        .timeout(const Duration(minutes: 4));
    await _refresh();
    if (mounted) {
      _creativeNotice = result['creativeStatus'] == 'concept_needs_review'
          ? 'Review this concept and post together. Your confirmation approves the exact creative and schedules this version.'
          : result['generationMessage']?.toString();
      setState(
        () => _quality = Map<String, dynamic>.from(
          result['quality'] as Map? ?? {},
        ),
      );
    }
  }

  @override
  void dispose() {
    _copy.dispose();
    _cta.dispose();
    _destination.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (_) {
      try {
        await _refresh().timeout(const Duration(seconds: 10));
      } catch (_) {
        // Keep the current text when the authoritative readback is unavailable.
      }
      if (mounted) {
        setState(
          () => _error =
              'We could not confirm this change. Your text is kept here. Reload the saved post before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refresh() async {
    final fresh = await widget.service.previewPost(_identity);
    final generation = await widget.service.generationAvailability();
    if (mounted) {
      setState(() {
        _post = {..._post, ...fresh, 'itemId': _post['itemId']};
        _generation = generation;
        _quality = Map<String, dynamic>.from(
          fresh['reviewedPost']?['quality'] as Map? ?? {},
        );
        if (!_changed) {
          _textOnly =
              fresh['reviewedPost']?['variant']?['mediaRequirement'] == 'none';
          _copy.text =
              fresh['reviewedPost']?['variant']?['copy']?.toString() ??
              _copy.text;
          _cta.text =
              fresh['reviewedPost']?['variant']?['callToAction']?.toString() ??
              _cta.text;
          _destination.text =
              fresh['reviewedPost']?['variant']?['destinationUrl']
                  ?.toString() ??
              _destination.text;
          _time = DateTime.tryParse(
            fresh['scheduledFor']?.toString() ?? '',
          )?.toLocal();
        }
      });
    }
    socialReviewRevision.value++;
  }

  Future<void> _save() async {
    if (_time == null) {
      setState(() => _error = 'Choose a future time.');
      return;
    }
    final result = await widget.service.preparePost({
      ..._identity,
      'action': 'save',
      'copy': _copy.text,
      'callToAction': _cta.text,
      'destinationUrl': _destination.text,
      'scheduledFor': _time!.toUtc().toIso8601String(),
      'textOnly': _textOnly,
    });
    if (mounted) setState(() => _changed = false);
    await _refresh();
    if (mounted) {
      setState(() {
        _changed = false;
        _quality = Map<String, dynamic>.from(result['quality'] as Map? ?? {});
        _editing = false;
      });
    }
  }

  Future<void> _chooseTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: (_time?.isAfter(now) == true ? _time : now)!,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        _time ?? now.add(const Duration(hours: 1)),
      ),
    );
    if (time != null && mounted) {
      setState(() {
        _time = DateTime(
          date.year,
          date.month,
          date.day,
          time.hour,
          time.minute,
        );
        _changed = true;
      });
    }
  }

  Future<void> _regenerate() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Regenerate image?'),
        content: Text(
          'Generate one NEW concept for this exact post. A successful source concept uses one unit; platform sizes use no extra units. Nothing is approved or scheduled.\n\n${_generation['usage']?['remaining'] ?? 'Check your'} concepts remaining this month.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Regenerate Image'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (mounted) setState(() => _creativeNotice = 'Preparing new creative…');
    final result = await widget.service.preparePost({
      ..._identity,
      'action': 'regenerate',
      'candidateSha256': _post['reviewCandidate']?['sha256'],
      'confirmRegeneration': true,
    });
    await _refresh();
    if (mounted) {
      setState(
        () => _creativeNotice =
            result['generationMessage']?.toString() ??
            (result['creativeStatus'] == 'concept_needs_review'
                ? 'New creative prepared. Review it with this post before approval.'
                : 'Your creative status has been updated.'),
      );
    }
  }

  Future<void> _uploadImage() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 12000,
      maxHeight: 12000,
    );
    if (picked == null || !mounted) return;
    final description = TextEditingController();
    bool rights = false;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Use your image'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(picked.name),
                TextField(
                  controller: description,
                  decoration: const InputDecoration(
                    labelText: 'Describe the image',
                  ),
                ),
                CheckboxListTile(
                  value: rights,
                  onChanged: (value) => update(() => rights = value == true),
                  title: const Text(
                    'I own this image or have permission to publish it.',
                  ),
                ),
                const Text(
                  'The full platform preview will appear here before post approval.',
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Back'),
            ),
            FilledButton(
              onPressed: rights ? () => Navigator.pop(context, true) : null,
              child: const Text('Use this image'),
            ),
          ],
        ),
      ),
    );
    final alt = description.text.trim();
    description.dispose();
    if (confirmed != true || alt.isEmpty) return;
    final media = BusinessMediaService();
    final created = await media.uploadForReview(
      bytes: await picked.readAsBytes(),
      filename: picked.name,
      purpose: 'service_visual',
    );
    await media.saveReviewMetadata(
      assetId: created['assetId'],
      revisionId: created['revisionId'],
      altText: alt,
      serviceLabel:
          _post['creativeRecommendation']?['service']?.toString() ?? '',
      rightsAttestation: true,
    );
    await media.approve(created['assetId'], created['revisionId']);
    await widget.service.preparePost({
      ..._identity,
      'action': 'attach',
      'assetId': created['assetId'],
      'revisionId': created['revisionId'],
      'confirmPublicUse': true,
    });
    await _refresh();
  }

  Future<void> _chooseImage() async {
    final media = BusinessMediaService();
    String? cursor;
    var continuePages = true;
    while (continuePages && mounted) {
      final workspace = await media.workspace(cursor: cursor);
      final assets = (workspace['assets'] as List? ?? [])
          .whereType<Map>()
          .where((a) => a['approvedRevisionId'] != null && a['removed'] != true)
          .toList();
      if (!mounted) return;
      final selected = await showDialog<Map>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('Choose approved creative'),
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Use an image you own or have permission to publish. You will review the exact platform crop before approving the post.',
              ),
            ),
            for (final asset in assets)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(context, asset),
                child: SocialAssetChoice(
                  asset: Map<String, dynamic>.from(asset),
                  history: Map<String, dynamic>.from(
                    ((_post['creativeAssets'] as List? ?? [])
                            .whereType<Map>()
                            .where((h) => h['assetId'] == asset['assetId'])
                            .firstOrNull) ??
                        {},
                  ),
                  load: () =>
                      media.previewBytes(Map<String, dynamic>.from(asset)),
                ),
              ),
            if (assets.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'No approved images on this page. Upload and approve an image in Brand Assets.',
                ),
              ),
            if (workspace['hasMore'] == true)
              SimpleDialogOption(
                onPressed: () => Navigator.pop(context, {'next': true}),
                child: const Text('More images'),
              ),
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, {'upload': true}),
              child: const Text('Upload or review Brand Assets'),
            ),
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back'),
            ),
          ],
        ),
      );
      if (selected == null) return;
      if (!mounted) return;
      if (selected['next'] == true) {
        cursor = workspace['nextCursor'] as String?;
        continue;
      }
      if (selected['upload'] == true) {
        await Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => const BrandAssetsScreen()),
        );
        cursor = null;
        continue;
      }
      if (!mounted) return;
      final accepted = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Use this image for Social?'),
          content: Text(
            '${selected['title'] ?? 'Your approved image'} will be prepared for public Social use. This does not approve or schedule a post.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Back'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Use image for Social'),
            ),
          ],
        ),
      );
      if (accepted != true) return;
      final result = await widget.service.preparePost({
        ..._identity,
        'action': 'attach',
        'assetId': selected['assetId'],
        'revisionId': selected['approvedRevisionId'],
        'confirmPublicUse': true,
      });
      await _refresh();
      if (mounted) {
        setState(() {
          _quality = Map<String, dynamic>.from(result['quality'] as Map? ?? {});
          _textOnly = false;
        });
      }
      continuePages = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.positionLabel == null
              ? 'Post Preview'
              : 'Post ${widget.positionLabel}',
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (widget.positionLabel != null)
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: _busy || _changed ? null : widget.onPrevious,
                    child: const Text('Previous'),
                  ),
                  OutlinedButton(
                    onPressed: _busy || _changed ? null : widget.onNext,
                    child: Text(
                      _post['publicationStatus'] == 'scheduled'
                          ? 'Review next post'
                          : 'Next',
                    ),
                  ),
                ],
              ),
            const Text(
              'Post Preview',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const Text(
              'Your exact approval controls publication. Creative preparation and quality checks run automatically.',
            ),
            if (_busy) ...[
              const LinearProgressIndicator(),
              const Text('Preparing your preview…'),
            ],
            Text(_post['provider'] == 'instagram' ? 'Instagram' : 'Facebook'),
            if (_post['reviewCandidate'] is Map)
              SocialCandidatePreview(
                load: () => widget.service.previewCreative(
                  Map<String, dynamic>.from(_post['reviewCandidate']),
                ),
                candidate: Map<String, dynamic>.from(
                  _post['reviewCandidate'] as Map,
                ),
                onReady: () {
                  final digest = _post['reviewCandidate']?['sha256'];
                  if (mounted &&
                      digest is String &&
                      !_loadedPreviewImages.contains(digest)) {
                    setState(() => _loadedPreviewImages.add(digest));
                  }
                },
              ),
            if (_post['creativeRecommendation'] != null) ...[
              Text(
                'Recommended format: ${_post['creativeRecommendation']['label']}',
              ),
              Text(_post['creativeRecommendation']['reason'].toString()),
              if (_post['creativeRecommendation']['generationStatus'] ==
                  'configuration_unavailable')
                const Text(
                  'Generation is not enabled. Your monthly allowance remains available. Upload an approved photo or return when generation is enabled.',
                ),
            ],
            for (final image
                in (_post['reviewedPost']?['images'] as List? ?? [])
                    .whereType<Map>())
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Image.network(
                  image['url'].toString(),
                  width: MediaQuery.sizeOf(
                    context,
                  ).width.clamp(0, 640).toDouble(),
                  fit: BoxFit.contain,
                  height: 340,
                  frameBuilder: (context, child, frame, synchronous) {
                    final url = image['url'].toString();
                    if ((frame != null || synchronous) &&
                        !_loadedPreviewImages.contains(url)) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted && !_loadedPreviewImages.contains(url)) {
                          setState(() => _loadedPreviewImages.add(url));
                        }
                      });
                    }
                    return child;
                  },
                  errorBuilder: (_, error, stack) => const Text(
                    'Image preview unavailable. Reload before approval.',
                  ),
                ),
              ),
            if (!_editing) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(_copy.text),
              ),
              Text('Call to action: ${_cta.text}'),
              Text('Destination: ${_destination.text}'),
              TextButton(
                onPressed: _busy ? null : () => setState(() => _editing = true),
                child: const Text('Edit Post'),
              ),
            ],
            if (_error != null) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(_error!, semanticsLabel: _error),
              ),
              TextButton(
                onPressed: _busy ? null : () => _run(_refresh),
                child: const Text('Reload saved status (keep my text)'),
              ),
            ],
            if (_editing)
              TextField(
                key: const ValueKey('social-post-copy'),
                controller: _copy,
                minLines: 4,
                maxLines: 10,
                onChanged: (_) => setState(() => _changed = true),
                decoration: const InputDecoration(labelText: 'Post text'),
              ),
            if (_editing)
              TextField(
                controller: _cta,
                onChanged: (_) => setState(() => _changed = true),
                decoration: const InputDecoration(labelText: 'Call to action'),
              ),
            if (_editing)
              TextField(
                controller: _destination,
                keyboardType: TextInputType.url,
                onChanged: (_) => setState(() => _changed = true),
                decoration: const InputDecoration(
                  labelText: 'Destination (https://)',
                ),
              ),
            const SizedBox(height: 12),
            Text(
              'Proposed time: ${socialCustomerTime(context, _time?.isAfter(DateTime.now()) == true ? _time?.toIso8601String() : _post['proposedFutureTime'])}',
            ),
            TextButton.icon(
              onPressed: _busy ? null : _chooseTime,
              icon: const Icon(Icons.schedule),
              label: const Text('Choose time'),
            ),
            if (_post['provider'] == 'facebook')
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Use a text-only Facebook post'),
                subtitle: const Text('No image is needed for this format.'),
                value: _textOnly,
                onChanged: _busy
                    ? null
                    : (v) => setState(() {
                        _textOnly = v == true;
                        _changed = true;
                      }),
              ),
            if (_changed)
              FilledButton(
                onPressed: _busy ? null : () => _run(_save),
                child: Text(_busy ? 'Working…' : 'Save draft changes'),
              ),
            const SizedBox(height: 20),
            if (!_busy)
              Text(
                _post['publicationStatus'] != null
                    ? 'Approved version'
                    : _post['ready'] == true
                    ? 'Ready for Review'
                    : _post['reviewState'] == 'preparing_creative'
                    ? 'Preparing Creative'
                    : _post['reviewState'] == 'needs_creative'
                    ? 'Needs Creative'
                    : 'Needs Attention',
              ),
            if (_creativeNotice != null) Text(_creativeNotice!),
            if (_post['creativeNeedsPreparation'] == true && !_busy)
              TextButton(
                onPressed: _changed ? null : () => _run(_prepare),
                child: const Text('Retry image check'),
              ),
            OutlinedButton(
              onPressed: _busy || _changed || _post['publicationStatus'] != null
                  ? null
                  : () => _run(_uploadImage),
              child: const Text('Upload / Replace Image'),
            ),
            OutlinedButton(
              onPressed: _busy || _changed || _post['publicationStatus'] != null
                  ? null
                  : () => _run(_chooseImage),
              child: const Text('Use Different Asset'),
            ),
            OutlinedButton(
              onPressed:
                  _busy ||
                      _changed ||
                      !_generationAvailable ||
                      _post['publicationStatus'] != null
                  ? null
                  : () => _run(_regenerate),
              child: const Text('Regenerate Image'),
            ),
            if (!_generationAvailable) ...[
              Text(
                _generation['availability']?['message']?.toString() ??
                    'Creative generation is temporarily unavailable.',
              ),
              TextButton(
                onPressed: _busy ? null : () => _run(_refresh),
                child: const Text('Try Again Later'),
              ),
            ],
            if (_generation['usage'] is Map)
              Text(
                '${_generation['usage']['used']} of ${_generation['usage']['total']} generated concepts used · ${_generation['usage']['remaining']} remaining',
              ),

            if (_changed)
              const Text(
                'Save your changes to refresh the preview and automatic quality checks.',
              ),
            if (!_busy && _quality != null) ...[
              for (final blocker
                  in (_quality!['reviewChecks']?['blockers'] as List? ?? []))
                Text(blocker.toString()),
              ExpansionTile(
                title: const Text('Content suggestions'),
                children: [
                  for (final v
                      in (_quality!['variantAssessments'] as List? ?? [])
                          .whereType<Map>()) ...[
                    Text(
                      'Recommendation: ${socialQualityLabel(v['recommendation'])}',
                    ),
                    for (final advice in socialQualityAdvice(v)) Text(advice),
                  ],
                ],
              ),
              const Text(
                'This is an automated content check, not proof of performance. Review the actual image and claims before approval.',
              ),
            ],
            if (!_busy)
              for (final reason
                  in (_post['reasons'] as List? ?? []).whereType<Map>())
                Text(
                  socialEvidenceText(
                    reason['message'],
                    'Review current requirements.',
                  ),
                ),
            const SizedBox(height: 16),
            if (_post['publicationStatus'] != null)
              Text(
                'Post ${_post['publicationStatus']}. Your saved approval and schedule are preserved.',
              ),
            if (_post['publicationStatus'] == null &&
                _post['ready'] == true &&
                !_changed &&
                widget.onSchedule != null)
              FilledButton(
                onPressed: _busy || !_imagesVisible
                    ? null
                    : () => _run(() async {
                        await widget.onSchedule!(_post);
                        await _refresh();
                      }),
                child: Text(
                  _post['inlineCreativeApproval'] != null
                      ? 'Approve Creative & Schedule'
                      : 'Approve & Schedule',
                ),
              ),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back to Content'),
            ),
          ],
        ),
      ),
    );
  }
}
