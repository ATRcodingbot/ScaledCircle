import 'package:cloud_firestore/cloud_firestore.dart';

import 'public_site_service.dart';

class MarylandCountySpec {
  final String id;
  final String name;
  final double latitude;
  final double longitude;

  const MarylandCountySpec({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
  });
}

class WeatherCoveragePreferences {
  final Set<String> countyIds;
  final bool emailAlertsEnabled;
  final bool configured;

  const WeatherCoveragePreferences({
    required this.countyIds,
    required this.emailAlertsEnabled,
    required this.configured,
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
      id: 'howard',
      name: 'Howard County',
      latitude: 39.25,
      longitude: -76.93,
    ),
    MarylandCountySpec(
      id: 'baltimore',
      name: 'Baltimore County',
      latitude: 39.46,
      longitude: -76.64,
    ),
    MarylandCountySpec(
      id: 'anne_arundel',
      name: 'Anne Arundel County',
      latitude: 39.00,
      longitude: -76.58,
    ),
    MarylandCountySpec(
      id: 'montgomery',
      name: 'Montgomery County',
      latitude: 39.15,
      longitude: -77.20,
    ),
  ];

  static Set<String> get allCountyIds =>
      counties.map((county) => county.id).toSet();

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

  Future<WeatherCoveragePreferences> loadCoveragePreferences(
    String userId,
  ) async {
    final snapshot = await _firestore.collection('users').doc(userId).get();
    final data = snapshot.data() ?? <String, dynamic>{};
    final rawCountyIds = data['weatherCoverageCountyIds'];
    final countyIds = rawCountyIds is Iterable
        ? rawCountyIds
              .map((value) => value.toString())
              .where(allCountyIds.contains)
              .toSet()
        : <String>{};
    return WeatherCoveragePreferences(
      countyIds: countyIds,
      emailAlertsEnabled: data['weatherEmailAlertsEnabled'] == true,
      configured: data['weatherCoverageEnabled'] == true,
    );
  }

  Future<void> saveCoveragePreferences({
    required String userId,
    required Set<String> countyIds,
    required bool emailAlertsEnabled,
  }) async {
    final validCountyIds = countyIds.where(allCountyIds.contains).toList()
      ..sort();
    await _firestore.collection('users').doc(userId).update({
      'weatherCoverageCountyIds': validCountyIds,
      'weatherCoverageEnabled': validCountyIds.isNotEmpty,
      'weatherEmailAlertsEnabled':
          validCountyIds.isNotEmpty && emailAlertsEnabled,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<List<MarylandCountyWeather>> load({Set<String>? countyIds}) async {
    final selectedCounties = countyIds == null
        ? counties
        : counties.where((county) => countyIds.contains(county.id));
    return Future.wait(
      selectedCounties.map((county) async {
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
}
