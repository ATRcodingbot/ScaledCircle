import 'package:flutter/material.dart';

class ScPrimaryButton extends StatelessWidget {

  final String text;
  final VoidCallback onPressed;
  final IconData icon;


  const ScPrimaryButton({
    super.key,
    required this.text,
    required this.onPressed,
    required this.icon,
  });


  @override
  Widget build(BuildContext context) {

    return SizedBox(
      height: 58,
      width: double.infinity,

      child: ElevatedButton.icon(

        onPressed: onPressed,

        icon: Icon(icon),

        label: Text(
          text,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
          ),
        ),

      ),
    );
  }
}