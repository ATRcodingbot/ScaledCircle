import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const osmCopyrightUrl = 'https://www.openstreetmap.org/copyright';

/// A map-adjacent footer, outside map gestures and overlaid map controls.
class MapAttributionFrame extends StatelessWidget {
  const MapAttributionFrame({
    super.key,
    required this.child,
    this.additionalCredit,
  });

  final Widget child;
  final String? additionalCredit;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Expanded(child: child),
      MapSourceCredit(additionalCredit: additionalCredit),
    ],
  );
}

class MapSourceCredit extends StatelessWidget {
  const MapSourceCredit({super.key, this.additionalCredit});

  final String? additionalCredit;

  Future<void> _open(BuildContext context) async {
    var opened = false;
    try {
      opened = await launchUrl(
        Uri.parse(osmCopyrightUrl),
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      // A platform failure must not silently look like a successful launch.
    }
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open the map licence. Please try again.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.surface,
    child: SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Semantics(
            key: const Key('osm-copyright-link'),
            link: true,
            button: true,
            excludeSemantics: true,
            label:
                '© OpenStreetMap contributors. Copyright and licence. Opens browser.',
            onTap: () => _open(context),
            child: TextButton(
              onPressed: () => _open(context),
              child: const Text(
                '© OpenStreetMap contributors',
                textAlign: TextAlign.center,
              ),
            ),
          ),
          if (additionalCredit != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
              child: Text(
                additionalCredit!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ),
        ],
      ),
    ),
  );
}
