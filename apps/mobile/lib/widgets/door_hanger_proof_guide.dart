import 'package:flutter/material.dart';

/// UI-only guide. The download always uses the original server artifact.
class DoorHangerProofGuide extends StatelessWidget {
  const DoorHangerProofGuide({
    super.key,
    required this.geometry,
    required this.child,
  });
  final Map<String, dynamic>? geometry;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (geometry == null) return child;
    final trim = Map<String, dynamic>.from(geometry!['trim'] as Map);
    final bleed = (geometry!['bleed'] as num).toDouble();
    final height = (trim['height'] as num).toDouble() + 2 * bleed;
    final fraction =
        ((geometry!['contentTop'] as num).toDouble() + bleed) / height;
    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        Align(
          alignment: Alignment.topCenter,
          child: FractionallySizedBox(
            widthFactor: 1,
            heightFactor: fraction,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.25),
                  border: const Border(
                    bottom: BorderSide(color: Colors.deepOrange, width: 2),
                  ),
                ),
                child: const Center(
                  child: Text(
                    'Keep important content out of this area',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.black,
                      backgroundColor: Colors.white,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
