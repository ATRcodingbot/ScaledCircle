import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_environment.dart';
import '../../navigation/business_back_button.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import '../../services/landing_page_service.dart';

class LandingPageBuilderScreen extends StatefulWidget {
  const LandingPageBuilderScreen({super.key, this.pageId, this.service});
  final String? pageId;
  final LandingPageGateway? service;
  @override
  State<LandingPageBuilderScreen> createState() =>
      _LandingPageBuilderScreenState();
}

class _LandingPageBuilderScreenState extends State<LandingPageBuilderScreen> {
  late final LandingPageGateway _service =
      widget.service ?? LandingPageService();
  final _headline = TextEditingController(
    text: 'A clear solution for your next project',
  );
  final _support = TextEditingController(
    text: 'Tell us what you need. We’ll follow up with a clear next step.',
  );
  final _points = TextEditingController(
    text: 'Straightforward service\nA clear next step',
  );
  String _style = 'clean';
  String _cta = 'request_estimate';
  bool _tracking = false;
  bool _mobile = true;
  bool _busy = false;
  String? _pageId;
  String? _slug;
  String? _message;
  int? _inquiryCount;
  bool _isPublished = false;
  bool _hasUnpublishedChanges = false;
  String _savedHeadline = 'A clear solution for your next project';
  String _savedSupport =
      'Tell us what you need. We’ll follow up with a clear next step.';
  String _savedPoints = 'Straightforward service\nA clear next step';
  String _savedStyle = 'clean';
  String _savedCta = 'request_estimate';
  bool _savedTracking = false;
  List<Map<String, dynamic>> _recentInquiries = const [];
  List<Map<String, dynamic>> _pages = const [];
  String? _nextCursor;
  bool _hasMorePages = false;
  bool _loadingMore = false;
  bool _editing = false;
  String? _creationRequestId;

  bool get _hasUnsavedEdits =>
      _headline.text != _savedHeadline ||
      _support.text != _savedSupport ||
      _points.text != _savedPoints ||
      _style != _savedStyle ||
      _cta != _savedCta ||
      _tracking != _savedTracking;

  void _rememberSavedState() {
    _savedHeadline = _headline.text;
    _savedSupport = _support.text;
    _savedPoints = _points.text;
    _savedStyle = _style;
    _savedCta = _cta;
    _savedTracking = _tracking;
  }

