import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../navigation/app_router.dart';
import '../../navigation/app_routes.dart';
import 'public_funnel_components.dart' show ScaledCircleBrand;
import 'public_legal_footer.dart';

enum LegalDocumentKind {
  hub,
  terms,
  privacy,
  refunds,
  scalerTerms,
  support;

  static LegalDocumentKind? fromPath(String? path) => switch (path) {
    AppRoutes.legal => hub,
    AppRoutes.terms => terms,
    AppRoutes.privacy => privacy,
    AppRoutes.refunds => refunds,
    AppRoutes.scalerTerms => scalerTerms,
    AppRoutes.support => support,
    _ => null,
  };
}

class LegalDocumentScreen extends StatelessWidget {
  const LegalDocumentScreen({super.key, required this.kind});
  final LegalDocumentKind kind;

  static const lastUpdated = 'August 24, 2026';

  @override
  Widget build(BuildContext context) {
    final document = _document(kind);
    return Title(
      title: '${document.title} · ScaledCircle',
      color: const Color(0xFF0A58CA),
      child: Scaffold(
        backgroundColor: const Color(0xFFF7FAFC),
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: const SizedBox(width: 190, child: ScaledCircleBrand(compact: true)),
          actions: [
            TextButton(
              onPressed: () => AppNavigation.replace(context, '/'),
              child: const Text('Home'),
            ),
            const SizedBox(width: 12),
          ],
        ),
        body: SelectionArea(
          child: ListView(
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 860),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      MediaQuery.sizeOf(context).width < 500 ? 18 : 32,
                      38,
                      MediaQuery.sizeOf(context).width < 500 ? 18 : 32,
                      52,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(document.title, style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 8),
                        Text(document.subtitle, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: const Color(0xFF42566B), height: 1.45)),
                        const SizedBox(height: 10),
                        if (kind != LegalDocumentKind.hub && kind != LegalDocumentKind.support)
                          const Text('Last updated: $lastUpdated', style: TextStyle(color: Color(0xFF60758A))),
                        const SizedBox(height: 28),
                        for (final section in document.sections) _LegalSection(section: section),
                      ],
                    ),
                  ),
                ),
              ),
              const PublicLegalFooter(dark: false),
            ],
          ),
        ),
      ),
    );
  }
}

class _LegalSection extends StatelessWidget {
  const _LegalSection({required this.section});
  final _Section section;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 26),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(section.heading, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 9),
        for (final paragraph in section.paragraphs)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(paragraph, style: const TextStyle(fontSize: 16, height: 1.6, color: Color(0xFF24384B))),
          ),
        if (section.links.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [for (final link in section.links) TextButton(onPressed: () => AppNavigation.push(context, link.$2), child: Text(link.$1))],
          ),
        if (section.email)
          TextButton.icon(
            onPressed: () => launchUrl(Uri(scheme: 'mailto', path: 'support@scaledcircle.com')),
            icon: const Icon(Icons.email_outlined),
            label: const Text('support@scaledcircle.com'),
          ),
      ],
    ),
  );
}

class _Document {
  const _Document(this.title, this.subtitle, this.sections);
  final String title;
  final String subtitle;
  final List<_Section> sections;
}

class _Section {
  const _Section(this.heading, this.paragraphs, {this.links = const [], this.email = false});
  final String heading;
  final List<String> paragraphs;
  final List<(String, String)> links;
  final bool email;
}

