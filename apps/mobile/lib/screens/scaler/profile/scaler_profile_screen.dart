import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../services/discovery_preferences_service.dart';
import '../../../services/profile_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/reputation_card.dart';
import '../../preferences/areas_preferences_screen.dart';

typedef ProfileStreamLoader =
    Stream<Map<String, dynamic>?> Function(String uid);
typedef PreferencesStreamLoader =
    Stream<Map<String, dynamic>?> Function(String uid);
typedef ScalerProfileUpdater =
    Future<Map<String, dynamic>> Function({
      required String displayName,
      required String bio,
    });

class ScalerProfileScreen extends StatelessWidget {
  const ScalerProfileScreen({
    super.key,
    this.scalerId,
    this.currentUserId,
    this.authDisplayName,
    this.profileStream,
    this.preferencesStream,
    this.updatePresentationProfile,
    this.loadWorkTypes,
    this.reputationBuilder,
  });

  final String? scalerId;
  final String? currentUserId;
  final String? authDisplayName;
  final ProfileStreamLoader? profileStream;
  final PreferencesStreamLoader? preferencesStream;
  final ScalerProfileUpdater? updatePresentationProfile;
  final Future<List<MarketplaceWorkType>> Function()? loadWorkTypes;
  final Widget Function(String uid)? reputationBuilder;

  String _displayName(Map<String, dynamic> profile, String? authName) {
    final stored = profile['displayName']?.toString().trim() ?? '';
    if (stored.isNotEmpty) return stored;
    final legacy = [
      profile['firstName']?.toString().trim() ?? '',
      profile['lastName']?.toString().trim() ?? '',
    ].where((part) => part.isNotEmpty).join(' ');
    if (legacy.isNotEmpty) return legacy;
    final auth = authName?.trim() ?? '';
    return auth.isNotEmpty ? auth : 'Your Profile';
  }

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

  Future<void> _editProfile(
    BuildContext context, {
    required Map<String, dynamic> profile,
    required String displayName,
    required ScalerProfileUpdater update,
  }) async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _EditScalerProfileDialog(
        initialDisplayName: displayName,
        initialBio: profile['bio']?.toString() ?? '',
        update: update,
      ),
    );
    if (saved == true && context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Profile updated.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final authUser = currentUserId == null && scalerId == null
        ? FirebaseAuth.instance.currentUser
        : null;
    final userId = scalerId ?? currentUserId ?? authUser?.uid;
    if (userId == null) {
      return const Scaffold(body: Center(child: Text('User not found.')));
    }

    final ownProfile = scalerId == null;
    final service = profileStream == null || updatePresentationProfile == null
        ? ProfileService()
        : null;
    final watchProfile = profileStream ?? service!.watchProfile;
    final updateProfile =
        updatePresentationProfile ?? service!.updateScalerPresentationProfile;
    final watchPreferences =
        preferencesStream ??
        (uid) => FirebaseFirestore.instance
            .collection('discoveryPreferences')
            .doc(uid)
            .snapshots()
            .map((snapshot) => snapshot.data());
    final fallbackAuthName = authDisplayName ?? authUser?.displayName;

    return Scaffold(
      appBar: AppBar(title: const Text('Scaler Profile')),
      body: StreamBuilder<Map<String, dynamic>?>(
        stream: watchProfile(userId),
        builder: (context, snapshot) {
          final data = snapshot.data ?? const <String, dynamic>{};
          final displayName = _displayName(data, fallbackAuthName);
          final bio = data['bio']?.toString().trim();

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
                  displayName,
                  key: const ValueKey('scaler-display-name'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Center(
                child: Text(
                  'Scaler',
                  key: ValueKey('scaler-role-label'),
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 4),
              const Center(child: Text('Local Gig Worker')),
              if (ownProfile) ...[
                const SizedBox(height: 14),
                Center(
                  child: OutlinedButton.icon(
                    key: const ValueKey('edit-profile-button'),
                    onPressed: () => _editProfile(
                      context,
                      profile: data,
                      displayName: displayName,
                      update: updateProfile,
                    ),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('EDIT PROFILE'),
                  ),
                ),
              ],
              const SizedBox(height: 25),
              const Text(
                'PROFILE & REPUTATION',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 10),
              reputationBuilder?.call(userId) ??
                  ReputationCard(
                    userId: userId,
                    userType: 'scaler',
                    title: 'Scaler Reputation',
                  ),
              const SizedBox(height: 20),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'About',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        bio?.isNotEmpty == true ? bio! : 'No bio added yet.',
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              if (ownProfile)
                StreamBuilder<Map<String, dynamic>?>(
                  stream: watchPreferences(userId),
                  builder: (context, preferenceSnapshot) {
                    final preferences = preferenceSnapshot.data ?? const {};
                    return FutureBuilder<List<MarketplaceWorkType>>(
                      future:
                          loadWorkTypes?.call() ??
                          DiscoveryPreferencesService()
                              .loadMarketplaceWorkTypes(),
                      builder: (context, typeSnapshot) {
                        final selectedIds =
                            (preferences['jobTypes'] as List? ?? const [])
                                .map((value) => value.toString())
                                .toSet();
                        final selected =
                            (typeSnapshot.data ?? const <MarketplaceWorkType>[])
                                .where(
                                  (type) =>
                                      type.scalerSelectable &&
                                      selectedIds.contains(type.id),
                                )
                                .map((type) => type.customerLabel)
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
                                  'Door-to-Door Outreach',
                                  preferences['outreachOptIn'] == true
                                      ? 'Yes'
                                      : 'No',
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

class _EditScalerProfileDialog extends StatefulWidget {
  const _EditScalerProfileDialog({
    required this.initialDisplayName,
    required this.initialBio,
    required this.update,
  });

  final String initialDisplayName;
  final String initialBio;
  final ScalerProfileUpdater update;

  @override
  State<_EditScalerProfileDialog> createState() =>
      _EditScalerProfileDialogState();
}

class _EditScalerProfileDialogState extends State<_EditScalerProfileDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _bioController;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialDisplayName);
    _bioController = TextEditingController(text: widget.initialBio);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.update(
        displayName: _nameController.text.trim(),
        bio: _bioController.text.trim(),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = "We couldn't update your profile. Try again.";
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Edit Profile'),
    content: Form(
      key: _formKey,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              key: const ValueKey('display-name-field'),
              controller: _nameController,
              maxLength: 80,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Display Name',
                helperText: 'The name shown on your Scaler profile.',
              ),
              validator: (value) {
                final name = value?.trim() ?? '';
                if (name.isEmpty) return 'Enter your display name.';
                if (name.length > 80) {
                  return 'Display name must be 80 characters or fewer.';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('profile-bio-field'),
              controller: _bioController,
              maxLength: 500,
              minLines: 3,
              maxLines: 5,
              decoration: const InputDecoration(labelText: 'Bio (optional)'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.pop(context, false),
        child: const Text('Cancel'),
      ),
      FilledButton(
        key: const ValueKey('save-profile-button'),
        onPressed: _saving ? null : _save,
        child: Text(_saving ? 'Saving…' : 'Save Profile'),
      ),
    ],
  );
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
