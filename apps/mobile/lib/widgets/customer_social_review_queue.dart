import 'package:flutter_app/navigation/authenticated_app_bar.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../models/social_plan_presentation.dart';
import '../services/social_operations_service.dart';
import 'customer_social_post_editor.dart';
import 'social_candidate_preview.dart';

const socialQueueGroups = [
  'Scheduled',
  'Publishing',
  'Published',
  'Preparing automatically',
  'Ready for Review',
  'Preparing Creative',
  'Needs Attention',
  'Canceled',
];
List<Map<String, dynamic>> socialReviewRows(
  List<Map<String, dynamic>> plans,
) => [
  for (final plan in plans)
    for (final item in (plan['items'] as List? ?? []).whereType<Map>())
      for (final variant in (item['variants'] as List? ?? []).whereType<Map>())
        if (['facebook', 'instagram'].contains(variant['provider']))
          {
            ...Map<String, dynamic>.from(variant['scheduling'] as Map? ?? {}),
            'itemId': '${plan['id']}_${item['itemKey']}',
            'provider': variant['provider'],
            'title': item['pillar'] ?? 'Social post',
            'strategyTitle': plan['goal'] ?? '30-Day Plan',
            'publicationStatus':
                [
                  'scheduled',
                  'publishing',
                  'published',
                ].contains(variant['status'])
                ? variant['status']
                : null,
            'scheduledFor':
                variant['scheduledFor'] ??
                (variant['scheduling'] as Map?)?['scheduledFor'] ??
                item['scheduledFor'],
          },
];
String socialQueueGroup(Map<String, dynamic> row) {
  if (row['managedHold']?['status'] == 'canceled') return 'Canceled';
  if (row['publicationStatus'] == 'published') return 'Published';
  if (row['publicationStatus'] == 'publishing') return 'Publishing';
  if (row['publicationStatus'] == 'scheduled') {
    return 'Scheduled';
  }
  if (row['automaticMode'] == true && row['managedHold'] == null) {
    return row['automaticState'] == 'needs_attention'
        ? 'Needs Attention'
        : 'Preparing automatically';
  }
  if (row['preparing'] == true || row['reviewState'] == 'preparing_creative') {
    return 'Preparing Creative';
  }
  if (row['preparationError'] == null && row['ready'] == true) {
    return 'Ready for Review';
  }
  return 'Needs Attention';
}

/// The queue stays in the navigation stack while previews change. Its scroll
/// controller and selected group survive Back, Previous, Next and approval.
class CustomerSocialReviewQueue extends StatefulWidget {
  const CustomerSocialReviewQueue({
    super.key,
    required this.workspace,
    required this.service,
    required this.onSchedule,
  });
  final SocialOperationsWorkspace workspace;
  final SocialOperationsService service;
  final Future<void> Function(Map<String, dynamic>) onSchedule;
  @override
  State<CustomerSocialReviewQueue> createState() =>
      _CustomerSocialReviewQueueState();
}

