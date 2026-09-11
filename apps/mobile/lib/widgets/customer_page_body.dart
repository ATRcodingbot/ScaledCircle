import 'package:flutter/material.dart';

/// Keeps a readable desktop measure without constraining mobile text scaling.
class CustomerPageBody extends StatelessWidget {
  const CustomerPageBody({
    super.key,
    required this.child,
    this.maxWidth = 1080,
  });
  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    ),
  );
}
