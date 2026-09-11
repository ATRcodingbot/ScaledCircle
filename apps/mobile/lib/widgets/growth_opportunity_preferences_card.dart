import 'package:flutter/material.dart';

const growthOpportunityLabels = {
  'residential': 'Direct residential opportunities',
  'commercial': 'Commercial opportunities',
  'propertyManagement': 'Property managers / HOAs',
  'government': 'Public bids & government contracts',
  'vendorNetworks': 'Vendor / referral networks',
  'workforceCandidates': 'Individual workforce candidates',
  'recruitmentPartners': 'Recruitment partners',
  'paidLeadSources': 'Paid lead sources',
};

class GrowthOpportunityPreferencesCard extends StatefulWidget {
  const GrowthOpportunityPreferencesCard({
    super.key,
    required this.values,
    required this.onSave,
  });
  final Map<String, dynamic> values;
  final Future<void> Function(Map<String, bool>) onSave;
  @override
  State<GrowthOpportunityPreferencesCard> createState() =>
      _GrowthOpportunityPreferencesCardState();
}

class _GrowthOpportunityPreferencesCardState
    extends State<GrowthOpportunityPreferencesCard> {
  late final Map<String, bool> _values = {
    for (final key in growthOpportunityLabels.keys)
      key:
          widget.values[key] as bool? ??
          !['government', 'paidLeadSources'].contains(key),
  };
  bool _busy = false;
  String? _feedback;
  @override
  Widget build(BuildContext context) => Card(
    child: ExpansionTile(
      title: const Text('Growth Preferences'),
      subtitle: Text(
        'Current focus: ${growthOpportunityLabels.entries.where((e) => _values[e.key] == true).map((e) => e.value).join(', ')}',
      ),
      childrenPadding: const EdgeInsets.all(16),
      expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final entry in growthOpportunityLabels.entries)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(entry.value),
            subtitle: entry.key == 'government'
                ? const Text(
                    'Find public RFQs, RFPs and contracting opportunities. These may require vendor registration, insurance or other qualifications.',
                  )
                : entry.key == 'paidLeadSources'
                ? const Text(
                    'Listed separately. This never authorizes a purchase or subscription.',
                  )
                : entry.key == 'recruitmentPartners'
                ? const Text(
                    'Organizations and recruiting channels, separate from individual candidates.',
                  )
                : null,
            value: _values[entry.key]!,
            onChanged: _busy
                ? null
                : (value) => setState(() {
                    _values[entry.key] = value;
                    _feedback = null;
                  }),
          ),
        const Text(
          'Disabled categories stay out of active recommendations. Previously sourced evidence is preserved in history.',
        ),
        if (_feedback != null) Text(_feedback!, semanticsLabel: _feedback),
        FilledButton(
          onPressed: _busy
              ? null
              : () async {
                  setState(() {
                    _busy = true;
                    _feedback = null;
                  });
                  try {
                    await widget.onSave(Map.of(_values));
                    if (mounted) {
                      setState(() => _feedback = 'Growth Preferences saved.');
                    }
                  } catch (_) {
                    if (mounted) {
                      setState(
                        () => _feedback =
                            'Preferences could not be confirmed. Retry to save your focus.',
                      );
                    }
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
          child: Text(_busy ? 'Saving…' : 'Save Growth Preferences'),
        ),
      ],
    ),
  );
}
