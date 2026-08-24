import 'package:flutter/material.dart';

import '../navigation/app_router.dart';
import '../navigation/app_routes.dart';
import '../services/legal_consent_service.dart';

enum LegalActionConsent { businessFunding, scalerWork, locationTracking }

extension on LegalActionConsent {
  String get contextName => switch (this) {
    LegalActionConsent.businessFunding => 'business_funding',
    LegalActionConsent.scalerWork => 'scaler_work',
    LegalActionConsent.locationTracking => 'scaler_tracking',
  };

  String get title => switch (this) {
    LegalActionConsent.businessFunding => 'Review current agreements',
    LegalActionConsent.scalerWork => 'Review current work agreements',
    LegalActionConsent.locationTracking => 'Location during active tracking',
  };

  String get message => switch (this) {
    LegalActionConsent.businessFunding =>
      'Before funding this campaign, agree to the current Terms and acknowledge the Privacy Policy.',
    LegalActionConsent.scalerWork =>
      'Before applying for or accepting new work, agree to the current Terms and Scaler Work Terms.',
    LegalActionConsent.locationTracking =>
      'ScaledCircle uses your location while this job is actively tracked to verify the route and work completion. The foreground service may continue while the screen is locked or another app is open, and stops when tracking reaches a terminal state.',
  };
}

Future<bool> ensureLegalConsentForAction(
  BuildContext context,
  LegalActionConsent requirement, {
  LegalConsentService? service,
}) async {
  final consent = service ?? LegalConsentService();
  if (await consent.hasCurrent(requirement.contextName)) return true;
  if (!context.mounted) return false;

  final accepted = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => AlertDialog(
      title: Text(requirement.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(requirement.message),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              TextButton(
                onPressed: () => AppNavigation.push(dialogContext, AppRoutes.terms),
                child: const Text('Terms'),
              ),
              TextButton(
                onPressed: () => AppNavigation.push(dialogContext, AppRoutes.privacy),
                child: const Text('Privacy'),
              ),
              if (requirement != LegalActionConsent.businessFunding)
                TextButton(
                  onPressed: () => AppNavigation.push(dialogContext, AppRoutes.scalerTerms),
                  child: const Text('Scaler Work Terms'),
                ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('Not Now'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const Text('Review & Continue'),
        ),
      ],
    ),
  );
  if (accepted != true) return false;
  switch (requirement) {
    case LegalActionConsent.businessFunding:
      await consent.acceptBusinessFundingAgreements();
    case LegalActionConsent.scalerWork:
      await consent.acceptScalerWorkAgreements();
    case LegalActionConsent.locationTracking:
      await consent.acceptLocationNotice();
  }
  return true;
}
