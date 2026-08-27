import 'package:flutter/material.dart';
import '../../services/landing_page_service.dart';

class LandingPageBuilderScreen extends StatefulWidget {
  const LandingPageBuilderScreen({super.key, this.pageId, this.service});
  final String? pageId;
  final LandingPageService? service;
  @override
  State<LandingPageBuilderScreen> createState() =>
      _LandingPageBuilderScreenState();
}

class _LandingPageBuilderScreenState extends State<LandingPageBuilderScreen> {
  late final LandingPageService _service =
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
  int _inquiryCount = 0;
  List<Map<String, dynamic>> _recentInquiries = const [];
  @override
  void initState() {
    super.initState();
    _pageId = widget.pageId;
    if (_pageId != null) {
      _load();
    } else {
      _loadLatest();
    }
  }

  Future<void> _loadLatest() async {
    setState(() => _busy = true);
    try {
      final result = await _service.list();
      final pages = (result['pages'] as List? ?? []).cast<Map>();
      if (pages.isNotEmpty) {
        _pageId = pages.first['pageId']?.toString();
        if (_pageId != null) return _load();
      }
    } catch (_) {
      _message =
          "We couldn't check for saved drafts. You can still start a page.";
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
      _slug = p['publicSlug']?.toString();
      final inquiry = Map<String, dynamic>.from(
        r['inquirySummary'] as Map? ?? const {},
      );
      _inquiryCount = (inquiry['count'] as num?)?.toInt() ?? 0;
      _recentInquiries = (inquiry['recent'] as List? ?? [])
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();
    } catch (_) {
      _message = "We couldn't load this draft. Try again.";
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      if (_pageId == null) {
        final r = await _service.create(content: _content, tracking: _tracking);
        _pageId = r['pageId'];
        _slug = r['publicSlug'];
      } else {
        await _service.save(_pageId!, _content, tracking: _tracking);
      }
      setState(() => _message = 'Draft saved. You can return to it later.');
    } catch (_) {
      setState(
        () =>
            _message = "We couldn't save your draft. Your text is still here.",
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _publish() async {
    await _save();
    if (_pageId == null) return;
    setState(() => _busy = true);
    try {
      final r = await _service.transition(_pageId!, 'publish');
      _slug = r['publicSlug'];
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
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Landing Page — Beta')),
    body: _busy && _pageId != null
        ? const Center(child: CircularProgressIndicator())
        : SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  'Create a page that turns interest into an inquiry',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text('No design experience, logo, or photos required.'),
                if (_pageId != null) ...[
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$_inquiryCount customer ${_inquiryCount == 1 ? 'inquiry' : 'inquiries'}',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          if (_recentInquiries.isEmpty)
                            const Text('New form responses will appear here.')
                          else
                            ..._recentInquiries.map(
                              (item) => Text(
                                '• ${item['contactName']}: ${item['requestSummary']}',
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
                    DropdownMenuItem(value: 'premium', child: Text('Premium')),
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
                  onSelectionChanged: (v) => setState(() => _mobile = v.first),
                ),
                const SizedBox(height: 12),
                Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: _mobile ? 390 : 760),
                    child: _LandingPreview(content: _content),
                  ),
                ),
                if (_message != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Semantics(liveRegion: true, child: Text(_message!)),
                  ),
                if (_slug != null) SelectableText('Public page: /p/$_slug'),
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
            ),
          ),
  );
}

class _LandingPreview extends StatelessWidget {
  const _LandingPreview({required this.content});
  final Map<String, dynamic> content;
  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            content['headline'],
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(content['supportingText']),
          const SizedBox(height: 18),
          FilledButton(onPressed: () {}, child: Text(content['ctaLabel'])),
          const SizedBox(height: 24),
          Text(
            'How we can help',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          ...(content['valuePoints'] as List).map(
            (p) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle_outline),
              title: Text(p.toString()),
            ),
          ),
          const Divider(),
          Text(
            'Let’s talk about your project',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const Text('Name · Email or phone · Short request'),
        ],
      ),
    ),
  );
}
