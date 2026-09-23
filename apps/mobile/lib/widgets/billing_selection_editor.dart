import 'package:flutter/material.dart';

const billingPlanLabels = {
  'starter': 'Starter — \$99/month · 1 total seat',

  'growth': 'Growth — \$299/month · 3 total seats',

  'scale': 'Scale — \$499/month · 5 total seats',

  'managed_growth':
      'Managed Growth — \$999/month · 10 total seats · Coming Soon',
};

const billingAddOnLabels = {
  'business_assistant': 'Business Assistant — Coming Soon',

  'lead_generation_research': 'Lead Generation Research — Coming Soon',
};

/// Selection only; the server verifies provider prices and calculates billing.

class BillingSelectionEditor extends StatefulWidget {
  const BillingSelectionEditor({
    super.key,

    required this.onChanged,

    this.initial = const {'plan': 'starter'},

    this.enabled = true,
  });

  final Map<String, dynamic> initial;

  final ValueChanged<Map<String, dynamic>> onChanged;

  final bool enabled;

  @override
  State<BillingSelectionEditor> createState() => _BillingSelectionEditorState();
}

class _BillingSelectionEditorState extends State<BillingSelectionEditor> {
  late String _plan = widget.initial['plan']?.toString() ?? 'starter';

  late final bool _bundle = widget.initial['bundle'] == 'growth_department';

  late final Set<String> _addons = (widget.initial['addons'] as List? ?? [])
      .cast<String>()
      .toSet();

  void _emit() => widget.onChanged(
    _bundle
        ? {'bundle': 'growth_department'}
        : {'plan': _plan, 'addons': _addons.toList()..sort()},
  );

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,

    children: [
      const Text(
        'Choose your plan',

        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      ),

      const SizedBox(height: 12),

      DropdownButtonFormField<String>(
        key: ValueKey(_plan),

        initialValue: _plan,

        isExpanded: true,

        decoration: const InputDecoration(labelText: 'Workspace plan'),

        items: [
          for (final item in billingPlanLabels.entries)
            DropdownMenuItem(
              value: item.key,

              enabled:
                  item.key != 'managed_growth' ||
                  widget.initial['plan'] == 'managed_growth',

              child: Text(item.value, overflow: TextOverflow.ellipsis),
            ),
        ],

        onChanged: !widget.enabled || _bundle
            ? null
            : (value) {
                if (value != null) {
                  setState(() => _plan = value);

                  _emit();
                }
              },
      ),

      const Text(
        'The owner counts toward the seat limit. Starter, Growth and Scale provide Core Business OS access. Managed Social, Business Email, Email Campaigns, Lead Generation and Business Assistant are not included. New premium purchases are Coming Soon; existing access is unchanged.',
      ),

      const SizedBox(height: 24),

      const Text(
        'Coming Soon for new purchases',

        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      ),

      for (final item in billingAddOnLabels.entries)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,

          title: Text(item.value),

          subtitle: Text(
            item.key == 'business_assistant'
                ? 'Business information, recommendations and next steps. Actions need approval.'
                : 'AI-assisted lead generation with Business-reviewed outreach. You review outbound communication before it is sent.',
          ),

          value: _bundle || _addons.contains(item.key),

          onChanged:
              !widget.enabled ||
                  _bundle ||
                  !(widget.initial['addons'] as List? ?? []).contains(item.key)
              ? null
              : (value) {
                  setState(() {
                    if (value == true) {
                      _addons.add(item.key);
                    } else {
                      _addons.remove(item.key);
                    }
                  });

                  _emit();
                },
        ),

      const SizedBox(height: 16),

      Card(
        child: SwitchListTile(
          title: const Text('Growth Department — Private Coming Soon'),

          subtitle: const Text(
            'Managed Growth + Business Assistant + Lead Generation. 10 total users. Save \$97/month (\$1,164/year) versus \$2,097 separately. Replaces those individual charges.',
          ),

          value: _bundle,

          onChanged: null,
        ),
      ),

      const SizedBox(height: 8),

      const Text(
        'Review the server-verified total before confirming. Add-ons never add seats. Advertising spend and campaign costs are separate.',
      ),
    ],
  );
}
