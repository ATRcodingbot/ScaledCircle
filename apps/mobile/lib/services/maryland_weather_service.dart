import 'package:cloud_firestore/cloud_firestore.dart';

import 'public_site_service.dart';
import 'subscription_plan_service.dart';

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
  final SubscriptionPlanService _plans = SubscriptionPlanService();

  static const counties = <MarylandCountySpec>[
    MarylandCountySpec(
      id: 'allegany',
      name: 'Allegany County',
      latitude: 39.6215762,
      longitude: -78.6976934,
    ),
    MarylandCountySpec(
      id: 'anne_arundel',
      name: 'Anne Arundel County',
      latitude: 38.9939586,
      longitude: -76.5675565,
    ),
    MarylandCountySpec(
      id: 'baltimore',
      name: 'Baltimore County',
      latitude: 39.4429054,
      longitude: -76.6160576,
    ),
    MarylandCountySpec(
      id: 'baltimore_city',
      name: 'Baltimore City',
      latitude: 39.3009639,
      longitude: -76.6106288,
    ),
    MarylandCountySpec(
      id: 'calvert',
      name: 'Calvert County',
      latitude: 38.5345651,
      longitude: -76.5303934,
    ),
    MarylandCountySpec(
      id: 'caroline',
      name: 'Caroline County',
      latitude: 38.8715369,
      longitude: -75.8316417,
    ),
    MarylandCountySpec(
      id: 'carroll',
      name: 'Carroll County',
      latitude: 39.5627551,
      longitude: -77.0224938,
    ),
    MarylandCountySpec(
      id: 'cecil',
      name: 'Cecil County',
      latitude: 39.5623167,
      longitude: -75.9480092,
    ),
    MarylandCountySpec(
      id: 'charles',
      name: 'Charles County',
      latitude: 38.4736097,
      longitude: -77.0134736,
    ),
    MarylandCountySpec(
      id: 'dorchester',
      name: 'Dorchester County',
      latitude: 38.4224051,
      longitude: -76.083484,
    ),
    MarylandCountySpec(
      id: 'frederick',
      name: 'Frederick County',
      latitude: 39.4720806,
      longitude: -77.398037,
    ),
    MarylandCountySpec(
      id: 'garrett',
      name: 'Garrett County',
      latitude: 39.52875,
      longitude: -79.2732056,
    ),
    MarylandCountySpec(
      id: 'harford',
      name: 'Harford County',
      latitude: 39.5363334,
      longitude: -76.2987057,
    ),
    MarylandCountySpec(
      id: 'howard',
      name: 'Howard County',
      latitude: 39.2507098,
      longitude: -76.9310884,
    ),
    MarylandCountySpec(
      id: 'kent',
      name: 'Kent County',
      latitude: 39.2355851,
      longitude: -76.0960831,
    ),
    MarylandCountySpec(
      id: 'montgomery',
      name: 'Montgomery County',
      latitude: 39.1363497,
      longitude: -77.2041501,
    ),
    MarylandCountySpec(
      id: 'prince_georges',
      name: "Prince George's County",
      latitude: 38.8293082,
      longitude: -76.8472812,
    ),
    MarylandCountySpec(
      id: 'queen_annes',
      name: "Queen Anne's County",
      latitude: 39.0375919,
      longitude: -76.0854694,
    ),
    MarylandCountySpec(
      id: 'saint_marys',
      name: "St. Mary's County",
      latitude: 38.2157512,
      longitude: -76.5286105,
    ),
    MarylandCountySpec(
      id: 'somerset',
      name: 'Somerset County',
      latitude: 38.0800671,
      longitude: -75.8536775,
    ),
    MarylandCountySpec(
      id: 'talbot',
      name: 'Talbot County',
      latitude: 38.7490936,
      longitude: -76.1787218,
    ),
    MarylandCountySpec(
      id: 'washington',
      name: 'Washington County',
      latitude: 39.6037098,
      longitude: -77.8137988,
    ),
    MarylandCountySpec(
      id: 'wicomico',
      name: 'Wicomico County',
      latitude: 38.3694692,
      longitude: -75.6315726,
    ),
    MarylandCountySpec(
      id: 'worcester',
      name: 'Worcester County',
      latitude: 38.2164033,
      longitude: -75.296946,
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
    final subscriptionActive = _plans.hasActiveScaleEntitlement(walletData);

    return WeatherEntitlement(
      entitled: isAdmin || subscriptionActive,
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