class _CustomerSocialReviewQueueState extends State<CustomerSocialReviewQueue> {
  Timer? _refreshTimer;
  late bool _automatic =
      widget.workspace.data['automaticPublishing']?['status'] == 'active';
  late List<Map<String, dynamic>> _rows = socialReviewRows(
    widget.workspace.plans,
  );
  final _scroll = ScrollController();
  final Set<String> _attempted = {};
  String? _group;
  bool _preparing = false;
  @override
  void initState() {
    super.initState();
    if (!_automatic) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _prepare());
    }
    if (_automatic) {
      _refreshTimer = Timer.periodic(
        const Duration(seconds: 30),
        (_) => _refresh(),
      );
    }
  }

  Future<void> _refresh() async {
    try {
      final fresh = await widget.service.load();
      if (mounted) {
        setState(() {
          _rows = socialReviewRows(fresh.plans);
          _automatic = fresh.data['automaticPublishing']?['status'] == 'active';
        });
      }
    } catch (_) {
      /* Keep the last verified state; explicit actions report errors. */
    }
  }

  Future<void> _changePost(int index, String action) async {
    final row = _rows[index];
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          action == 'cancel'
              ? 'Cancel this post?'
              : 'Edit this scheduled post?',
        ),
        content: Text(
          action == 'cancel'
              ? 'This post will not publish. Its history will be retained.'
              : 'The pending schedule will be canceled safely. Review and save your changes before it is scheduled again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep schedule'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              action == 'cancel' ? 'Cancel post' : 'Edit / Reschedule',
            ),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await widget.service.changeScheduledPost({
        'jobId': row['jobId'],
        'action': action,
      });
      await _refresh();
      if (mounted && action == 'edit') {
        final current = _rows.indexWhere((r) => _key(r) == _key(row));
        if (current >= 0) await _open(current);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'This post could not be changed. Publication may already be starting. Refresh its status before trying again.',
            ),
          ),
        );
      }
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  String _key(Map row) => '${row['itemId']}:${row['provider']}';
  Future<void> _prepare() async {
    if (_preparing) return;
    _preparing = true;
    for (var i = 0; i < _rows.length; i++) {
      if (!mounted) break;
      final row = _rows[i];
      if (row['publicationStatus'] != null ||
          row['version'] == null ||
          (row['ready'] == true && row['creativeNeedsPreparation'] != true) ||
          !_attempted.add(_key(row))) {
        continue;
      }
      setState(() => row['preparing'] = true);
      try {
        final result = await widget.service.preparePost({
          ...row,
          'action': 'auto',
          'confirmOwnerExecution': true,
        });
        final fresh = await widget.service.previewPost({
          'itemId': row['itemId'],
          'provider': row['provider'],
        });
        if (!mounted) break;
        setState(
          () => _rows[i] = {
            ...row,
            ...fresh,
            'preparing': false,
            if (result['generationRequest'] != null)
              'generationRequest': result['generationRequest'],
          },
        );
      } catch (_) {
        if (!mounted) break;
        setState(() {
          row['preparing'] = false;
          row['preparationError'] =
              'Creative needs attention. Open the preview to review available options.';
        });
      }
    }
    _preparing = false;
  }

  Future<void> _open(int index) async {
    final reviewable = _rows
        .where(
          (r) =>
              (_group == null || socialQueueGroup(r) == _group) &&
              r['version'] != null &&
              r['preparing'] != true,
        )
        .toList();
    final start = reviewable.indexWhere((r) => _key(r) == _key(_rows[index]));
    if (start < 0) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _SocialReviewPager(
          posts: reviewable,
          initialIndex: start,
          service: widget.service,
          onSchedule: widget.onSchedule,
        ),
      ),
    );
    if (!mounted) return;
    try {
      final fresh = await widget.service.load();
      if (mounted) setState(() => _rows = socialReviewRows(fresh.plans));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Saved status could not be refreshed. Your review list is kept here.',
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AuthenticatedAppBar(title: const Text('Upcoming Posts')),
    body: SafeArea(
      child: Column(
        children: [
          if (_automatic)
            Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.tonal(
                onPressed: () async {
                  try {
                    await widget.service.automaticPublishing({
                      'action': 'pause',
                    });
                    await _refresh();
                  } catch (_) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Pause could not be confirmed. Check publishing settings.',
                          ),
                        ),
                      );
                    }
                  }
                },
                child: const Text('Pause Publishing'),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: DropdownButtonFormField<String>(
              initialValue: _group ?? 'All',
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Post status'),
              items: [
                DropdownMenuItem(
                  value: 'All',
                  child: Text('All (${_rows.length})'),
                ),
                for (final group in socialQueueGroups)
                  DropdownMenuItem(
                    value: group,
                    child: Text(
                      '$group (${_rows.where((r) => socialQueueGroup(r) == group).length})',
                    ),
                  ),
              ],
              onChanged: (value) =>
                  setState(() => _group = value == 'All' ? null : value),
            ),
          ),
          if (_rows.any((r) => r['preparing'] == true))
            const LinearProgressIndicator(),
          if (_rows.any((r) => r['creativeRecommendation'] != null))
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                'Recommended mix for remaining posts: ${_rows.where((r) => r['publicationStatus'] == null && r['creativeRecommendation']?['format'] == 'text').length} text posts · ${_rows.where((r) => r['publicationStatus'] == null && r['creativeRecommendation']?['format'] != 'text').length} image posts. Platform versions may share a concept for the same idea.',
              ),
            ),
          if (_rows.where((r) => r['creativeSupply'] is Map).isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Text(
                '${_rows.where((r) => r['creativeSupply'] is Map).last['creativeSupply']['conceptsNeeded']} additional concepts needed for fresh coverage. New concepts are prepared within your allowance; paired platform sizes share one source.',
              ),
            ),
          Expanded(
            child: ListView.builder(
              key: const PageStorageKey('social-review-content'),
              controller: _scroll,
              itemCount: _rows.length,
              itemBuilder: (context, index) {
                final row = _rows[index], group = socialQueueGroup(row);
                if (_group != null && group != _group) {
                  return const SizedBox.shrink();
                }
                final images = (row['reviewedPost']?['images'] as List? ?? [])
                    .whereType<Map>()
                    .toList();
                return Card(
                  key: ValueKey(_key(row)),
                  margin: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (images.isNotEmpty)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: SizedBox(
                              width: 180,
                              height: 150,
                              child: Image.network(
                                images.first['url'].toString(),
                                fit: BoxFit.contain,
                                errorBuilder: (_, error, stack) => const Center(
                                  child: Text('Preview unavailable'),
                                ),
                              ),
                            ),
                          ),
                        if (row['creativeLabel'] != null)
                          Text(
                            row['creativeLabel'].toString(),
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                        Text(
                          row['provider'] == 'instagram'
                              ? 'Instagram'
                              : 'Facebook',
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                        Text(
                          row['title'].toString(),
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        Text(row['strategyTitle'].toString()),
                        if (row['reviewCandidate'] is Map)
                          SocialCandidatePreview(
                            candidate: Map<String, dynamic>.from(
                              row['reviewCandidate'] as Map,
                            ),
                          ),
                        if (row['creativeRecommendation']?['format'] == 'text')
                          const Align(
                            alignment: Alignment.centerLeft,
                            child: Chip(label: Text('TEXT POST')),
                          ),
                        if (row['creativeRecommendation'] != null) ...[
                          Text(
                            'Recommended format: ${row['creativeRecommendation']['label']}',
                          ),
                          Text(
                            row['creativeRecommendation']['reason'].toString(),
                          ),
                          if (row['creativeRecommendation']['generationStatus'] ==
                              'configuration_unavailable')
                            const Text(
                              'New creative is waiting: generation is not enabled. No visual was generated for this request.',
                            ),
                        ],
                        Text(group),
                        for (final reason in (row['automaticReasons'] as List? ?? []).whereType<Map>())
                          Text(reason['message']?.toString() ?? 'This post needs attention.'),
                        Text(socialCustomerTime(context, row['scheduledFor'])),
                        if (row['preparationError'] != null)
                          Text(row['preparationError'].toString()),
                        FilledButton(
                          onPressed:
                              row['preparing'] == true || row['version'] == null
                              ? null
                              : () => _open(index),
                          child: const Text('Preview'),
                        ),
                        if (row['publicationStatus'] == 'scheduled')
                          Wrap(
                            spacing: 8,
                            children: [
                              TextButton(
                                onPressed: () => _changePost(index, 'edit'),
                                child: const Text('Edit / Reschedule'),
                              ),
                              TextButton(
                                onPressed: () => _changePost(index, 'cancel'),
                                child: const Text('Cancel'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}

class _SocialReviewPager extends StatefulWidget {
  const _SocialReviewPager({
    required this.posts,
    required this.initialIndex,
    required this.service,
    required this.onSchedule,
  });
  final List<Map<String, dynamic>> posts;
  final int initialIndex;
  final SocialOperationsService service;
  final Future<void> Function(Map<String, dynamic>) onSchedule;
  @override
  State<_SocialReviewPager> createState() => _SocialReviewPagerState();
}

class _SocialReviewPagerState extends State<_SocialReviewPager> {
  late int _index = widget.initialIndex;
  @override
  Widget build(BuildContext context) => CustomerSocialPostEditor(
    key: ValueKey(_index),
    post: widget.posts[_index],
    service: widget.service,
    onSchedule: widget.onSchedule,
    positionLabel: '${_index + 1} of ${widget.posts.length}',
    onPrevious: _index > 0 ? () => setState(() => _index--) : null,
    onNext: _index + 1 < widget.posts.length
        ? () => setState(() => _index++)
        : null,
  );
}
