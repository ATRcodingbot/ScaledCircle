import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../config/app_environment.dart';
import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import 'login_screen.dart';

const stagingPrivacyRoute = '/staging-privacy-acknowledgment';
const stagingPrivacyVersion = 'privacy-2026-08-v1';

class StagingPrivacyService {
  Future<bool> load() async {
    if (!AppEnvironmentConfig.isStaging) throw StateError('Unavailable');
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) throw StateError('Sign in required');
    final db = FirebaseFirestore.instance;
    final profile = await db
        .doc('users/${user.uid}')
        .get(const GetOptions(source: Source.server));
    if (profile.data()?['role'] != 'scaler') {
      throw StateError('Scaler required');
    }
    final record = await db
        .doc('legalConsents/${user.uid}_privacy_$stagingPrivacyVersion')
        .get(const GetOptions(source: Source.server));
    if (FirebaseAuth.instance.currentUser?.uid != user.uid) {
      throw StateError('Session changed');
    }
    if (!record.exists) return false;
    final data = record.data()!;
    if (data['uid'] != user.uid ||
        data['agreementType'] != 'privacy' ||
        data['agreementVersion'] != stagingPrivacyVersion ||
        data['acceptedAt'] == null) {
      throw StateError('Agreement record requires review');
    }
    return true;
  }

  Future<void> acknowledge() async {
    if (await load()) return;
    final result = await FirebaseFunctions.instanceFor(region: 'us-east1')
        .httpsCallable('recordLegalConsent')
        .call({
          'agreementTypes': ['privacy'],
          'source': 'authenticated_legal',
        });
    final accepted = result.data['accepted'] as List;
    if (!accepted.any(
      (item) =>
          item['type'] == 'privacy' && item['version'] == stagingPrivacyVersion,
    )) {
      throw StateError('Agreement version requires review');
    }
  }
}

class StagingPrivacyScreen extends StatefulWidget {
  const StagingPrivacyScreen({super.key, this.service, this.enabled});
  final StagingPrivacyService? service;
  final bool? enabled;
  @override
  State<StagingPrivacyScreen> createState() => _StagingPrivacyScreenState();
}

class _StagingPrivacyScreenState extends State<StagingPrivacyScreen> {
  late final service = widget.service ?? StagingPrivacyService();
  bool busy = true, checked = false, accepted = false;
  String? error;
  bool get enabled => widget.enabled ?? AppEnvironmentConfig.isStaging;
  @override
  void initState() {
    super.initState();
    if (enabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) => load());
    } else {
      busy = false;
    }
  }

  Future<void> load() async {
    if (!mounted) return;
    if (widget.service == null && FirebaseAuth.instance.currentUser == null) {
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => const LoginScreen(returnRoute: stagingPrivacyRoute),
        ),
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
      checked = false;
    });
    try {
      final status = await service.load().timeout(const Duration(seconds: 20));
      if (mounted) setState(() => accepted = status);
    } catch (_) {
      if (mounted) {
        setState(() {
          accepted = false;
          error =
              'Unable to verify Privacy acknowledgment. Sign in as a Scaler and retry.';
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    if (!enabled || busy || !checked || accepted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await service.acknowledge().timeout(const Duration(seconds: 20));
      final confirmed = await service.load().timeout(
        const Duration(seconds: 20),
      );
      if (!confirmed) throw StateError('Not confirmed');
      if (mounted) setState(() => accepted = true);
    } catch (_) {
      if (mounted) {
        setState(() {
          accepted = false;
          checked = false;
          error =
              'Acknowledgment is not confirmed. Retry verification before submitting again.';
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Staging Privacy acknowledgment')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(24),
          children: [
            if (!enabled)
              const Text('Unavailable outside staging.')
            else if (busy)
              const Center(child: CircularProgressIndicator())
            else if (error != null) ...[
              Text(error!),
              ElevatedButton(onPressed: load, child: const Text('Retry')),
            ] else if (accepted)
              const Text(
                'Privacy acknowledgment verified. No further acknowledgment is needed.',
              )
            else ...[
              const Text('STAGING ONLY'),
              const Text('Privacy Policy — privacy-2026-08-v1'),
              TextButton(
                onPressed: () => AppNavigation.push(context, AppRoutes.privacy),
                child: const Text('Read Privacy Policy'),
              ),
              CheckboxListTile(
                value: checked,
                onChanged: (value) => setState(() => checked = value == true),
                title: const Text(
                  'I have read and acknowledge the Privacy Policy (privacy-2026-08-v1).',
                ),
              ),
              ElevatedButton(
                onPressed: checked ? submit : null,
                child: const Text('Submit acknowledgment'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
