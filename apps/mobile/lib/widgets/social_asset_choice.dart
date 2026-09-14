import 'dart:typed_data';
import 'package:flutter/material.dart';

class SocialAssetChoice extends StatefulWidget {
  const SocialAssetChoice({
    super.key,
    required this.asset,
    required this.history,
    required this.load,
  });
  final Map<String, dynamic> asset, history;
  final Future<Uint8List?> Function() load;
  @override
  State<SocialAssetChoice> createState() => _SocialAssetChoiceState();
}

class _SocialAssetChoiceState extends State<SocialAssetChoice> {
  late final Future<Uint8List?> _bytes = widget.load();
  @override
  Widget build(BuildContext context) {
    final h = widget.history;
    final last = DateTime.tryParse(h['lastUsed']?.toString() ?? '')?.toLocal();
    final label =
        h['conceptLabel'] ??
        widget.asset['revision']?['conceptLabel'] ??
        widget.asset['title'] ??
        'Business image';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 72,
          height: 72,
          child: FutureBuilder<Uint8List?>(
            future: _bytes,
            builder: (context, s) => s.hasData
                ? Image.memory(
                    s.data!,
                    fit: BoxFit.contain,
                    errorBuilder: (_, error, stack) =>
                        const Icon(Icons.image_not_supported_outlined),
                  )
                : const Icon(Icons.image_outlined),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toString()),
              Text(h['origin']?.toString() ?? 'Business image'),
              Text(
                last == null
                    ? 'Not previously scheduled'
                    : "Last used: ${h['lastPlatform'] ?? 'Social'} · ${MaterialLocalizations.of(context).formatMediumDate(last)}",
              ),
              Text(
                '${h['recentUses'] ?? 0} scheduled/published uses · ${h['plannedUses'] ?? 0} other drafts',
              ),
              if (h['overused'] == true)
                const Text('Recently reused — choose intentionally'),
            ],
          ),
        ),
      ],
    );
  }
}
