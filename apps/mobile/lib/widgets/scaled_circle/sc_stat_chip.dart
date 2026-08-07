import 'package:flutter/material.dart';


class ScStatChip extends StatelessWidget {

  final IconData icon;
  final String label;


  const ScStatChip({
    super.key,
    required this.icon,
    required this.label,
  });


  @override
  Widget build(BuildContext context) {

    return Container(

      padding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 8,
      ),

      decoration: BoxDecoration(

        borderRadius:
            BorderRadius.circular(30),

        color:
            Theme.of(context)
                .colorScheme
                .primary
                .withValues(alpha: .1),

      ),

      child: Row(

        mainAxisSize:
            MainAxisSize.min,

        children: [

          Icon(
            icon,
            size: 16,
          ),

          const SizedBox(width:8),

          Text(label),

        ],
      ),
    );
  }
}