import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';

import 'public_site_service.dart';

class MarylandCountySpec {
  final String name;
  final double latitude;
  final double longitude;

  const MarylandCountySpec({
    required this.name,
    required this.latitude,
    required this.longitude,
  });
}

class MarylandCountyWeather {
  final MarylandCountySpec county;
  final LocalOpportunityFeed? feed;
  final Object? error;

  const MarylandCountyWeather({required this.county, this.feed, this.error});

  List<LocalOpportunityAlert> get alerts =>
      feed?.alerts ?? const <LocalOpportunityAlert>[];
}

class WeatherEntitlement {
  final bool entitled;
  final bool isAdmin;
  final bool subscriptionActive;
  final String plan;

  const WeatherEntitlement({
    required this.entitled,
    required this.isAdmin,
    required this.subscriptionActive,
    required this.plan,
  });
}

class MarylandWeatherService {
  MarylandWeatherService({FirebaseFirestore? firestore})
    : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  static const counties = <MarylandCountySpec>[
    MarylandCountySpec(
      name: 'Howard County',
      latitude: 39.25,
      longitude: -76.93,
    ),
    MarylandCountySpec(
      name: 'Baltimore County',
      latitude: 39.46,
      longitude: -76.64,
    ),
    MarylandCountySpec(
      name: 'Anne Arundel County',
      latitude: 39.00,
      longitude: -76.58,
    ),
    MarylandCountySpec(
      name: 'Montgomery County',
      latitude: 39.15,
      longitude: -77.20,
    ),
  ];

  Future<WeatherEntitlement> loadEntitlement(String userId) async {
    final results = await Future.wait([
      _firestore.collection('users').doc(userId).get(),
      _firestore.collection('wallets').doc(userId).get(),
    ]);
    final userData = results[0].data() ?? <String, dynamic>{};
    final walletData = results[1].data() ?? <String, dynamic>{};
    final isAdmin = userData['role']?.toString().toLowerCase() == 'admin';
    final plan =
        walletData['subscriptionPlan']?.toString().trim().toLowerCase() ?? '';
    final status =
        walletData['subscriptionStatus']?.toString().trim().toLowerCase() ?? '';
    final expiresAt = walletData['subscriptionExpiresAt'];
    final notExpired =
        expiresAt is Timestamp && expiresAt.toDate().isAfter(DateTime.now());
    final subscriptionActive = status == 'active' && notExpired;

    return WeatherEntitlement(
      entitled: isAdmin || (subscriptionActive && plan == 'scale'),
      isAdmin: isAdmin,
      subscriptionActive: subscriptionActive,
      plan: isAdmin ? 'scale' : plan,
    );
  }

  Future<List<MarylandCountyWeather>> load() async {
    return Future.wait(
      counties.map((county) async {
        try {
          final feed = await PublicSiteService.loadLocalOpportunities(
            latitude: county.latitude,
            longitude: county.longitude,
          );
          return MarylandCountyWeather(county: county, feed: feed);
        } catch (error) {
          return MarylandCountyWeather(county: county, error: error);
        }
      }),
    );
  }

  Future<void> syncNotifications({
    required String userId,
    required List<MarylandCountyWeather> counties,
  }) async {
    for (final countyWeather in counties) {
      if (countyWeather.alerts.isEmpty) continue;

      // One notification per county per refresh prevents a severe-weather
      // event with several overlapping products from flooding the inbox.
      final alert = countyWeather.alerts.first;
      final identity = alert.id.isNotEmpty
          ? alert.id
          : '${countyWeather.county.name}|${alert.event}|${alert.onset}';
      final encoded = base64Url
          .encode(utf8.encode(identity))
          .replaceAll('=', '');
      final notificationId =
          'weather_${userId}_${encoded.substring(0, encoded.length.clamp(0, 600))}';
      final reference = _firestore
          .collection('notifications')
          .doc(notificationId);
      final existing = await reference.get();
      if (existing.exists) continue;

      await reference.set({
        'userId': userId,
        'type': 'weather_opportunity',
        'title': 'Maryland Weather Opportunity',
        'message':
            '${countyWeather.county.name}: ${alert.event}. '
            'Experimental lead opportunity +${alert.leadLiftLowPercent}% '
            'to +${alert.leadLiftHighPercent}%.',
        'county': countyWeather.county.name,
        'weatherEvent': alert.event,
        'severity': alert.severity,
        'services': alert.services,
        'leadLiftLowPercent': alert.leadLiftLowPercent,
        'leadLiftHighPercent': alert.leadLiftHighPercent,
        'source': 'National Weather Service',
        'experimentalOpportunityModel': true,
        'read': false,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }
}
