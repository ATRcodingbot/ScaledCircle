import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../services/managed_growth_service.dart';
import '../../services/social_workflow_service.dart';

class SocialApprovalScreen extends StatefulWidget {
  const SocialApprovalScreen({
    super.key,
    required this.artifact,
    required this.businessName,
    required this.onMore,
  });
  final ManagedGrowthArtifact artifact;
  final String businessName;
  final VoidCallback onMore;

  @override
  State<SocialApprovalScreen> createState() => _SocialApprovalScreenState();
}

class _SocialApprovalScreenState extends State<SocialApprovalScreen> {
  final _service = SocialWorkflowService();
  final _picker = ImagePicker();
  List<SocialProviderAvailability> _providers = const [];
  late List<Map<String, dynamic>> _posts;
  String? _draftId;
  int _contentVersion = 1;
  String _status = 'ready_for_review';
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _posts = _postsFromArtifact(widget.artifact);
    _load();
  }

  List<Map<String, dynamic>> _postsFromArtifact(
    ManagedGrowthArtifact artifact,
  ) {
    final posts = <Map<String, dynamic>>[];
    for (final section in artifact.sections) {
      final heading = section['heading']?.toString() ?? '';
      final lower = heading.toLowerCase();
      final provider = lower.contains('instagram')
          ? 'instagram'
          : lower.contains('google')
          ? 'google_business'
          : lower.contains('linkedin')
          ? 'linkedin'
          : 'facebook';
      posts.add({
        'provider': provider,
        'format': lower.contains('story') ? 'story' : 'feed',
        'body': section['content']?.toString() ?? '',
        'callToAction': '',
        'hashtags': <String>[],
      });
    }
    if (posts.isEmpty) {
      posts.add({
        'provider': 'facebook',
        'format': 'feed',
        'body': artifact.summary,
        'hashtags': <String>[],
      });
    }
    return posts;
  }

  Future<void> _load() async {
    try {
      final providers = await _service.providerAvailability();
      final draftId = await _service.createDraft(
        artifactId: widget.artifact.id,
        posts: _posts,
      );
      if (mounted) {
        setState(() {
          _providers = providers;
          _draftId = draftId;
        });
      }
    } on FirebaseFunctionsException catch (error) {
      _message(error.message ?? 'Unable to prepare these posts.');
    }
  }

  String _label(String provider) => switch (provider) {
    'instagram' => 'Instagram',
    'google_business' => 'Google Business',
    'linkedin' => 'LinkedIn',
    _ => 'Facebook',
  };

  Future<void> _edit(int index) async {
    final controller = TextEditingController(
      text: _posts[index]['body']?.toString(),
    );
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Edit ${_label(_posts[index]['provider'].toString())} post',
        ),
        content: TextField(
          controller: controller,
          minLines: 6,
          maxLines: 14,
          decoration: const InputDecoration(
            labelText: 'What customers will see',
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
    if (save == true && _draftId != null) {
      final updated = _posts
          .map((post) => Map<String, dynamic>.from(post))
          .toList();
      updated[index]['body'] = controller.text.trim();
      try {
        final version = await _service.updateDraft(
          draftId: _draftId!,
          posts: updated,
        );
        if (mounted) {
          setState(() {
            _posts = updated;
            _contentVersion = version;
            _status = 'ready_for_review';
          });
        }
      } on FirebaseFunctionsException catch (error) {
        _message(error.message ?? 'Unable to save that edit.');
      }
    }
    controller.dispose();
  }

  Future<void> _approveAndSchedule({bool postNow = false}) async {
    if (_draftId == null || _working) return;
    if (!_providers.any((provider) => provider.canPublish)) {
      _connectionRequired();
      return;
    }
    DateTime scheduled = DateTime.now().add(const Duration(days: 1));
    if (!postNow) {
      final selected = await showDatePicker(
        context: context,
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 90)),
        initialDate: scheduled,
        helpText: 'When should we post this?',
      );
      if (selected == null) return;
      scheduled = DateTime(selected.year, selected.month, selected.day, 9);
    } else {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Post this now?'),
          content: Text(
            'Post the approved preview for ${_posts.map((p) => _label(p['provider'].toString())).toSet().join(' and ')}?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Post Now'),
            ),
          ],
        ),
      );
      if (confirm != true) return;
      scheduled = DateTime.now().add(const Duration(minutes: 1));
    }
    setState(() => _working = true);
    try {
      await _service.approve(
        draftId: _draftId!,
        contentVersion: _contentVersion,
      );
      await _service.schedule(draftId: _draftId!, scheduledFor: scheduled);
      if (mounted) setState(() => _status = 'scheduled');
      _message(postNow ? 'Approved for publishing now.' : 'Posts scheduled.');
    } on FirebaseFunctionsException catch (error) {
      _message(error.message ?? 'Review the social connection and try again.');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _approveOnly() async {
    if (_draftId == null || _working) return;
    setState(() => _working = true);
    try {
      await _service.approve(
        draftId: _draftId!,
        contentVersion: _contentVersion,
      );
      if (mounted) setState(() => _status = 'approved');
      _message(
        'Posts approved and ready to schedule when your social connection is available.',
      );
    } on FirebaseFunctionsException catch (error) {
      _message(error.message ?? 'Unable to approve these posts.');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _uploadPhoto() async {
    final selected = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
    );
    if (selected == null) return;
    if (!mounted) return;
    final description = TextEditingController();
    String? category;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: const Text('What does this photo show?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: description,
                decoration: const InputDecoration(
                  hintText: 'Example: Completed deck project',
                  helperText: "We'll use only details you provide.",
                ),
              ),
              DropdownButtonFormField<String?>(
                initialValue: category,
                decoration: const InputDecoration(
                  labelText: 'Category (optional)',
                ),
                items: const [
                  DropdownMenuItem(value: null, child: Text('No category')),
                  DropdownMenuItem(value: 'Decks', child: Text('Decks')),
                  DropdownMenuItem(value: 'Fences', child: Text('Fences')),
                  DropdownMenuItem(value: 'Roofing', child: Text('Roofing')),
                  DropdownMenuItem(value: 'Kitchen', child: Text('Kitchen')),
                  DropdownMenuItem(value: 'Bathroom', child: Text('Bathroom')),
                  DropdownMenuItem(
                    value: 'Before & After',
                    child: Text('Before & After'),
                  ),
                  DropdownMenuItem(value: 'Team', child: Text('Team')),
                  DropdownMenuItem(value: 'Other', child: Text('Other')),
                ],
                onChanged: (value) => setModalState(() => category = value),
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
              child: const Text('Add Photo'),
            ),
          ],
        ),
      ),
    );
    if (confirmed == true) {
      try {
        await _service.uploadPhoto(
          bytes: await selected.readAsBytes(),
          filename: selected.name,
          category: category,
          description: description.text.trim(),
        );
        _message('Photo added to My Photos.');
      } catch (_) {
        _message(
          'Unable to add that photo. Try a JPG, PNG, or WebP under 10 MB.',
        );
      }
    }
    description.dispose();
  }

  Future<void> _showPhotos() => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('My Photos'),
      content: SizedBox(
        width: 620,
        height: 420,
        child: StreamBuilder<List<Map<String, dynamic>>>(
          stream: _service.mediaItems(),
          builder: (context, snapshot) {
            final items = snapshot.data ?? const [];
            if (items.isEmpty) {
              return const Center(
                child: Text(
                  'Upload project photos once, then reuse them in future posts.',
                ),
              );
            }
            return GridView.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return FutureBuilder<String>(
                  future: _service.mediaDownloadUrl(
                    item['storagePath']?.toString() ?? '',
                  ),
                  builder: (context, image) => Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        Expanded(
                          child: image.hasData
                              ? Image.network(
                                  image.data!,
                                  fit: BoxFit.cover,
                                  width: double.infinity,
                                )
                              : const Center(child: Icon(Icons.image_outlined)),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(6),
                          child: Text(
                            item['category']?.toString() ??
                                item['filename']?.toString() ??
                                'Photo',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
      actions: [
        TextButton(onPressed: _uploadPhoto, child: const Text('Upload Photo')),
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Done'),
        ),
      ],
    ),
  );

  void _connectionRequired() => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Connection requires approval'),
      content: const Text(
        'Social publishing is not enabled yet. You can review, edit, save, copy, or export these posts while ScaledCircle completes provider approval.',
      ),
      actions: [
        TextButton(
          onPressed: widget.onMore,
          child: const Text('Export instead'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Got it'),
        ),
      ],
    ),
  );

  void _message(String value) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }

  @override
  Widget build(BuildContext context) {
    final publishingAvailable = _providers.any(
      (provider) => provider.canPublish,
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Your Posts Are Ready')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Your Social Accounts',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          ..._providers.map(
            (provider) => Card(
              child: ListTile(
                leading: const Icon(Icons.public),
                title: Text(provider.label),
                subtitle: Text(
                  provider.status == 'requires_approval'
                      ? 'Connection requires approval'
                      : 'Coming Soon',
                ),
                trailing: provider.status == 'requires_approval'
                    ? TextButton(
                        onPressed: _connectionRequired,
                        child: const Text('Review Status'),
                      )
                    : const Text('Coming Soon'),
              ),
            ),
          ),
          Card(
            child: ListTile(
              onTap: _showPhotos,
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('My Photos'),
              subtitle: const Text(
                'Use your own project photos. ScaledCircle uses only details you provide.',
              ),
              trailing: Wrap(
                spacing: 4,
                children: [
                  TextButton(
                    onPressed: _uploadPhoto,
                    child: const Text('Upload Photo'),
                  ),
                  const Tooltip(
                    message: 'Coming Soon / Beta',
                    child: Chip(label: Text('Create Image — Coming Soon')),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text('Preview', style: Theme.of(context).textTheme.headlineSmall),
          const Text(
            'A close preview of what customers will see. Social apps may change their exact layout.',
          ),
          const SizedBox(height: 8),
          ..._posts.asMap().entries.map(
            (entry) => _SocialPreviewCard(
              businessName: widget.businessName,
              provider: _label(entry.value['provider'].toString()),
              format: entry.value['format']?.toString() ?? 'feed',
              body: entry.value['body']?.toString() ?? '',
              onEdit: () => _edit(entry.key),
              onChangePhoto: _uploadPhoto,
              onTryAnother: () => _message(
                'Use Regenerate to create another grounded version.',
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Everything look good?',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: _working
                    ? null
                    : publishingAvailable
                    ? _approveAndSchedule
                    : _approveOnly,
                icon: Icon(
                  publishingAvailable
                      ? Icons.schedule
                      : Icons.check_circle_outline,
                ),
                label: Text(
                  publishingAvailable ? 'Approve & Schedule' : 'Approve Posts',
                ),
              ),
              OutlinedButton.icon(
                onPressed: _working || !publishingAvailable
                    ? null
                    : () => _approveAndSchedule(postNow: true),
                icon: const Icon(Icons.send),
                label: const Text('Post Now'),
              ),
              TextButton(onPressed: () => _edit(0), child: const Text('Edit')),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Save for Later'),
              ),
              PopupMenuButton<String>(
                tooltip: 'More',
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'export',
                    child: Text('Download / Email / Copy All'),
                  ),
                ],
                onSelected: (_) => widget.onMore(),
                child: const Chip(label: Text('More')),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            'Social Calendar',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.calendar_today),
              title: Text(widget.artifact.title),
              subtitle: Text(switch (_status) {
                'scheduled' => 'Scheduled',
                'approved' => 'Ready to Schedule',
                _ => 'Needs Approval',
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class _SocialPreviewCard extends StatelessWidget {
  const _SocialPreviewCard({
    required this.businessName,
    required this.provider,
    required this.format,
    required this.body,
    required this.onEdit,
    required this.onChangePhoto,
    required this.onTryAnother,
  });
  final String businessName;
  final String provider;
  final String format;
  final String body;
  final VoidCallback onEdit;
  final VoidCallback onChangePhoto;
  final VoidCallback onTryAnother;

  @override
  Widget build(BuildContext context) {
    final story = provider == 'Instagram' && format == 'story';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  child: Text(
                    businessName.isEmpty ? 'B' : businessName[0].toUpperCase(),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        businessName,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text('$provider ${story ? 'Story' : 'Preview'}'),
                    ],
                  ),
                ),
                const Chip(label: Text('Preview')),
              ],
            ),
            const SizedBox(height: 12),
            AspectRatio(
              aspectRatio: story ? 9 / 16 : 4 / 3,
              child: Container(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                alignment: Alignment.center,
                child: const Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.image_outlined, size: 48),
                    Text('Choose a project photo'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            SelectableText(body),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: [
                TextButton(onPressed: onEdit, child: const Text('Edit')),
                TextButton(
                  onPressed: onTryAnother,
                  child: const Text('Try Another Version'),
                ),
                TextButton(
                  onPressed: onChangePhoto,
                  child: const Text('Change Photo'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
