import 'package:flutter/material.dart';

class ReferralSourceFields extends StatelessWidget {
  const ReferralSourceFields({
    super.key,
    required this.source,
    required this.onSourceChanged,
    required this.referrerNameController,
    this.dark = false,
    this.enabled = true,
  });

  static const personalReferral = 'personal_referral';

  static const options = <String, String>{
    personalReferral: 'A person referred me',
    'search_engine': 'Google or another search engine',
    'social_media': 'Social media',
    'online_ad': 'Online advertisement',
    'event_or_group': 'Event or community group',
    'other': 'Other',
  };

  final String? source;
  final ValueChanged<String?> onSourceChanged;
  final TextEditingController referrerNameController;
  final bool dark;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final textColor = dark ? Colors.white : null;
    final labelColor = dark ? const Color(0xFF9EB1C2) : null;
    final enabledBorder = dark
        ? const OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xFF31506B)),
          )
        : const OutlineInputBorder();
    final focusedBorder = dark
        ? const OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xFF14E39A), width: 2),
          )
        : const OutlineInputBorder();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          initialValue: source,
          isExpanded: true,
          dropdownColor: dark ? const Color(0xFF071525) : null,
          style: dark
              ? const TextStyle(color: Colors.white, fontSize: 16)
              : null,
          decoration: InputDecoration(
            labelText: 'How did you hear about us?',
            labelStyle: TextStyle(color: labelColor),
            enabledBorder: enabledBorder,
            focusedBorder: focusedBorder,
            border: const OutlineInputBorder(),
          ),
          items: options.entries
              .map(
                (entry) => DropdownMenuItem<String>(
                  value: entry.key,
                  child: Text(entry.value),
                ),
              )
              .toList(),
          onChanged: enabled ? onSourceChanged : null,
          validator: (value) => value == null || value.isEmpty
              ? 'Tell us how you heard about Scaled Circle.'
              : null,
        ),
        if (source == personalReferral) ...[
          const SizedBox(height: 14),
          TextFormField(
            controller: referrerNameController,
            enabled: enabled,
            style: TextStyle(color: textColor),
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Who referred you?',
              hintText: 'Enter their name',
              labelStyle: TextStyle(color: labelColor),
              enabledBorder: enabledBorder,
              focusedBorder: focusedBorder,
              border: const OutlineInputBorder(),
            ),
            validator: (value) => value == null || value.trim().isEmpty
                ? 'Enter the name of the person who referred you.'
                : null,
          ),
        ],
      ],
    );
  }
}
