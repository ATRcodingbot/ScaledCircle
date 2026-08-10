import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:http/http.dart' as http;

class PublicSiteService {
  static String get _functionBaseUrl {
    final projectId = Firebase.app().options.projectId;
    return 'https://us-east1-$projectId.cloudfunctions.net';
  }

  static Future<WaitlistResult> joinWaitlist({
    required String role,
    required String displayName,
    required String email,
    required String postalCode,
    String contactNumber = '',
    required bool consent,
    String companyName = '',
    String website = '',
    String source = 'flutter_public_site',
    required String discoverySource,
    String referrerName = '',
  }) async {
    final attributionSource = _attributionSource(
      source: source,
      contactNumber: contactNumber,
      discoverySource: discoverySource,
      referrerName: referrerName,
    );
    final response = await http
        .post(
          Uri.parse('$_functionBaseUrl/joinWaitlist'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({
            'role': role,
            'displayName': displayName,
            'email': email,
            'postalCode': postalCode,
            'contactNumber': contactNumber.trim(),
            'companyName': companyName,
            'website': website,
            // The structured fields are used by the current endpoint. The
            // compact source suffix preserves attribution if an older
            // endpoint revision is still serving during a rolling deploy.
            'source': attributionSource,
            'discoverySource': discoverySource,
            'referrerName': referrerName,
            'consent': consent,
          }),
        )
        .timeout(const Duration(seconds: 20));

    final payload = _readJson(response.body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        payload['error']?.toString() ?? 'Unable to join the waitlist.',
      );
    }

    return WaitlistResult(
      alreadyJoined: payload['alreadyJoined'] == true,
      message:
          payload['message']?.toString() ??
          'You are on the Scaled Circle early-access list.',
    );
  }

  static Future<LocalOpportunityFeed> loadLocalOpportunities({
    required double latitude,
    required double longitude,
  }) async {
    final uri = Uri.parse('$_functionBaseUrl/localOpportunityAlerts').replace(
      queryParameters: {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
      },
    );
    final response = await http.get(uri).timeout(const Duration(seconds: 20));
    final payload = _readJson(response.body);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        payload['error']?.toString() ??
            'Local opportunity alerts are temporarily unavailable.',
      );
    }

    final rawAlerts = payload['alerts'];
    final alerts = rawAlerts is List
        ? rawAlerts
              .whereType<Map>()
              .map(
                (value) => LocalOpportunityAlert.fromJson(
                  Map<String, dynamic>.from(value),
                ),
              )
              .toList()
        : <LocalOpportunityAlert>[];

    return LocalOpportunityFeed(
      source: payload['source']?.toString() ?? 'National Weather Service',
      cached: payload['cached'] == true,
      stale: payload['stale'] == true,
      alerts: alerts,
    );
  }

  static Map<String, dynamic> _readJson(String body) {
    if (body.trim().isEmpty) return <String, dynamic>{};
    final decoded = jsonDecode(body);
    return decoded is Map<String, dynamic>
        ? decoded
        : Map<String, dynamic>.from(decoded as Map);
  }

  static String _attributionSource({
    required String source,
    required String contactNumber,
    required String discoverySource,
    required String referrerName,
  }) {
    final safeSource = source.trim().replaceAll('|', '_');
    final safeDiscovery = discoverySource.trim().replaceAll('|', '_');
    final safeContact = Uri.encodeComponent(
      contactNumber.trim().replaceAll('|', '_'),
    );
    final safeReferrer = Uri.encodeComponent(
      referrerName.trim().replaceAll('|', '_'),
    );
    final value = [
      safeSource,
      if (safeContact.isNotEmpty) 'phone=$safeContact',
      'heard=$safeDiscovery',
      if (safeReferrer.isNotEmpty) 'ref=$safeReferrer',
    ].join('|');

    return value.length <= 80 ? value : value.substring(0, 80);
  }
}

class WaitlistResult {
  final bool alreadyJoined;
  final String message;

  const WaitlistResult({required this.alreadyJoined, required this.message});
}

class LocalOpportunityFeed {
  final String source;
  final bool cached;
  final bool stale;
  final List<LocalOpportunityAlert> alerts;

  const LocalOpportunityFeed({
    required this.source,
    required this.cached,
    required this.stale,
    required this.alerts,
  });
}

class LocalOpportunityAlert {
  final String id;
  final String event;
  final String headline;
  final String severity;
  final String areaDescription;
  final DateTime? onset;
  final DateTime? expires;
  final List<String> services;
  final int leadLiftLowPercent;
  final int leadLiftHighPercent;
  final String confidence;
  final String rationale;

  const LocalOpportunityAlert({
    required this.id,
    required this.event,
    required this.headline,
    required this.severity,
    required this.areaDescription,
    required this.onset,
    required this.expires,
    required this.services,
    required this.leadLiftLowPercent,
    required this.leadLiftHighPercent,
    required this.confidence,
    required this.rationale,
  });

  factory LocalOpportunityAlert.fromJson(Map<String, dynamic> json) {
    final opportunity = json['opportunity'] is Map
        ? Map<String, dynamic>.from(json['opportunity'] as Map)
        : <String, dynamic>{};
    final rawServices = opportunity['services'];

    return LocalOpportunityAlert(
      id: json['id']?.toString() ?? '',
      event: json['event']?.toString() ?? 'Weather alert',
      headline: json['headline']?.toString() ?? '',
      severity: json['severity']?.toString() ?? 'Unknown',
      areaDescription: json['areaDescription']?.toString() ?? '',
      onset: DateTime.tryParse(json['onset']?.toString() ?? ''),
      expires: DateTime.tryParse(json['expires']?.toString() ?? ''),
      services: rawServices is List
          ? rawServices.map((value) => value.toString()).toList()
          : const <String>[],
      leadLiftLowPercent:
          (opportunity['estimatedLeadLiftLowPercent'] as num?)?.round() ?? 0,
      leadLiftHighPercent:
          (opportunity['estimatedLeadLiftHighPercent'] as num?)?.round() ?? 0,
      confidence: opportunity['confidence']?.toString() ?? 'experimental_low',
      rationale: opportunity['rationale']?.toString() ?? '',
    );
  }
}
