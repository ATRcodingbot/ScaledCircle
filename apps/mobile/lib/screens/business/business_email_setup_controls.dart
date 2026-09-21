import 'package:flutter/material.dart';

const emailTimezones = {
  'America/New_York': 'Eastern Time (New York)',
  'America/Chicago': 'Central Time (Chicago)',
  'America/Denver': 'Mountain Time (Denver)',
  'America/Phoenix': 'Arizona (Phoenix)',
  'America/Los_Angeles': 'Pacific Time (Los Angeles)',
  'America/Anchorage': 'Alaska (Anchorage)',
  'Pacific/Honolulu': 'Hawaii (Honolulu)',
};
String emailTimeLabel(BuildContext context, String minutes) {
  final m = int.tryParse(minutes) ?? 0;
  return TimeOfDay(hour: (m ~/ 60) % 24, minute: m % 60).format(context);
}

Widget emailZone(String value, ValueChanged<String> change) =>
    DropdownButtonFormField<String>(
      initialValue: value.isEmpty ? null : value,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Business timezone'),
      items:
          {
                ...emailTimezones,
                if (value.isNotEmpty && !emailTimezones.containsKey(value))
                  value: value,
              }.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
      onChanged: (v) {
        if (v != null) change(v);
      },
    );
Widget emailDays(String value, ValueChanged<String> change) {
  final days = value.split(',').map(int.tryParse).whereType<int>().toSet();
  return Wrap(
    spacing: 6,
    runSpacing: 6,
    children: [
      for (var i = 1; i <= 7; i++)
        FilterChip(
          label: Text(
            const [
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
              'Sunday',
            ][i - 1],
          ),
          selected: days.contains(i),
          onSelected: (v) {
            final next = {...days};
            v ? next.add(i) : next.remove(i);
            final ordered = next.toList()..sort();
            change(ordered.join(','));
          },
        ),
    ],
  );
}

Widget emailTime(
  BuildContext context,
  String label,
  String value,
  ValueChanged<String> change,
) => ListTile(
  contentPadding: EdgeInsets.zero,
  title: Text(label),
  subtitle: Text(emailTimeLabel(context, value)),
  trailing: const Icon(Icons.schedule),
  onTap: () async {
    final m = int.tryParse(value) ?? 540;
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: (m ~/ 60) % 24, minute: m % 60),
    );
    if (picked != null) change('${picked.hour * 60 + picked.minute}');
  },
);
