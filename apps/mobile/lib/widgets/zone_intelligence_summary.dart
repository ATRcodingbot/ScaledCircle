import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../models/campaign_area_geometry.dart';
import '../services/business_workspace_service.dart';
import 'smart_zone_recommendation_evidence.dart';

bool zoneEvidenceMatches(Map? data, dynamic geometry) =>
    data?['version'] == 'ZoneIntelligenceV1' &&
    data?['geometryDigest'] != null &&
    data?['geometryDigest'] == CampaignAreaGeometry.savedDigest(geometry);

class ZoneIntelligenceSummary extends StatelessWidget {
  const ZoneIntelligenceSummary({
    super.key,
    required this.data,
    required this.geometry,
  });
  final Map<String, dynamic> data;
  final dynamic geometry;

  @override
  Widget build(BuildContext context) {
    if (!zoneEvidenceMatches(data, geometry)) {
      return const Text(
        'Area changed. Analyze this boundary to see current evidence.',
      );
    }
    final business = data['targetIntent'] == 'business';
    final mix = data['propertyMix'] as Map?;
    final workload = data['workload'] as Map?;
    final regional = data['regionalContext'] as Map?;
    final source = data['source'] as Map?;
    final count = data['mappedTargetCount'];
    final meters = data['supportingStreetMeters'] as num?;
    final signals = (regional?['signals'] as List? ?? [])
        .whereType<Map>()
        .where(
          (s) =>
              !business ||
              !RegExp(
                'housing|residential|construction|age|era',
                caseSensitive: false,
              ).hasMatch('${s['label']}'),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          data['mode'] == 'recommended'
              ? 'Why ScaledCircle recommended this area'
              : 'What we found inside your area',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          count is num
              ? '$count mapped ${business ? 'business' : 'residential'} targets'
              : 'Mapped target count unavailable',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (mix != null) ...[
          for (final category
              in (mix['categories'] as List? ?? []).whereType<Map>())
            Text('${category['label']}: ${category['count']}'),
          if ((mix['unknownCount'] as num? ?? 0) > 0)
            Text(
              'Detailed mapped property classification is available for ${mix['classifiedCount']} of $count. ${mix['unknownCount']} remain unspecified.',
            ),
        ] else
          const Text('Detailed property characteristics unavailable.'),
        for (final signal in signals.where(
          (s) =>
              RegExp('era|age', caseSensitive: false).hasMatch('${s['label']}'),
        ))
          Text(
            'Nearby ${signal['label'].toString().toLowerCase()}: ${signal['value']} (regional property context)',
          ),
        Text(
          meters == null
              ? 'Supporting street network unavailable'
              : 'Supporting street network: ~${meters.round()} m / ${(meters / 1609.344).toStringAsFixed(2)} mi',
        ),
        Text(
          workload?['minutes'] is num
              ? 'Estimated field workload: ~${advisoryWorkload(workload!['minutes'] as num)}'
              : 'Estimated field workload: not established',
        ),
        if (workload != null)
          Text(
            workload['oneScaler'] == true
                ? 'One-Scaler planning estimate'
                : 'Exceeds the six-hour one-Scaler limit. Review smaller work areas.',
          ),
        if (workload?['supportedTargetCount'] is num)
          Text(
            'Workload uses ${workload!['supportedTargetCount']} street-supported mapped targets.',
          ),
        if (meters != null) const Text('Street evidence available'),
        const Text('Execution route not yet verified'),
        for (final reason in data['reasons'] as List? ?? []) Text('• $reason'),
        if (data['status'] == 'unavailable')
          for (final reason in data['limitations'] as List? ?? [])
            Text(reason.toString()),
        ExpansionTile(
          key: ValueKey('zone-evidence-${data['geometryDigest']}'),
          tilePadding: EdgeInsets.zero,
          title: const Text('View property evidence'),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Mapped features are not verified households, entrances, delivery stops or a material quantity.',
                  ),
                  if (regional != null) ...[
                    const Text(
                      'Regional property context — analyzed nearby section, not facts about each target',
                    ),
                    for (final signal in signals)
                      Text(
                        '${signal['label']}: ${signal['value']}${signal['source'] == null ? '' : ' · ${signal['source']}'}',
                      ),
                    if (regional['partial'] == true)
                      const Text('Partial property-source coverage.'),
                    if (regional['source'] is Map)
                      Text(
                        'Property context source: ${regional['source']['source'] ?? regional['source']['name'] ?? 'Not recorded'} · Source date: ${regional['source']['dataUpdatedAt'] ?? regional['source']['dataTimestamp'] ?? 'Not supplied'} · Retrieved/analyzed: ${regional['source']['generatedAt'] ?? regional['source']['fetchedAt'] ?? 'Not recorded'}',
                      ),
                  ] else
                    const Text(
                      'Nearby property era and other detailed context unavailable.',
                    ),
                  if (source != null) ...[
                    Text('Map source: ${source['name'] ?? 'OpenStreetMap'}'),
                    Text(
                      'Source snapshot: ${source['dataTimestamp'] ?? source['snapshotAt'] ?? 'Not supplied'}',
                    ),
                    Text(
                      'Retrieved: ${source['fetchedAt'] ?? source['retrievedAt'] ?? 'Not recorded'}',
                    ),
                    Text('Freshness: ${source['freshness'] ?? 'Not recorded'}'),
                  ],
                  if (workload != null)
                    const Text(
                      'Planning assumptions: 45 mapped targets/hour plus walking at 80 m/min over twice the supporting network length; minimum 15 minutes. The maintained model uses the same pace for flyers, door hangers and door-to-door outreach. No conversation duration is assumed. This is not a reviewed walking itinerary.',
                    ),
                  for (final limitation in data['limitations'] as List? ?? [])
                    Text('• $limitation'),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

typedef ZoneEvidenceLoader =
    Future<Map<String, dynamic>> Function(Map<String, dynamic> input);

/// A debounced, read-only preview. Geometry and account changes invalidate both
/// displayed data and outstanding responses; no save/fund action is invoked.
class ZoneIntelligencePreview extends StatefulWidget {
  const ZoneIntelligencePreview({
    super.key,
    required this.geometry,
    required this.campaignId,
    this.zoneId,
    this.initialEvidence,
    this.loader,
    this.identity,
  });
  final dynamic geometry;
  final String campaignId;
  final String? zoneId;
  final Map<String, dynamic>? initialEvidence;
  final ZoneEvidenceLoader? loader;
  final String Function()? identity;
  @override
  State<ZoneIntelligencePreview> createState() =>
      _ZoneIntelligencePreviewState();
}

class _ZoneIntelligencePreviewState extends State<ZoneIntelligencePreview> {
  Timer? _debounce;
  StreamSubscription<User?>? _auth;
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = false;
  int _revision = 0;
  late String _owner;
  bool _allowInitial = true;
  String get _identity {
    if (widget.campaignId.isEmpty) return "";
    if (widget.identity != null) return widget.identity!();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    return uid == null
        ? ''
        : '$uid/${BusinessWorkspaceSession.businessIdFor(uid)}';
  }

  @override
  void initState() {
    super.initState();
    _owner = _identity;
    if (widget.identity == null && widget.campaignId.isNotEmpty) {
      _auth = FirebaseAuth.instance.authStateChanges().listen((_) {
        if (mounted && _identity != _owner) {
          setState(() {
            _owner = _identity;
            _reset(useInitial: false);
          });
        }
      });
    }
    _reset();
  }

  @override
  void didUpdateWidget(ZoneIntelligencePreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    final changedOwner = _owner != _identity;
    if (CampaignAreaGeometry.savedDigest(widget.geometry) !=
            CampaignAreaGeometry.savedDigest(oldWidget.geometry) ||
        widget.campaignId != oldWidget.campaignId ||
        widget.zoneId != oldWidget.zoneId ||
        changedOwner) {
      _owner = _identity;
      _reset(useInitial: !changedOwner);
    }
  }

  void _reset({bool useInitial = true}) {
    if (!useInitial) _allowInitial = false;
    _revision++;
    _debounce?.cancel();
    _data =
        useInitial &&
            _allowInitial &&
            zoneEvidenceMatches(widget.initialEvidence, widget.geometry)
        ? widget.initialEvidence
        : null;
    _error = null;
    _loading = false;
    if (_data == null &&
        _owner.isNotEmpty &&
        widget.campaignId.isNotEmpty &&
        CampaignAreaGeometry.savedDigest(widget.geometry) != null) {
      _loading = true;
      _debounce = Timer(const Duration(milliseconds: 500), _load);
    }
  }

  Future<void> _load() async {
    final revision = _revision, identity = _owner;
    final digest = CampaignAreaGeometry.savedDigest(widget.geometry);
    final input = <String, dynamic>{
      'campaignId': widget.campaignId,
      'geometry': widget.geometry,
      if (widget.zoneId != null) 'zoneId': widget.zoneId,
    };
    try {
      final result =
          await (widget.loader ??
              (input) async {
                final response =
                    await FirebaseFunctions.instanceFor(region: 'us-east1')
                        .httpsCallable(
                          'getCampaignZoneIntelligence',
                          options: HttpsCallableOptions(
                            timeout: const Duration(seconds: 65),
                          ),
                        )
                        .call(input);
                return Map<String, dynamic>.from(response.data as Map);
              })(input);
      if (mounted && revision == _revision && identity == _identity) {
        setState(() {
          _data =
              result['geometryDigest'] == digest &&
                  zoneEvidenceMatches(result, widget.geometry)
              ? result
              : null;
          if (_data == null) {
            _error = 'Area changed. Analyze this boundary again.';
          }
        });
      }
    } catch (_) {
      if (mounted && revision == _revision && identity == _identity) {
        setState(() {
          _error =
              'Area evidence is temporarily unavailable. Your boundary has not changed.';
        });
      }
    } finally {
      if (mounted && revision == _revision && identity == _identity) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  void dispose() {
    _revision++;
    _debounce?.cancel();
    _auth?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_identity != _owner || _owner.isEmpty) {
      return const Text('Sign in to review area evidence.');
    }
    if (_data != null) {
      return ZoneIntelligenceSummary(data: _data!, geometry: widget.geometry);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _loading
              ? 'Analyzing this boundary…'
              : _error ?? 'Choose a complete boundary to review its evidence.',
        ),
        if (_loading) const LinearProgressIndicator(),
        if (_error != null)
          TextButton(
            onPressed: () => setState(() => _reset(useInitial: false)),
            child: const Text('Retry area analysis'),
          ),
        const Text('Execution route not yet verified'),
      ],
    );
  }
}
