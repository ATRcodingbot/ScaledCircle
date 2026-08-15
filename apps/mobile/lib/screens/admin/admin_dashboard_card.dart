import 'package:flutter/material.dart';

class AdminDashboardCard extends StatelessWidget {
  const AdminDashboardCard({
    required this.title,
    required this.subtitle,
    this.onTap,
    this.badge,
    this.disabled = false,
    this.width = 310,
    super.key,
  });

  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final String? badge;
  final bool disabled;
  final double width;

  bool get _interactive => !disabled && onTap != null;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final content = Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
              if (_interactive)
                const Icon(Icons.chevron_right, semanticLabel: 'Manage')
              else if (disabled)
                const Icon(Icons.lock_outline, semanticLabel: 'Disabled'),
            ],
          ),
          if (badge != null) ...[
            const SizedBox(height: 8),
            DecoratedBox(
              decoration: BoxDecoration(
                color: disabled
                    ? colors.surfaceContainerHighest
                    : colors.primaryContainer,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                child: Text(
                  badge!,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
            ),
          ],
          const SizedBox(height: 6),
          Text(subtitle),
          if (_interactive) ...[
            const SizedBox(height: 12),
            Text('Manage', style: TextStyle(color: colors.primary)),
          ],
        ],
      ),
    );

    return SizedBox(
      width: width,
      child: Semantics(
        button: true,
        enabled: _interactive,
        label: disabled ? '$title. Private development. Disabled.' : title,
        child: Opacity(
          opacity: disabled ? 0.62 : 1,
          child: Card(
            child: _interactive
                ? MouseRegion(
                    cursor: SystemMouseCursors.click,
                    child: InkWell(
                      canRequestFocus: true,
                      onTap: onTap,
                      child: content,
                    ),
                  )
                : content,
          ),
        ),
      ),
    );
  }
}
