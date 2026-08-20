import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../services/discovery_preferences_service.dart';
import '../../../services/profile_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/reputation_card.dart';
import '../../preferences/areas_preferences_screen.dart';

class ScalerProfileScreen extends StatelessWidget {
  final String? scalerId;

  const ScalerProfileScreen({super.key, this.scalerId});

  String _areaSummary(Map<String, dynamic> preferences) {
    final areas = (preferences['areas'] as List? ?? const [])
        .whereType<Map>()
        .where((area) => area['enabled'] != false)
        .toList();
    if (areas.isEmpty) return 'Not set';
    final first =
        areas.first['displayName']?.toString().trim().isNotEmpty == true
        ? areas.first['displayName'].toString()
        : areas.first['name']?.toString() ?? 'Work Area';
    return areas.length == 1 ? first : '$first + ${areas.length - 1} more';
  }

  String _travelSummary(Map<String, dynamic> preferences) {
    final miles = (preferences['maxTravelMiles'] as num?)?.round();
    return miles == null ? 'Not set' : 'Up to $miles miles';
  }

  String _vehicleSummary(Map<String, dynamic> preferences) {
    const labels = {
      'car': 'Car',
      'pickup_truck': 'Pickup Truck',
      'van': 'Van',
      'box_truck': 'Box Truck',
      'no_vehicle': 'No Vehicle',
    };
    return labels[preferences['vehicleType']] ?? 'Not provided';
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;

    final userId = scalerId ?? currentUser?.uid;

    if (userId == null) {
      return const Scaffold(body: Center(child: Text("User not found.")));
    }

    final profileService = ProfileService();

    return Scaffold(
      appBar: AppBar(title: const Text("Scaler Profile")),

      body: StreamBuilder<Map<String, dynamic>?>(
        stream: profileService.watchProfile(userId),

        builder: (context, snapshot) {
          final data = snapshot.data ?? {};

          final firstName = data['firstName']?.toString() ?? "";

          final lastName = data['lastName']?.toString() ?? "";

          final name = "$firstName $lastName".trim();

          final bio = data['bio']?.toString() ?? "No bio added yet.";

          return ListView(
            padding: const EdgeInsets.all(20),

            children: [
              const CircleAvatar(
                radius: 45,

                child: Icon(Icons.person, size: 50),
              ),

              const SizedBox(height: 20),

              Center(
                child: Text(
                  name.isEmpty ? "Scaler" : name,

                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),

              const SizedBox(height: 8),

              Center(child: Text("Independent Marketing Professional")),

              const SizedBox(height: 25),

              const Text(
                'PROFILE & REPUTATION',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w800,
                ),
              ),

              const SizedBox(height: 10),

              ReputationCard(
                userId: userId,
                userType: "scaler",
                title: "Scaler Reputation",
              ),

              const SizedBox(height: 20),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),

                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,

                    children: [
                      const Text(
                        "About",

                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 10),

                      Text(bio),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              if (scalerId == null)
                StreamBuilder<Map<String, dynamic>?>(
                  stream: FirebaseFirestore.instance
                      .collection('discoveryPreferences')
                      .doc(userId)
                      .snapshots()
                      .map((snapshot) => snapshot.data()),
                  builder: (context, preferenceSnapshot) {
                    final preferences = preferenceSnapshot.data ?? const {};
                    return FutureBuilder<List<MarketplaceWorkType>>(
                      future: DiscoveryPreferencesService()
                          .loadMarketplaceWorkTypes(),
                      builder: (context, typeSnapshot) {
                        final labels = {
                          for (final type
                              in typeSnapshot.data ??
                                  const <MarketplaceWorkType>[])
                            type.id: type.customerLabel,
                        };
                        final selected =
                            (preferences['jobTypes'] as List? ?? const [])
                                .map(
                                  (value) =>
                                      labels[value.toString()] ??
                                      value.toString(),
                                )
                                .where((value) => value.isNotEmpty)
                                .toList();
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(18),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'WORK PREFERENCES',
                                  style: TextStyle(
                                    fontSize: 20,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _PreferenceLine(
                                  'Work Areas',
                                  _areaSummary(preferences),
                                ),
                                _PreferenceLine(
                                  'Travel',
                                  _travelSummary(preferences),
                                ),
                                _PreferenceLine(
                                  'Interested Work',
                                  selected.isEmpty
                                      ? 'Not selected'
                                      : selected.join(', '),
                                ),
                                _PreferenceLine(
                                  'Vehicle',
                                  _vehicleSummary(preferences),
                                ),
                                _PreferenceLine(
                                  'Email Alerts',
                                  (preferences['alertDelivery']
                                              as Map?)?['email'] ==
                                          true
                                      ? 'On'
                                      : 'Off',
                                ),
                                const SizedBox(height: 14),
                                FilledButton.icon(
                                  onPressed: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) =>
                                          const AreasPreferencesScreen(
                                            role: 'scaler',
                                          ),
                                    ),
                                  ),
                                  icon: const Icon(Icons.tune),
                                  label: const Text('EDIT WORK PREFERENCES'),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
            ],
          );
        },
      ),
    );
  }
}

class _PreferenceLine extends StatelessWidget {
  const _PreferenceLine(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 130,
          child: Text(
            label,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}
