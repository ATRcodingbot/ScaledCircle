import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../navigation/app_router.dart';
import '../../services/business_onboarding_service.dart';
import '../../widgets/authenticated_sign_out_button.dart';
import '../../services/address_search_service.dart';
import '../../widgets/business_geography_editor.dart';

class CompleteBusinessProfileScreen extends StatefulWidget {
  const CompleteBusinessProfileScreen({
    super.key,
    this.load,
    this.save,
    this.onCompleted,
    this.searchPlaces,
  });
  final Future<Map<String, dynamic>> Function()? load;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>)? save;
  final VoidCallback? onCompleted;
  final Future<List<AddressSuggestion>> Function(String, bool)? searchPlaces;
  @override
  State<CompleteBusinessProfileScreen> createState() =>
      _CompleteBusinessProfileScreenState();
}

class _CompleteBusinessProfileScreenState
    extends State<CompleteBusinessProfileScreen> {
  static const labels = {
    'businessName': 'Business name',
    'contactName': 'Owner / contact name',
    'businessDescription': 'About your Business',
    'servicesOffered': 'Services offered',
    'serviceAreas': 'Service area',
    'website': 'Website (optional)',
    'primaryPhone': 'Contact phone (optional)',
    'businessAddress': 'Business address (optional)',
    'brandVoice': 'Brand / profile details (optional)',
  };
  final _form = GlobalKey<FormState>();
  final _fields = {for (final k in labels.keys) k: TextEditingController()};
  final _baseSearch = TextEditingController(),
      _areaSearch = TextEditingController();
  AddressSuggestion? _base;
  List<AddressSuggestion> _areas = [];
  Map<String, dynamic>? _state;
  bool _busy = false;
  String? _error;
  bool _returnToAccount = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _baseSearch.dispose();
    _areaSearch.dispose();
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
      _returnToAccount = false;
    });
    try {
      final value = await (widget.load ?? BusinessOnboardingService().load)()
          .timeout(const Duration(seconds: 20));
      if (!mounted) return;
      final p = Map<String, dynamic>.from(value['profile'] as Map? ?? {});
      for (final k in labels.keys) {
        final v = p[k];
        _fields[k]!.text = v is List ? v.join(', ') : v?.toString() ?? '';
      }
      final geography = value['geography'] as Map?;
      _base = AddressSearchService.parseSuggestion(geography?['base']);
      _baseSearch.text = _base?.fullAddress ?? '';
      _areas = (geography?['serviceAreas'] as List? ?? [])
          .map(AddressSearchService.parseSuggestion)
          .whereType<AddressSuggestion>()
          .toList();
      setState(() => _state = value);
    } catch (e) {
      if (mounted) {
        setState(() {
          _returnToAccount =
              e is FirebaseFunctionsException &&
              [
                'unauthenticated',
                'permission-denied',
                'failed-precondition',
              ].contains(e.code);
          _error = _returnToAccount
              ? 'Return to your account to sign in or finish verifying your email.'
              : 'We could not load your Business profile. Please retry.';
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    // Also validate outside the lazy form viewport before calling the server.
    if (_base?.selectionId.isNotEmpty != true ||
        _areas.isEmpty ||
        _areas.any((a) => a.selectionId.isEmpty)) {
      setState(
        () => _error =
            'Search and select your Business base and service areas before saving.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final p = <String, dynamic>{
      for (final e in _fields.entries) e.key: e.value.text.trim(),
    };
    for (final k in ['servicesOffered', 'serviceAreas']) {
      p[k] = p[k]
          .toString()
          .split(RegExp(r'[,\n]'))
          .map((v) => v.trim())
          .where((v) => v.isNotEmpty)
          .toList();
    }
    p['serviceAreas'] = _areas.map((a) => a.fullAddress).toList();
    p['geography'] = {
      'baseSelectionId': _base!.selectionId,
      'serviceAreaSelectionIds': _areas.map((a) => a.selectionId).toList(),
    };
    try {
      final result = await (widget.save ?? BusinessOnboardingService().save)(
        p,
      ).timeout(const Duration(seconds: 20));
      if (result['profileComplete'] != true) {
        throw StateError('Profile not confirmed');
      }
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Business profile saved.')));
      if (widget.onCompleted != null) {
        widget.onCompleted!();
      } else {
        AppNavigation.replace(context, '/');
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Your profile was not confirmed saved. Check the fields and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Business profile'),
      actions: [if (widget.load == null) const AuthenticatedSignOutButton()],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: _state == null
            ? ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.all(24),
                children: [
                  if (_busy) const Center(child: CircularProgressIndicator()),
                  if (_error != null) ...[
                    Text(_error!),
                    FilledButton(
                      onPressed: _returnToAccount
                          ? () => AppNavigation.replace(context, '/')
                          : _load,
                      child: Text(
                        _returnToAccount ? 'Return to account' : 'Retry',
                      ),
                    ),
                  ],
                ],
              )
            : Form(
                key: _form,
                child: ListView(
                  padding: const EdgeInsets.all(24),
                  children: [
                    Text(
                      'Complete your Business profile',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 12),
                    const Text('✓ Email verified'),
                    Text(_state!['email']?.toString() ?? ''),
                    const SizedBox(height: 12),
                    const Text(
                      'Prepare your profile now. Funding, subscriptions and marketplace access remain subject to approval.',
                    ),
                    const SizedBox(height: 20),
                    for (final e in labels.entries.where(
                      (e) =>
                          !['serviceAreas', 'businessAddress'].contains(e.key),
                    ))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: TextFormField(
                          key: Key('business-profile-${e.key}'),
                          controller: _fields[e.key],
                          enabled: !_busy,
                          maxLength: e.key == 'businessDescription'
                              ? 2000
                              : e.key == 'businessName'
                              ? 160
                              : e.key == 'contactName'
                              ? 120
                              : e.key == 'primaryPhone'
                              ? 80
                              : e.key == 'servicesOffered' ||
                                    e.key == 'serviceAreas'
                              ? 2000
                              : 500,
                          maxLines:
                              e.key == 'businessDescription' ||
                                  e.key == 'brandVoice'
                              ? 3
                              : 1,
                          decoration: InputDecoration(
                            labelText: e.value,
                            border: const OutlineInputBorder(),
                            helperText:
                                e.key == 'servicesOffered' ||
                                    e.key == 'serviceAreas'
                                ? 'Separate multiple entries with commas.'
                                : null,
                          ),
                          validator: (v) {
                            if ([
                                  'businessName',
                                  'contactName',
                                  'businessDescription',
                                  'servicesOffered',
                                  'serviceAreas',
                                ].contains(e.key) &&
                                (v == null || v.trim().isEmpty)) {
                              return 'This field is required.';
                            }
                            if (e.key == 'website' &&
                                v != null &&
                                v.trim().isNotEmpty) {
                              final u = Uri.tryParse(v.trim());
                              if (u == null ||
                                  !['https', 'http'].contains(u.scheme) ||
                                  u.host.isEmpty ||
                                  u.userInfo.isNotEmpty) {
                                return 'Enter a complete website URL, such as https://example.com.';
                              }
                            }
                            return null;
                          },
                        ),
                      ),
                    BusinessGeographyEditor(
                      baseController: _baseSearch,
                      areaController: _areaSearch,
                      base: _base,
                      areas: _areas,
                      enabled: !_busy,
                      legacyAreas:
                          (_state!['legacyServiceAreas'] as List? ?? [])
                              .map((v) => v.toString())
                              .toList(),
                      search:
                          widget.searchPlaces ??
                          BusinessOnboardingService().searchPlaces,
                      onBaseChanged: (v) => setState(() => _base = v),
                      onAreasChanged: (v) => setState(() => _areas = v),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(_error!),
                      ),
                    FilledButton(
                      onPressed: _busy ? null : _save,
                      child: Text(_busy ? 'Saving…' : 'Save and continue'),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Next: review any missing agreements, then see your account access status.',
                    ),
                  ],
                ),
              ),
      ),
    ),
  );
}
