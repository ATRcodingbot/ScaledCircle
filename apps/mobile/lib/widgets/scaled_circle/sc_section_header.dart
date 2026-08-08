import 'package:flutter/material.dart';

class ScSectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;

  const ScSectionHeader({super.key, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),

        if (subtitle != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),

            child: Text(
              subtitle!,
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ),
      ],
    );
  }
}
