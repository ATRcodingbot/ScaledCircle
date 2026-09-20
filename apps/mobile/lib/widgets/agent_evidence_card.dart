import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Technical evidence stays inspectable without competing with operational state.
class AgentEvidenceCard extends StatelessWidget {
  const AgentEvidenceCard({
    super.key,
    required this.label,
    required this.value,
  });
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Card(
    child: ExpansionTile(
      title: Text(label),
      subtitle: const Text('Technical evidence · expand to view or copy'),
      childrenPadding: const EdgeInsets.all(16),
      children: [
        Align(alignment: Alignment.centerLeft, child: SelectableText(value)),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            icon: const Icon(Icons.copy),
            label: const Text('Copy reference'),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: value));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Reference copied')),
                );
              }
            },
          ),
        ),
      ],
    ),
  );
}
