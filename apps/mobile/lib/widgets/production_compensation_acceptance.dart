import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../config/app_environment.dart';
import '../models/canvassing_photo_policy.dart';

/// Empty digest preserves the existing non-versioned/staging flow. Null means
/// the user cancelled; never infer acceptance from viewing the offer.
Future<String?> confirmProductionCompensation(
  BuildContext context,
  String campaignId,
) async {
  if (!AppEnvironmentConfig.isProduction && !AppEnvironmentConfig.isStaging) {
    return '';
  }
  final document = await FirebaseFirestore.instance
      .collection('campaignDiscovery')
      .doc(campaignId)
      .get();
  final data = document.data();
  if (data == null) throw Exception('This opportunity is no longer available.');
  if (AppEnvironmentConfig.isStaging) {
    if (!prohibitsResidentialPhotos(data['campaignType'])) return '';
    if (!context.mounted) return null;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Your work and pay'),
        content: const Text(
          'Full accepted base is eligible at 80% Route Coverage Estimate. An accepted coverage bonus is eligible at 95%. If you intentionally pause, you have 24 hours to resume. Below 80%, the Business may offer partial payment for saved work; payment is not guaranteed and you must explicitly accept the exact offer. Secured base pay cannot be reduced.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Go back'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('I understand — continue'),
          ),
        ],
      ),
    );
    return accepted == true ? '' : null;
  }
  if (data['completionPolicyVersion'] != 'CanvassingRoute80_95V1') return '';
  final offer = Map<String, dynamic>.from(
    data['compensationOffer'] as Map? ?? {},
  );
  final digest = offer['offerDigest']?.toString() ?? '';
  if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(digest)) {
    throw Exception(
      'Refresh this opportunity to review its current pay terms.',
    );
  }
  if (!context.mounted) return null;
  final accepted = await showDialog<bool>(
    context: context,
    builder: (context) => CompensationAcceptanceDialog(offer: offer),
  );
  return accepted == true ? digest : null;
}

class CompensationAcceptanceDialog extends StatefulWidget {
  const CompensationAcceptanceDialog({super.key, required this.offer});
  final Map<String, dynamic> offer;
  @override
  State<CompensationAcceptanceDialog> createState() =>
      _CompensationAcceptanceState();
}

class _CompensationAcceptanceState extends State<CompensationAcceptanceDialog> {
  bool _accepted = false;
  String money(String key) =>
      '\$${((widget.offer[key] as num) / 100).toStringAsFixed(2)}';
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Review your pay terms'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Full base: ${money('baseAmountCents')} at 80% Route Coverage Estimate, '
            'with valid tracking, completion and Business review.',
          ),
          const SizedBox(height: 12),
          Text(
            (widget.offer['bonusAmountCents'] as num) > 0
                ? 'Coverage bonus: ${money('bonusAmountCents')} at 95%. Aim for 100%.'
                : 'No coverage bonus is offered. Aim for 100%.',
          ),
          const SizedBox(height: 12),
          const Text(
            'Base pay is not prorated. Route coverage does not claim individual '
            'homes were serviced. Report access restrictions; never enter unauthorized '
            'areas. Platform faults can be referred for technical review.',
          ),
          CheckboxListTile(
            value: _accepted,
            onChanged: (value) => setState(() => _accepted = value == true),
            title: const Text(
              'I understand and accept these pay requirements.',
            ),
            controlAffinity: ListTileControlAffinity.leading,
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context, false),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: _accepted ? () => Navigator.pop(context, true) : null,
        child: const Text('Apply with these terms'),
      ),
    ],
  );
}
