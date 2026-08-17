import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'public_landing_screen.dart';

class EarlyAccessPendingScreen extends StatelessWidget {
  final String email;

  const EarlyAccessPendingScreen({super.key, required this.email});

  Future<void> _returnToSite(BuildContext context) async {
    await FirebaseAuth.instance.signOut();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const PublicLandingScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020914),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0xFF071525),
                border: Border.all(color: const Color(0xFF143552)),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    const Icon(
                      Icons.schedule_send,
                      color: Color(0xFF14E39A),
                      size: 64,
                    ),
                    const SizedBox(height: 22),
                    const Text(
                      "YOU'RE SET UP",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Your ScaledCircle account has been created for $email. '
                      "We're rolling out marketplace access in stages. We'll let you know when your account is ready.",
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xFFB8C9D8),
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () => _returnToSite(context),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF14E39A),
                        foregroundColor: const Color(0xFF020914),
                        padding: const EdgeInsets.all(18),
                      ),
                      child: const Text('Return to Scaled Circle'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
