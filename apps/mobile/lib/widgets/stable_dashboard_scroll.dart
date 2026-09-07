import 'package:flutter/material.dart';

/// A bounded dashboard, not an unbounded feed. Keep async sections mounted so
/// reverse scrolling cannot recreate loading placeholders with different heights.
class StableDashboardScroll extends StatelessWidget {
  const StableDashboardScroll({
    super.key,
    required this.padding,
    required this.children,
  });
  final EdgeInsets padding;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    key: const PageStorageKey('scaler-dashboard-scroll'),
    padding: padding,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    ),
  );
}