  Future<bool> _confirmLeaveWithUnsavedChanges() async {
    if (!_hasUnsavedEdits) return true;
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Leave without saving?'),
            content: const Text(
              'Your latest Landing Page edits have not been saved. Your published page and saved draft will stay unchanged.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Keep editing'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Leave without saving'),
              ),
            ],
          ),
        ) ??
        false;
  }

  String _receivedAt(dynamic value) {
    try {
      final date = value.toDate() as DateTime;
      return '${date.month}/${date.day}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return 'Recently received';
    }
  }

  Uri? get _publicPageUrl => _slug == null
      ? null
      : AppEnvironmentConfig.publicBaseUrl.replace(
          path: '/p/$_slug',
          query: null,
          fragment: null,
        );

  Future<void> _copyPublicPageUrl() async {
    final url = _publicPageUrl;
    if (url == null) return;
    await Clipboard.setData(ClipboardData(text: url.toString()));
    if (mounted) setState(() => _message = 'Public page link copied.');
  }

  Future<void> _openPublicPage() async {
    final url = _publicPageUrl;
    if (url == null || !await launchUrl(url, webOnlyWindowName: '_blank')) {
      if (mounted) {
        setState(
          () => _message =
              "We couldn't open the public page. Copy the link and try again.",
        );
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _pageId = widget.pageId;
    if (_pageId != null) {
      _editing = true;
      _load();
    } else {
      _loadWorkspace();
    }
  }

  Future<void> _loadWorkspace({bool append = false}) async {
    if (append && (!_hasMorePages || _loadingMore)) return;
    setState(() {
      if (append) {
        _loadingMore = true;
      } else {
        _busy = true;
      }
    });
    try {
      final result = await _service.list(cursor: append ? _nextCursor : null);
      final incoming = (result['pages'] as List? ?? [])
          .map((page) => Map<String, dynamic>.from(page as Map))
          .toList();
      if (append) {
        final byId = <String, Map<String, dynamic>>{
          for (final page in _pages) page['pageId'].toString(): page,
        };
        for (final page in incoming) {
          byId[page['pageId'].toString()] = page;
        }
        _pages = byId.values.toList();
      } else {
        _pages = incoming;
      }
      _hasMorePages = result['hasMore'] == true;
      _nextCursor = result['nextCursor']?.toString();
    } catch (_) {
      _message =
          "We couldn't check for saved drafts. You can still start a page.";
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _loadingMore = false;
        });
      }
    }
  }

  String _newCreationRequestId() {
    final bytes = List<int>.generate(24, (_) => Random.secure().nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  void _resetNewDraft() {
    _headline.text = 'A clear solution for your next project';
    _support.text =
        'Tell us what you need. We’ll follow up with a clear next step.';
    _points.text = 'Straightforward service\nA clear next step';
    _style = 'clean';
    _cta = 'request_estimate';
    _tracking = false;
    _pageId = null;
    _slug = null;
    _message = null;
    _inquiryCount = null;
    _recentInquiries = const [];
    _isPublished = false;
    _hasUnpublishedChanges = false;
    _creationRequestId = _newCreationRequestId();
    _rememberSavedState();
    _editing = true;
  }

  Future<void> _startNew() async {
    if (!await _confirmLeaveWithUnsavedChanges() || !mounted) return;
    setState(_resetNewDraft);
  }

  Future<void> _openPage(String pageId) async {
    if (!await _confirmLeaveWithUnsavedChanges() || !mounted) return;
    AppNavigation.replace(
      context,
      '${AppRoutes.businessLandingPages}?pageId=${Uri.encodeQueryComponent(pageId)}',
    );
  }

  Future<void> _showWorkspace() async {
    if (!await _confirmLeaveWithUnsavedChanges() || !mounted) return;
    if (widget.pageId != null) {
      AppNavigation.replace(context, AppRoutes.businessLandingPages);
      return;
    }
    setState(() {
      _editing = false;
      _pageId = null;
      _creationRequestId = null;
      _message = null;
    });
    await _loadWorkspace();
  }

  Future<void> _handleBack() async {
    if (_editing) {
      await _showWorkspace();
      return;
    }
    if (!mounted) return;
    await BusinessBackButton.navigate(context);
  }

  Map<String, dynamic> get _content => {
    'headline': _headline.text,
    'supportingText': _support.text,
    'valuePoints': _points.text
        .split('\n')
        .where((e) => e.trim().isNotEmpty)
        .toList(),
    'style': _style,
    'ctaType': _cta,
    'ctaLabel': _cta == 'get_quote' ? 'Get a quote' : 'Request an estimate',
    'contactFields': ['name', 'email', 'phone', 'message'],
  };
  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final r = await _service.load(_pageId!);
      final p = Map<String, dynamic>.from(r['page'] as Map);
      final versions = (r['versions'] as List).cast<Map>();
      final id = p['draftVersionId'];
      final v = versions.cast<Map<String, dynamic>>().firstWhere(
        (x) => x['versionId'] == id,
      );
      final c = Map<String, dynamic>.from(v['content'] as Map);
      _headline.text = c['headline'] ?? '';
      _support.text = c['supportingText'] ?? '';
      _points.text = (c['valuePoints'] as List? ?? []).join('\n');
      _style = c['style'] ?? 'clean';
      _cta = c['ctaType'] ?? 'request_estimate';
      _tracking = p['trackingMode'] == 'first_party';
      _rememberSavedState();
      _slug = p['publicSlug']?.toString();
      _isPublished = p['status'] == 'published';
      _hasUnpublishedChanges =
          _isPublished && p['draftVersionId'] != p['publishedVersionId'];
      final inquiry = Map<String, dynamic>.from(
        r['inquirySummary'] as Map? ?? const {},
      );
      _inquiryCount = (inquiry['count'] as num?)?.toInt();
      _recentInquiries = (inquiry['recent'] as List? ?? [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
    } catch (_) {
      _message = "We couldn't load this draft. Try again.";
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _save() async {
    setState(() => _busy = true);
    try {
      if (_pageId == null) {
        _creationRequestId ??= _newCreationRequestId();
        final r = await _service.create(
          content: _content,
          tracking: _tracking,
          creationRequestId: _creationRequestId!,
        );
        _pageId = r['pageId'];
        _slug = r['publicSlug'];
      } else {
        await _service.save(_pageId!, _content, tracking: _tracking);
      }
      _rememberSavedState();
      _hasUnpublishedChanges = _isPublished;
      setState(() => _message = 'Draft saved. You can return to it later.');
      return true;
    } catch (_) {
      setState(
        () =>
            _message = "We couldn't save your draft. Your text is still here.",
      );
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _publish() async {
    if (!await _save() || _pageId == null) return;
    setState(() => _busy = true);
    try {
      final r = await _service.transition(_pageId!, 'publish');
      _slug = r['publicSlug'];
      _isPublished = true;
      _hasUnpublishedChanges = false;
      setState(() => _message = 'Published. Your page is ready to share.');
    } catch (_) {
      setState(
        () => _message =
            "We couldn't publish yet. Review the page and try again.",
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _headline.dispose();
    _support.dispose();
    _points.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) {
        _handleBack();
      }
    },
    child: Scaffold(
      appBar: AppBar(
        leading: BusinessBackButton(onPressed: _handleBack),
        title: const Text('Landing Page — Beta'),
      ),
      body: _busy && _pageId != null
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (!_editing) ...[
                    Text(
                      'Your Landing Pages',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Open an existing page or start a separate customer funnel.',
                    ),
                    const SizedBox(height: 14),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.icon(
                        key: const Key('new-landing-page-button'),
                        onPressed: _busy ? null : _startNew,
                        icon: const Icon(Icons.add),
                        label: const Text('New Landing Page'),
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (_message != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(_message!),
                        ),
                      ),
                    if (_busy)
                      const Center(child: CircularProgressIndicator())
                    else if (_pages.isEmpty)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            children: [
                              const Icon(Icons.web_outlined, size: 44),
                              const SizedBox(height: 12),
                              Text(
                                'Create your first Landing Page',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Build a simple page that gives prospective customers a clear next step.',
                              ),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: _startNew,
                                child: const Text(
                                  'Create your first Landing Page',
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    else
                      ..._pages.map(
                        (page) => _LandingPageSummaryCard(
                          page: page,
                          onOpen: () => _openPage(page['pageId'].toString()),
                        ),
                      ),
                    if (_hasMorePages)
                      Center(
                        child: OutlinedButton(
                          key: const Key('load-more-landing-pages-button'),
                          onPressed: _loadingMore
                              ? null
                              : () => _loadWorkspace(append: true),
                          child: Text(_loadingMore ? 'Loading…' : 'Load More'),
                        ),
                      ),
                  ] else ...[
                    Wrap(
                      spacing: 10,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: _busy ? null : _showWorkspace,
                          icon: const Icon(Icons.list_alt),
                          label: const Text('All Landing Pages'),
                        ),
                        FilledButton.icon(
                          key: const Key('new-landing-page-from-editor-button'),
                          onPressed: _busy ? null : _startNew,
                          icon: const Icon(Icons.add),
                          label: const Text('New Landing Page'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Create a page that turns interest into an inquiry',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'No design experience, logo, or photos required.',
                    ),
                    if (_pageId != null) ...[
                      const SizedBox(height: 12),
                      if (_isPublished)
                        Card(
                          child: ListTile(
                            leading: const Icon(Icons.public),
                            title: const Text('Published'),
                            subtitle: Text(
                              _hasUnpublishedChanges
                                  ? 'Your current public page remains live while you prepare changes.'
                                  : 'Your current page is live at the public link below.',
                            ),
                          ),
                        ),
                      if (_hasUnpublishedChanges)
                        const Card(
                          child: ListTile(
                            leading: Icon(Icons.info_outline),
                            title: Text('Unpublished changes'),
                            subtitle: Text(
                              'Your public page still shows the previous published version until you publish again.',
                            ),
                          ),
                        ),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _inquiryCount == null
                                    ? 'Inquiry count unavailable'
                                    : '$_inquiryCount customer ${_inquiryCount == 1 ? 'inquiry' : 'inquiries'}',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              if (!_tracking && (_inquiryCount ?? 0) > 0)
                                const Padding(
                                  padding: EdgeInsets.only(top: 4, bottom: 8),
                                  child: Text(
                                    'Response analytics are off, so visit and source attribution are unavailable.',
                                  ),
                                ),
                              if (_recentInquiries.isEmpty)
                                const Text(
                                  'New form responses will appear here.',
                                )
                              else
                                ..._recentInquiries.map(
                                  (item) => ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: const Icon(Icons.person_outline),
                                    title: Text(
                                      item['contactName']?.toString() ??
                                          'New inquiry',
                                    ),
                                    subtitle: Text(
                                      [
                                            if ((item['requestSummary']
                                                        ?.toString() ??
                                                    '')
                                                .isNotEmpty)
                                              item['requestSummary'].toString(),
                                            [
                                                  item['contactEmail'],
                                                  item['contactPhone'],
                                                ]
                                                .where(
                                                  (value) =>
                                                      (value?.toString() ?? '')
                                                          .isNotEmpty,
                                                )
                                                .join(' • '),
                                            '${item['source'] ?? 'Landing page'} • ${item['status'] ?? 'prospect'}',
                                            _receivedAt(item['createdAt']),
                                          ]
                                          .where((value) => value.isNotEmpty)
                                          .join('\n'),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    TextField(
                      controller: _headline,
                      maxLength: 100,
                      decoration: const InputDecoration(labelText: 'Headline'),
                    ),
                    TextField(
                      controller: _support,
                      maxLength: 320,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Supporting text',
                      ),
                    ),
                    TextField(
                      controller: _points,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Services / value points',
                        helperText: 'One per line',
                      ),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: _cta,
                      decoration: const InputDecoration(
                        labelText: 'Primary action',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'request_estimate',
                          child: Text('Request an estimate'),
                        ),
                        DropdownMenuItem(
                          value: 'get_quote',
                          child: Text('Get a quote'),
                        ),
                      ],
                      onChanged: (v) => setState(() => _cta = v!),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: _style,
                      decoration: const InputDecoration(labelText: 'Style'),
                      items: const [
                        DropdownMenuItem(
                          value: 'clean',
                          child: Text('Clean & Professional'),
                        ),
                        DropdownMenuItem(value: 'bold', child: Text('Bold')),
                        DropdownMenuItem(
                          value: 'friendly',
                          child: Text('Friendly'),
                        ),
                        DropdownMenuItem(
                          value: 'premium',
                          child: Text('Premium'),
                        ),
                      ],
                      onChanged: (v) => setState(() => _style = v!),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Response analytics'),
                      subtitle: Text(
                        _tracking
                            ? 'On — visits and inquiries can be measured.'
                            : 'Off — no visit analytics will be shown.',
                      ),
                      value: _tracking,
                      onChanged: (v) => setState(() => _tracking = v),
                    ),
                    const Divider(height: 32),
                    SegmentedButton<bool>(
                      segments: const [
                        ButtonSegment(
                          value: true,
                          label: Text('Mobile'),
                          icon: Icon(Icons.phone_iphone),
                        ),
                        ButtonSegment(
                          value: false,
                          label: Text('Desktop'),
                          icon: Icon(Icons.desktop_windows),
                        ),
                      ],
                      selected: {_mobile},
                      onSelectionChanged: (v) =>
                          setState(() => _mobile = v.first),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: _mobile ? 390 : 1120,
                        ),
                        child: _LandingPreview(content: _content),
                      ),
                    ),
                    if (_message != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(_message!),
                        ),
                      ),
                    if (_publicPageUrl != null)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Public page',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              const SizedBox(height: 6),
                              SelectableText(_publicPageUrl.toString()),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 10,
                                runSpacing: 8,
                                children: [
                                  OutlinedButton.icon(
                                    onPressed: _copyPublicPageUrl,
                                    icon: const Icon(Icons.copy),
                                    label: const Text('Copy exact link'),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed: _openPublicPage,
                                    icon: const Icon(Icons.open_in_new),
                                    label: const Text('Open public page'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: _busy ? null : _save,
                          child: const Text('Save draft'),
                        ),
                        FilledButton(
                          onPressed: _busy ? null : _publish,
                          child: const Text('Publish page'),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
    ),
  );
}

class _LandingPageSummaryCard extends StatelessWidget {
  const _LandingPageSummaryCard({required this.page, required this.onOpen});

  final Map<String, dynamic> page;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final status = page['status']?.toString() ?? 'draft';
    final inquiryCount = (page['inquiryCount'] as num?)?.toInt();
    final tracking = page['trackingMode'] == 'first_party';
    final unpublished = page['hasUnpublishedChanges'] == true;
    final statusLabel = switch (status) {
      'published' when unpublished => 'Published + unpublished changes',
      'published' => 'Published',
      'paused' => 'Paused',
      'archived' => 'Archived',
      _ => 'Draft',
    };
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.web_outlined, size: 32),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    page['title']?.toString() ?? 'Untitled Landing Page',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$statusLabel • Tracking ${tracking ? 'On' : 'Off'} • '
                    '${inquiryCount == null ? 'Inquiry count unavailable' : '$inquiryCount ${inquiryCount == 1 ? 'inquiry' : 'inquiries'}'}',
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            OutlinedButton(onPressed: onOpen, child: const Text('Open')),
          ],
        ),
      ),
    );
  }
}

class _LandingPreview extends StatelessWidget {
  const _LandingPreview({required this.content});
  final Map<String, dynamic> content;

  _LandingPreviewStyle get _previewStyle => switch (content['style']) {
    'bold' => const _LandingPreviewStyle(
      ink: Color(0xFF171923),
      muted: Color(0xFF4F5260),
      accent: Color(0xFFEA4B23),
      soft: Color(0xFFFFF0E9),
      hero: Color(0xFFFFF4DF),
      radius: 10,
    ),
    'friendly' => const _LandingPreviewStyle(
      ink: Color(0xFF173B35),
      muted: Color(0xFF53716C),
      accent: Color(0xFF087F6C),
      soft: Color(0xFFE8F7F1),
      hero: Color(0xFFFFF5DF),
      radius: 30,
    ),
    'premium' => const _LandingPreviewStyle(
      ink: Color(0xFF211D31),
      muted: Color(0xFF665E77),
      accent: Color(0xFF7858B5),
      soft: Color(0xFFF3EEF9),
      hero: Color(0xFFF8F4EE),
      radius: 4,
    ),
    _ => const _LandingPreviewStyle(
      ink: Color(0xFF10243E),
      muted: Color(0xFF526579),
      accent: Color(0xFF176FD1),
      soft: Color(0xFFEDF5FC),
      hero: Color(0xFFE9F4FF),
      radius: 22,
    ),
  };

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final style = _previewStyle;
      final compact = constraints.maxWidth < 720;
      final points = (content['valuePoints'] as List)
          .map((value) => value.toString())
          .toList();
      return Semantics(
        label: 'Landing page preview',
        child: ClipRRect(
          borderRadius: BorderRadius.circular(style.radius),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFD7E2EC)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _PreviewHero(content: content, style: style, compact: compact),
                _PreviewValueSection(
                  points: points,
                  ctaLabel: content['ctaLabel'].toString(),
                  style: style,
                  compact: compact,
                ),
                _PreviewProcess(style: style, compact: compact),
                _PreviewFaq(style: style, compact: compact),
                _PreviewConversion(
                  ctaLabel: content['ctaLabel'].toString(),
                  style: style,
                  compact: compact,
                ),
                Container(
                  color: style.ink,
                  padding: const EdgeInsets.all(16),
                  child: const Text(
                    'Powered by ScaledCircle · A direct request to this Business',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFFC7D2DE), fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _LandingPreviewStyle {
  const _LandingPreviewStyle({
    required this.ink,
    required this.muted,
    required this.accent,
    required this.soft,
    required this.hero,
    required this.radius,
  });
  final Color ink;
  final Color muted;
  final Color accent;
  final Color soft;
  final Color hero;
  final double radius;
}

class _PreviewHero extends StatelessWidget {
  const _PreviewHero({
    required this.content,
    required this.style,
    required this.compact,
  });
  final Map<String, dynamic> content;
  final _LandingPreviewStyle style;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Eyebrow('LOCAL SERVICE, CLEAR NEXT STEP', color: style.accent),
        const SizedBox(height: 12),
        Text(
          content['headline'].toString(),
          style: TextStyle(
            color: style.ink,
            fontSize: compact ? 34 : 52,
            height: 1.02,
            fontWeight: FontWeight.w900,
            letterSpacing: -1.4,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          content['supportingText'].toString(),
          style: TextStyle(color: style.muted, fontSize: compact ? 16 : 18),
        ),
        const SizedBox(height: 22),
        _PreviewCta(content['ctaLabel'].toString(), style: style),
        const SizedBox(height: 12),
        Text(
          'Share a few details. No obligation is created by sending a request.',
          style: TextStyle(color: style.muted, fontSize: 12),
        ),
      ],
    );
    final expectation = Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .86),
        borderRadius: BorderRadius.circular(style.radius),
        border: Border.all(color: style.accent.withValues(alpha: .25)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x18000000),
            blurRadius: 28,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'A straightforward way to get started',
            style: TextStyle(
              color: style.ink,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          for (final item in const [
            'Describe the service you’re looking for',
            'Choose email or phone for a reply',
            'Continue directly with the Business',
          ])
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_circle, size: 18, color: style.accent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(item, style: TextStyle(color: style.muted)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
    return Container(
      color: style.hero,
      padding: EdgeInsets.all(compact ? 24 : 54),
      child: compact
          ? copy
          : Row(
              children: [
                Expanded(flex: 3, child: copy),
                const SizedBox(width: 48),
                Expanded(flex: 2, child: expectation),
              ],
            ),
    );
  }
}

class _PreviewValueSection extends StatelessWidget {
  const _PreviewValueSection({
    required this.points,
    required this.ctaLabel,
    required this.style,
    required this.compact,
  });
  final List<String> points;
  final String ctaLabel;
  final _LandingPreviewStyle style;
  final bool compact;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.all(compact ? 24 : 52),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Eyebrow('HOW WE CAN HELP', color: style.accent),
        const SizedBox(height: 10),
        Text(
          'Start with what matters to your project',
          style: TextStyle(
            color: style.ink,
            fontSize: compact ? 26 : 34,
            height: 1.1,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 14,
          runSpacing: 14,
          children: [
            for (var index = 0; index < points.length; index++)
              SizedBox(
                width: compact ? double.infinity : 290,
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(style.radius),
                    border: Border.all(color: const Color(0xFFD7E2EC)),
                    boxShadow: const [
                      BoxShadow(color: Color(0x10000000), blurRadius: 20),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: style.soft,
                        foregroundColor: style.accent,
                        child: Text('${index + 1}'),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        points[index],
                        style: TextStyle(
                          color: style.ink,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 26),
        _PreviewCta(ctaLabel, style: style),
      ],
    ),
  );
}

class _PreviewProcess extends StatelessWidget {
  const _PreviewProcess({required this.style, required this.compact});
  final _LandingPreviewStyle style;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final steps = [
      (
        'Tell us what you need',
        'Send the details that help start the conversation.',
      ),
      (
        'We review your request',
        'The Business receives your inquiry and page context.',
      ),
      (
        'Plan the next step',
        'Continue directly with the Business based on your needs.',
      ),
    ];
    return Container(
      color: style.soft,
      padding: EdgeInsets.all(compact ? 24 : 52),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Eyebrow('A SIMPLE NEXT STEP', color: style.accent),
          const SizedBox(height: 10),
          Text(
            'From request to a useful conversation',
            style: TextStyle(
              color: style.ink,
              fontSize: compact ? 26 : 34,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 24),
          for (var index = 0; index < steps.length; index++)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: style.accent,
                    foregroundColor: Colors.white,
                    child: Text('${index + 1}'),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          steps[index].$1,
                          style: TextStyle(
                            color: style.ink,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          steps[index].$2,
                          style: TextStyle(color: style.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PreviewFaq extends StatelessWidget {
  const _PreviewFaq({required this.style, required this.compact});
  final _LandingPreviewStyle style;
  final bool compact;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.all(compact ? 24 : 52),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Eyebrow('GOOD TO KNOW', color: style.accent),
        const SizedBox(height: 10),
        Text(
          'Before you reach out',
          style: TextStyle(
            color: style.ink,
            fontSize: compact ? 26 : 34,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'Your request goes directly to this Business so they can review it and contact you.',
          style: TextStyle(color: style.muted),
        ),
      ],
    ),
  );
}

class _PreviewConversion extends StatelessWidget {
  const _PreviewConversion({
    required this.ctaLabel,
    required this.style,
    required this.compact,
  });
  final String ctaLabel;
  final _LandingPreviewStyle style;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Eyebrow('READY WHEN YOU ARE', color: style.accent),
        const SizedBox(height: 10),
        const Text(
          'Let’s talk about your project',
          style: TextStyle(
            color: Colors.white,
            fontSize: 30,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Tell the Business what you need and how you prefer to be contacted.',
          style: TextStyle(color: Color(0xFFD4DDE7)),
        ),
      ],
    );
    final form = Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(style.radius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final label in const [
            'Name',
            'Email or phone',
            'How can we help?',
          ]) ...[
            Text(
              label,
              style: TextStyle(color: style.ink, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Container(
              height: label == 'How can we help?' ? 62 : 42,
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF9CAFBF)),
                borderRadius: BorderRadius.circular(style.radius / 2),
              ),
            ),
            const SizedBox(height: 12),
          ],
          _PreviewCta(ctaLabel, style: style, expand: true),
          const SizedBox(height: 10),
          Text(
            'Your details go to this Business. Submitting does not create a purchase. Privacy Policy',
            style: TextStyle(color: style.muted, fontSize: 11),
          ),
        ],
      ),
    );
    return Container(
      color: style.ink,
      padding: EdgeInsets.all(compact ? 24 : 52),
      child: compact
          ? Column(children: [copy, const SizedBox(height: 28), form])
          : Row(
              children: [
                Expanded(child: copy),
                const SizedBox(width: 48),
                Expanded(child: form),
              ],
            ),
    );
  }
}

class _PreviewCta extends StatelessWidget {
  const _PreviewCta(this.label, {required this.style, this.expand = false});
  final String label;
  final _LandingPreviewStyle style;
  final bool expand;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: expand ? double.infinity : null,
    child: FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: style.accent,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(style.radius / 2),
        ),
      ),
      onPressed: () {},
      child: Text(label),
    ),
  );
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.text, {required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      color: color,
      fontSize: 11,
      fontWeight: FontWeight.w900,
      letterSpacing: 1.4,
    ),
  );
}
