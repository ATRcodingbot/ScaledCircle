import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class ScaledCircleBrand extends StatelessWidget {
  const ScaledCircleBrand({
    super.key,
    this.compact = false,
    this.lightSurface = false,
  });

  final bool compact;
  final bool lightSurface;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'ScaledCircle',
      image: true,
      child: Image.asset(
        lightSurface
            ? 'assets/brand/scaledcircle-lockup-light-surface.png'
            : 'assets/brand/scaledcircle-lockup-dark-surface.png',
        height: compact ? 28 : 38,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
      ),
    );
  }
}

class DashboardHero extends StatelessWidget {
  const DashboardHero({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.description,
    required this.primaryActionLabel,
    required this.primaryActionIcon,
    required this.onPrimaryAction,
    this.metrics = const [],
  });

  final String eyebrow;
  final String title;
  final String description;
  final String primaryActionLabel;
  final IconData primaryActionIcon;
  final VoidCallback onPrimaryAction;
  final List<Widget> metrics;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(MediaQuery.sizeOf(context).width < 600 ? 22 : 30),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0B2238), Color(0xFF071525)],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF1A4569)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x5514E39A),
            blurRadius: 50,
            spreadRadius: -30,
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 720;
          final copy = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow.toUpperCase(),
                style: const TextStyle(
                  color: AppColors.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.6,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                title,
                style: Theme.of(
                  context,
                ).textTheme.headlineLarge?.copyWith(fontSize: wide ? 36 : 29),
              ),
              const SizedBox(height: 10),
              Text(
                description,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 16,
                  height: 1.45,
                ),
              ),
            ],
          );

          final action = SizedBox(
            width: wide ? 240 : double.infinity,
            child: ElevatedButton.icon(
              onPressed: onPrimaryAction,
              icon: Icon(primaryActionIcon),
              label: Text(primaryActionLabel),
            ),
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(child: copy),
                    const SizedBox(width: 28),
                    action,
                  ],
                )
              else ...[
                copy,
                const SizedBox(height: 20),
                action,
              ],
              if (metrics.isNotEmpty) ...[
                const SizedBox(height: 24),
                Wrap(spacing: 10, runSpacing: 10, children: metrics),
              ],
            ],
          );
        },
      ),
    );
  }
}

class DashboardPill extends StatelessWidget {
  const DashboardPill({
    super.key,
    required this.icon,
    required this.label,
    this.accent = AppColors.blue,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final Color accent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: AppColors.surfaceAccent,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 17, color: accent),
          const SizedBox(width: 7),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return content;
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: content,
      ),
    );
  }
}
