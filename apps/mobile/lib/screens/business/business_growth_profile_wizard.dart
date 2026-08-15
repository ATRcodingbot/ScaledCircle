import 'package:flutter/material.dart';

import '../../services/managed_growth_service.dart';
import '../preferences/areas_preferences_screen.dart';

class BusinessGrowthProfileWizard extends StatefulWidget {
  const BusinessGrowthProfileWizard({super.key, this.initialProfile});
  final Map<String, dynamic>? initialProfile;

  @override
  State<BusinessGrowthProfileWizard> createState() =>
      _BusinessGrowthProfileWizardState();
}

class _BusinessGrowthProfileWizardState
    extends State<BusinessGrowthProfileWizard> {
  final _pageController = PageController();
  final _businessName = TextEditingController();
  final _business = TextEditingController();
  final _website = TextEditingController();
  final _areas = TextEditingController();
  final _proudOf = TextEditingController();
  final _destination = TextEditingController();
  final _neverSay = TextEditingController();
  final _questions = TextEditingController();
  final _offers = TextEditingController();
  final _jobsNotWanted = TextEditingController();
  int _step = 0;
  final Set<String> _services = {};
  final Set<String> _priorities = {};
  final Set<String> _tones = {};
  String _action = 'Request an estimate';
  final Set<String> _social = {};
  String _adBudget = r'$0 — Organic only';
  final Set<String> _emailAudiences = {};
  Map<String, dynamic>? _websiteSuggestion;
  bool _checkingWebsite = false;

  static const _toneOptions = <String, String>{
    'Professional': 'Clean and trustworthy',
    'Friendly': 'Neighbor-to-neighbor',
    'Straightforward': 'Get to the point',
    'Premium': 'Higher-end and polished',
    'Educational': 'Helpful and informative',
    'Let AI choose': 'Use the situation and saved facts',
  };

  @override
  void initState() {
    super.initState();
    final data = widget.initialProfile ?? const <String, dynamic>{};
    _businessName.text = data['businessName']?.toString() ?? '';
    _business.text = data['businessDescription']?.toString() ?? '';
    _website.text = data['website']?.toString() ?? '';
    _areas.text = (data['serviceAreas'] as List? ?? const []).join(', ');
    _proudOf.text = (data['differentiators'] as List? ?? const []).join('\n');
    _neverSay.text = (data['claimsToAvoid'] as List? ?? const []).join('\n');
    _questions.text = (data['contentThemes'] as List? ?? const []).join('\n');
    _services.addAll(
      (data['servicesOffered'] as List? ?? const []).map((v) => v.toString()),
    );
    _priorities.addAll(
      (data['priorityServices'] as List? ?? const []).map((v) => v.toString()),
    );
    _tones.addAll(
      (data['brandVoice']?.toString() ?? '')
          .split(', ')
          .where((v) => v.isNotEmpty),
    );
    _action = data['primaryCta']?.toString().isNotEmpty == true
        ? data['primaryCta'].toString()
        : _action;
    _social.addAll(
      (data['socialUrls'] as List? ?? const []).map((v) => v.toString()),
    );
    _emailAudiences.addAll(
      (data['emailAudience'] as List? ?? const []).map((v) => v.toString()),
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    for (final controller in [
      _businessName,
      _business,
      _website,
      _areas,
      _proudOf,
      _destination,
      _neverSay,
      _questions,
      _offers,
      _jobsNotWanted,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  List<String> _lines(String value) => value
      .split(RegExp(r'[,\n]'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList(growable: false);

  void _suggestServices() {
    final words = _business.text
        .split(RegExp(r',|\band\b|\bplus\b', caseSensitive: false))
        .map(
          (item) => item.trim().replaceFirst(
            RegExp(r'^(we|i)\s+', caseSensitive: false),
            '',
          ),
        )
        .where((item) => item.length >= 3)
        .take(8);
    setState(() {
      _services.addAll(words);
      _priorities.removeWhere((item) => !_services.contains(item));
    });
  }

  Future<void> _suggestFromWebsite() async {
    if (_website.text.trim().isEmpty) return;
    setState(() => _checkingWebsite = true);
    try {
      final suggestion = await ManagedGrowthService().suggestFromWebsite(
        _website.text,
      );
      if (mounted) setState(() => _websiteSuggestion = suggestion);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              "We couldn't read that website. You can continue without it.",
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _checkingWebsite = false);
    }
  }

  void _acceptWebsiteSuggestion() {
    final suggestion = _websiteSuggestion;
    if (suggestion == null) return;
    setState(() {
      _services.addAll(
        (suggestion['services'] as List? ?? const []).map((v) => v.toString()),
      );
      if (_areas.text.trim().isEmpty) {
        _areas.text = (suggestion['serviceAreas'] as List? ?? const []).join(
          ', ',
        );
      }
      if (_destination.text.trim().isEmpty) {
        _destination.text = suggestion['phone']?.toString() ?? '';
      }
      _websiteSuggestion = null;
    });
  }

  void _go(int step) {
    setState(() => _step = step.clamp(0, 8));
    _pageController.animateToPage(
      _step,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  Map<String, dynamic> _payload() => {
    'businessName': _businessName.text.trim(),
    'businessDescription': _business.text.trim(),
    'website': _website.text.trim(),
    'primaryPhone': _action == 'Call us'
        ? _destination.text.trim()
        : widget.initialProfile?['primaryPhone']?.toString() ?? '',
    'primaryCta': _action,
    'serviceAreas': _lines(_areas.text),
    'servicesOffered': _services.toList(),
    'priorityServices': _priorities.toList(),
    'servicesNotOffered': _lines(_jobsNotWanted.text),
    'targetCustomers': widget.initialProfile?['targetCustomers'] ?? <String>[],
    'differentiators': _lines(_proudOf.text),
    'valueProposition': _offers.text.trim(),
    'brandVoice': _tones.join(', '),
    'claimsToAvoid': _lines(_neverSay.text),
    'localKeywords': _lines(_areas.text),
    'socialUrls': _social.toList(),
    'seoTargets': [..._priorities, ..._lines(_areas.text)],
    'emailAudience': _emailAudiences.toList(),
    'preferredEmailFrequency':
        widget.initialProfile?['preferredEmailFrequency']?.toString() ?? '',
    'plannedAdBudget': _adBudget,
    'preferredChannels': _social.toList(),
    'channelsToAvoid': widget.initialProfile?['channelsToAvoid'] ?? <String>[],
    'directMailOffer': _offers.text.trim(),
    'directMailCta': _action,
    'contentThemes': _lines(_questions.text),
    'postingFrequency':
        widget.initialProfile?['postingFrequency']?.toString() ?? '',
  };

  Widget _question(String title, String helper, Widget child) => Semantics(
    namesRoute: true,
    label: title,
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(helper),
        const SizedBox(height: 22),
        child,
      ],
    ),
  );

  Widget _chips(Iterable<String> values, Set<String> selected) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: values
        .map(
          (value) => FilterChip(
            label: Text(value),
            selected: selected.contains(value),
            onSelected: (on) => setState(
              () => on ? selected.add(value) : selected.remove(value),
            ),
          ),
        )
        .toList(),
  );

  Widget _summary() => _question(
    "Here's what ScaledCircle understands about your business.",
    "We'll remember this when creating your marketing.",
    Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _summaryLine('YOU DO', _services.join(', ')),
            _summaryLine(
              'YOU WANT MORE',
              _priorities.isEmpty ? 'Help me choose' : _priorities.join(', '),
            ),
            _summaryLine('YOU SERVE', _areas.text),
            _summaryLine(
              'YOUR STYLE',
              _tones.isEmpty ? 'Let AI choose' : _tones.join(' and '),
            ),
            _summaryLine('YOUR MAIN GOAL', _action),
          ],
        ),
      ),
    ),
  );

  Widget _summaryLine(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
        Text(value.trim().isEmpty ? 'Not provided yet' : value),
      ],
    ),
  );

  Widget _firstStep() => _question(
    'What does your business do?',
    "Tell us in your own words. We'll organize it for you.",
    Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _businessName,
          decoration: const InputDecoration(
            labelText: 'What should we call your business?',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('growth-business-description'),
          controller: _business,
          maxLines: 4,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'We build decks and fences and do some remodeling.',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _website,
          decoration: const InputDecoration(labelText: 'Website (optional)'),
        ),
        TextButton.icon(
          onPressed: _checkingWebsite ? null : _suggestFromWebsite,
          icon: const Icon(Icons.language),
          label: Text(
            _checkingWebsite ? 'Checking…' : 'Find information on my website',
          ),
        ),
        if (_websiteSuggestion != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'We found some information that may save you time.',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'Services: ${(_websiteSuggestion!['services'] as List? ?? const []).join(', ')}',
                  ),
                  Text(
                    'Service area: ${(_websiteSuggestion!['serviceAreas'] as List? ?? const []).join(', ')}',
                  ),
                  Text('Phone: ${_websiteSuggestion!['phone'] ?? 'Not found'}'),
                  Wrap(
                    children: [
                      FilledButton(
                        onPressed: _acceptWebsiteSuggestion,
                        child: const Text('Yes, use this'),
                      ),
                      TextButton(
                        onPressed: () =>
                            setState(() => _websiteSuggestion = null),
                        child: const Text('Let me change it'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    ),
  );

  Widget _optionalSetup() => ExpansionTile(
    title: const Text('Optional setup'),
    subtitle: const Text('Social, ads, and email — plain language'),
    children: [
      const Text('Where do you already post?'),
      _chips([
        'Facebook',
        'Instagram',
        'Google Business Profile',
        'LinkedIn',
        'Other',
        "I don't use social media yet",
      ], _social),
      DropdownButtonFormField<String>(
        initialValue: _adBudget,
        decoration: const InputDecoration(
          labelText: 'If you run ads, what monthly amount feels comfortable?',
        ),
        items:
            [
                  r'$0 — Organic only',
                  r'$250',
                  r'$500',
                  r'$1,000',
                  r'$2,500+',
                  'Not sure — help me decide',
                ]
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
        onChanged: (value) => setState(() => _adBudget = value ?? _adBudget),
      ),
      const Text('Who could you email today?'),
      _chips([
        'Current customers',
        'Past customers',
        'People who requested an estimate',
        'Other consented leads',
        "I don't have an email list yet",
      ], _emailAudiences),
      const ListTile(
        enabled: false,
        title: Text('Advanced Settings'),
        subtitle: Text(
          'Optional — normal setup does not require marketing terminology.',
        ),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Set Up Your Growth Profile')),
    body: Column(
      children: [
        LinearProgressIndicator(value: (_step + 1) / 9),
        Expanded(
          child: PageView(
            controller: _pageController,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              _firstStep(),
              _question(
                'Where do you want more customers?',
                'Add a city, county, ZIP, travel distance, or draw an area. You can save more than one area.',
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _areas,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'Anne Arundel County, 21401, within 20 miles',
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => AreasPreferencesScreen(
                              role: 'business',
                              initialServices: _services.toList(),
                              onSaved: (saved) {
                                final names =
                                    (saved['areas'] as List? ?? const [])
                                        .whereType<Map>()
                                        .map(
                                          (area) =>
                                              area['name']?.toString() ?? '',
                                        )
                                        .where((name) => name.isNotEmpty);
                                _areas.text = names.join(', ');
                                setState(
                                  () => _priorities.addAll(
                                    (saved['priorityServices'] as List? ??
                                            const [])
                                        .map((value) => value.toString()),
                                  ),
                                );
                              },
                            ),
                          ),
                        );
                      },
                      icon: const Icon(Icons.map_outlined),
                      label: const Text('Choose Areas on a Map or Add More'),
                    ),
                  ],
                ),
              ),
              _question(
                'Which jobs do you want more of right now?',
                'We suggested these from your own description. Confirm one, several, or let us help.',
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _chips(_services, _priorities),
                    TextButton(
                      onPressed: () => setState(_priorities.clear),
                      child: const Text("I'm not sure — help me choose"),
                    ),
                    TextField(
                      controller: _jobsNotWanted,
                      decoration: const InputDecoration(
                        labelText: "Any jobs you DON'T want? (optional)",
                      ),
                    ),
                  ],
                ),
              ),
              _question(
                'What makes customers choose you?',
                "Tell us anything you're proud of. Skip this if you're not sure. We will only use claims you provide.",
                TextField(
                  controller: _proudOf,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    hintText:
                        'Free estimates\nLicensed\nFamily-owned\nWarranty',
                  ),
                ),
              ),
              _question(
                'How should your business sound online?',
                'Choose one or combine a few. No marketing expertise needed.',
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: _toneOptions.entries
                      .map(
                        (entry) => CheckboxListTile(
                          value: _tones.contains(entry.key),
                          title: Text(entry.key),
                          subtitle: Text(entry.value),
                          onChanged: (on) => setState(
                            () => on == true
                                ? _tones.add(entry.key)
                                : _tones.remove(entry.key),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
              _question(
                'What should people do after seeing your marketing?',
                'Choose the next step you want customers to take.',
                Column(
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _action,
                      items:
                          [
                                'Call us',
                                'Request an estimate',
                                'Visit our website',
                                'Message us',
                                'Book an appointment',
                                'Other',
                              ]
                              .map(
                                (value) => DropdownMenuItem(
                                  value: value,
                                  child: Text(value),
                                ),
                              )
                              .toList(),
                      onChanged: (value) =>
                          setState(() => _action = value ?? _action),
                    ),
                    if (_action != 'Request an estimate')
                      TextField(
                        controller: _destination,
                        decoration: const InputDecoration(
                          labelText: 'Where should they go or contact you?',
                        ),
                      ),
                  ],
                ),
              ),
              _question(
                'Is there anything you NEVER want us to say?',
                'These are hard restrictions. Skip this if you have none.',
                TextField(
                  controller: _neverSay,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    hintText:
                        "Don't say we're the cheapest.\nDon't promise same-day service.",
                  ),
                ),
              ),
              _question(
                'What do customers ask you all the time?',
                "Use their natural questions. We'll turn them into useful content ideas.",
                Column(
                  children: [
                    TextField(
                      controller: _questions,
                      maxLines: 6,
                      decoration: const InputDecoration(
                        hintText:
                            'How much does a deck cost?\nWood or composite?\nDo I need a permit?',
                      ),
                    ),
                    TextField(
                      controller: _offers,
                      decoration: const InputDecoration(
                        labelText:
                            'Any offer you want people to know about? (optional)',
                      ),
                    ),
                    const SizedBox(height: 16),
                    _optionalSetup(),
                  ],
                ),
              ),
              _summary(),
            ],
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                if (_step > 0)
                  TextButton(
                    onPressed: () => _go(_step - 1),
                    child: const Text('Back'),
                  ),
                const Spacer(),
                if (_step > 2 && _step < 8)
                  TextButton(
                    onPressed: () => _go(_step + 1),
                    child: const Text('Skip for Now'),
                  ),
                FilledButton(
                  onPressed: () {
                    if (_step == 0) _suggestServices();
                    if (_step < 8) {
                      _go(_step + 1);
                    } else {
                      Navigator.pop(context, _payload());
                    }
                  },
                  child: Text(_step == 8 ? 'Looks Good' : 'Continue'),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