_Document _document(LegalDocumentKind kind) => switch (kind) {
  LegalDocumentKind.hub => const _Document(
    'Legal & Trust',
    'Plain-language information about ScaledCircle, your choices, and the records used to operate the service.',
    [
      _Section('ScaledCircle', ['ScaledCircle is operated by Scaled Circle LLC. We provide tools for Businesses to fund and manage mapped field campaigns and for approved Scalers to apply for and complete assigned work.'], links: [('Terms of Service', AppRoutes.terms), ('Privacy Policy', AppRoutes.privacy)]),
      _Section('Payments and work', ['Business campaign payments and worker earnings are separate financial events. Review the payment, cancellation, and refund rules before funding a campaign. Scalers should review the work, location, evidence, and earnings terms before accepting tracked work.'], links: [('Payments & Refunds', AppRoutes.refunds), ('Scaler Work & Earnings', AppRoutes.scalerTerms)]),
      _Section('Questions or requests', ['Contact the approved ScaledCircle support channel for account, privacy, payment, campaign, or work questions.'], links: [('Support', AppRoutes.support)]),
    ],
  ),
  LegalDocumentKind.terms => const _Document(
    'Terms of Service',
    'The core rules for using ScaledCircle as a Business, Scaler, or other authorized participant.',
    [
      _Section('The service', ['ScaledCircle helps Businesses plan, fund, publish, and review mapped field campaigns. Approved Scalers may choose to apply for available assignments. Access to a feature may depend on account role, approval, location, campaign state, or launch readiness.']),
      _Section('Accounts and acceptable use', ['Account holders must be at least 18 years old. A Business account holder must also be authorized to act for and bind the Business represented by the account. Provide accurate account information, protect your login, and use only your authoritative role. Do not impersonate another person, manipulate campaign, tracking, evidence, payment, earning, or referral records, or use ScaledCircle for unlawful, deceptive, abusive, or fraudulent activity. Age, capacity, and worker-classification wording remains subject to professional legal review before official broad public launch.']),
      _Section('Business campaigns', ['Businesses are responsible for lawful campaign content, accurate targets and instructions, required materials, and reviewing submitted work. Campaign quotes and allocations are server-authoritative. Business credits are retired; campaign funding uses real currency through Stripe.'], links: [('Payments & Refunds', AppRoutes.refunds)]),
      _Section('Scaler participation', ['Applying does not guarantee assignment or work. Assignment compensation and requirements are shown through the product. Tracked work may require location, checkpoints, photos, material handoff, and review. No income, work volume, or payout timing is guaranteed.'], links: [('Scaler Work & Earnings', AppRoutes.scalerTerms)]),
      _Section('Service limits and review', ['Some beta, provider-dependent, mailing, advertising, intelligence, affiliate, payout, or automation features may be unavailable or separately gated. ScaledCircle does not guarantee campaign, advertising, postal, lead, or business outcomes. Fraud, misuse, security risk, or policy violations may result in restriction or suspension.']),
      _Section('Content and intellectual property', ['You retain responsibility for content you provide and must have the rights needed to use it. The ScaledCircle product, brand, software, and approved logo assets belong to their respective rights holders and may not be misused.']),
      _Section('Privacy and contact', ['Our Privacy Policy describes operational data use. Questions about these Terms may be sent to support.'], links: [('Privacy Policy', AppRoutes.privacy), ('Support', AppRoutes.support)]),
    ],
  ),
  LegalDocumentKind.privacy => const _Document(
    'Privacy Policy',
    'How ScaledCircle uses account, campaign, work, payment, support, and Sales information to operate the product.',
    [
      _Section('Information we handle', ['Account data may include name, email, contact details, role, verification, approval, and profile information. Business data may include service areas, campaign targets, content, Zones, materials, logistics, and participant records. Scaler data may include preferences, applications, assignments, work areas, tracking routes, checkpoints, photos, completion evidence, earnings, and Wallet records.']),
      _Section('Payments and providers', ['Stripe processes Business payment and refund activity and may support later worker-transfer workflows. ScaledCircle stores operational payment identifiers and reconciled payment, refund, earning, and transfer-status records; it does not expose payment-method secrets in the app. Other providers may support email, storage, maps, analytics, hosting, or campaign services.']),
      _Section('Location and evidence', ['During an active tracked assignment, the mobile app may collect device location to verify route and work completion. The maintained Android design uses a foreground location service and visible service notification; it does not request ACCESS_BACKGROUND_LOCATION. Tracking is not intended to run between jobs and stops after completion, cancellation, or another terminal session state. Photos or checkpoints are captured only when the user chooses the maintained evidence flow or a campaign requires them. Evidence is used for campaign review, work verification, support, and dispute review where applicable.']),
      _Section('Support, Sales, referrals, and communications', ['Support cases retain the context needed to investigate requests. Admin-scoped Sales records may include lawful Business prospect contact, source, follow-up, suppression, and conversion information. Referral and affiliate records may retain attribution and enrollment state. Transactional account, verification, payment, refund, campaign, assignment, and support messages are separate from optional marketing communications. Future autonomous outreach is not implemented.']),
      _Section('Retention and security', ['Records are retained as reasonably necessary for service operation, work verification, support, disputes, security, accounting, and legal obligations. Precise retention periods require policy and legal review. ScaledCircle uses role-based access, server-authoritative functions, and provider security controls, but no system can promise absolute security.']),
      _Section('Your choices and requests', ['Optional launch or promotional email can be declined. Sales suppression and opt-out status are maintained for outreach controls. A complete self-service data export or account-deletion workflow is not currently promised. Contact support to request access, correction, deletion, or other privacy assistance; the response may depend on identity verification, applicable law, and records that must be retained.'], links: [('Support', AppRoutes.support)]),
    ],
  ),
  LegalDocumentKind.refunds => const _Document(
    'Payments, Cancellations & Refunds',
    'The public summary of the current campaign-funding and cancellation lifecycle.',
    [
      _Section('Business payments', ['Business campaign funding uses Stripe and real currency. For field campaigns, the reviewed platform fee is 20% of worker compensation and is added to the worker allocation. For direct-mail/postcard work, the current approved platform fee is 20%; printing, postage, and vendor costs are separate where applicable. Social advertising spend has a 0% percentage markup; any separate subscription or service charge remains distinct. Gross customer payment is not the same as ScaledCircle revenue.']),
      _Section('Eligible self-service cancellation', ['A funded campaign may receive a full campaign-payment refund only when the server confirms it is unassigned and unstarted and all authoritative eligibility checks pass. The marketplace closes, Stripe refund authority is reconciled, and the campaign becomes canceled, refunded, and softly archived. Applications alone do not create worker earning authority.']),
      _Section('After assignment or work', ['Once a Scaler is assigned or another worker obligation exists, instant self-service cancellation is unavailable. A different review process is required. Verified or approved worker earnings are not erased by ordinary Business self-service cancellation. Disputes, chargebacks, administrative review, and other exceptional remedies are separate processes.']),
      _Section('Refund timing and fees', ['Refund status is authoritative only after server and Stripe reconciliation. Bank timing can vary. ScaledCircle does not promise that Stripe returns its processing fees to ScaledCircle, and this page does not promise outcomes unsupported by the authoritative campaign and payment state.'], links: [('Support', AppRoutes.support)]),
    ],
  ),
  LegalDocumentKind.scalerTerms => const _Document(
    'Scaler Work & Earnings Agreement',
    'Plain-language work, evidence, and earnings terms for Scalers. Worker-classification language remains subject to professional legal review.',
    [
      _Section('Choosing and accepting work', ['Scalers may browse eligible opportunities and choose whether to apply. Application does not guarantee assignment. A Business assignment establishes the server-authoritative compensation obligation and requirements for that Zone; neither the Scaler nor Business client may rewrite the locked compensation after assignment.']),
      _Section('Materials, tracking, and evidence', ['Follow the campaign, Zone, material handoff, coordination, checkpoint, photo, and completion requirements shown for the assignment. Location is collected during an active tracked job session for route and work verification. The foreground service may continue while the screen is locked or another app is open, and stops at completion, cancellation, or another terminal state. ScaledCircle does not request permanent camera access merely to use the maintained system capture/picker flow.'], links: [('Privacy Policy', AppRoutes.privacy)]),
      _Section('Completion and earnings', ['Starting work or submitting incomplete evidence does not itself establish earnings. Compensation becomes earned only after the maintained server-authoritative completion and review process approves verified work. Base compensation may be prorated under the reviewed completion policy, and a completion bonus is earned only when its authoritative qualification threshold is satisfied. ScaledCircle does not charge workers a platform fee under the current policy.']),
      _Section('Payout is separate', ['An earned Wallet amount and provider payout are separate lifecycle states. Production payout and self-service cash-out remain gated pending final operating, physical-device, KYC, tax, and provider review. No bank payout date is promised, and a provider delay must not be described as erasing legitimately established earnings.']),
      _Section('Affiliate enrollment', ['Affiliate participation is optional and separately accepted. The current Phase 1 default rate is 10% for qualifying paid Business subscription attribution, subject to the authoritative program terms, refunds, chargebacks, tax, fraud, and reviewed rate rules. Attribution can be recorded now, but general commission accounting and cash settlement are not yet available; no affiliate payment date is promised.']),
      _Section('Status and legal review', ['Scaler account holders must be at least 18 years old. ScaledCircle intends role-specific participation rather than employment promises, but age/capacity wording and worker classification, tax, and contractor terms require professional legal review before official broad public launch. Nothing here guarantees jobs, hours, income, assignment volume, or payout timing.'], links: [('Support', AppRoutes.support)]),
    ],
  ),
  LegalDocumentKind.support => const _Document(
    'Support & Contact',
    'Help with accounts, campaigns, payments, tracked work, privacy requests, or other ScaledCircle questions.',
    [
      _Section('Contact ScaledCircle', ['Email support@scaledcircle.com. Do not include passwords, complete payment-card information, tax identifiers, or other unnecessary sensitive information. Include the campaign or issue context needed to help, but avoid sending precise location history unless Support asks for evidence through an authorized workflow.'], email: true),
      _Section('Operational support', ['Authenticated campaign participants can also use maintained Job Room support tools where available. Payment, refund, earning, and Wallet corrections require authoritative records and cannot be created from an email request alone.'], links: [('Legal & Trust', AppRoutes.legal)]),
    ],
  ),
};
