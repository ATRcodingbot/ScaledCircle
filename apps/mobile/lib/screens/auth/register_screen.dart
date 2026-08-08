import 'package:flutter/material.dart';

import '../../models/user/user_profile.dart';
import '../../services/auth/auth_service.dart';
import '../onboarding/account_type_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final TextEditingController nameController = TextEditingController();

  final TextEditingController emailController = TextEditingController();

  final TextEditingController passwordController = TextEditingController();

  final AuthService _authService = AuthService();

  bool isLoading = false;

  Future<void> register() async {
    if (nameController.text.trim().isEmpty) {
      _showError('Full name is required.');

      return;
    }

    if (emailController.text.trim().isEmpty) {
      _showError('Email is required.');

      return;
    }

    if (passwordController.text.trim().length < 6) {
      _showError('Password must be at least 6 characters.');

      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      await _authService.signUp(
        email: emailController.text.trim(),

        password: passwordController.text.trim(),

        displayName: nameController.text.trim(),

        role: UserRole.scaler,
      );

      if (!mounted) return;

      Navigator.pushReplacement(
        context,

        MaterialPageRoute(builder: (_) => AccountTypeScreen()),
      );
    } catch (e) {
      if (!mounted) return;

      _showError(e.toString());
    } finally {
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    nameController.dispose();

    emailController.dispose();

    passwordController.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),

      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),

          child: ListView(
            children: [
              const SizedBox(height: 30),

              const Text(
                'Create Your Account',

                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 30),

              TextField(
                controller: nameController,

                decoration: const InputDecoration(
                  labelText: 'Full Name',

                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextField(
                controller: emailController,

                keyboardType: TextInputType.emailAddress,

                decoration: const InputDecoration(
                  labelText: 'Email',

                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 20),

              TextField(
                controller: passwordController,

                obscureText: true,

                decoration: const InputDecoration(
                  labelText: 'Password',

                  border: OutlineInputBorder(),
                ),
              ),

              const SizedBox(height: 30),

              SizedBox(
                height: 55,

                child: ElevatedButton(
                  onPressed: isLoading ? null : register,

                  child: isLoading
                      ? const SizedBox(
                          width: 22,

                          height: 22,

                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Continue'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
