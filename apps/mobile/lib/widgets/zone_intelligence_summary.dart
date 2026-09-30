import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../models/campaign_area_geometry.dart';
import '../services/business_workspace_service.dart';

bool zoneEvidenceMatches(Map? data, dynamic geometry) =>
    data?['version'] == 'ZoneIntelligenceV1' &&
    !(data?['mode'] == 'manual' &&
        data?['status'] != 'unavailable' &&
        data?['mappedTargetCount'] == 0 &&
        data?['workload'] == null &&
        data?['analysisRevision'] == null) &&
    data?['geometryDigest'] != null &&
    data?['geometryDigest'] == CampaignAreaGeometry.savedDigest(geometry);

String fieldWorkload(num minutes) {
  final total = minutes.round();
  return total >= 60 ? '${total ~/ 60} hr ${total % 60} min' : '$total min';
}

class ZoneIntelligenceSummary extends StatelessWidget {
  const ZoneIntelligenceSummary({
    super.key,
    required this.data,
    required this.geometry,
    this.comparisonReason,
  });
  final Map<String, dynamic> data;
  final dynamic geometry;

  /// Only an explicit server comparison may describe an alternate as weaker.
  final String? comparisonReason;

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
    final count = data['status'] == 'unavailable'
        ? null
        : data['mappedTargetCount'];
    final walking = data['walkingEvidence'] as Map?;
    final team = data['teamCapacityAnalysis'] as Map?;
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
    final theme = Theme.of(context);
    final categories = (mix?['categories'] as List? ?? [])
        .whereType<Map>()
        .toList();
    final era = signals
        .where(
          (s) =>
              RegExp('era|age', caseSensitive: false).hasMatch('${s['label']}'),
        )
        .toList();
    final usable = count is num && count > 0 && meters != null && meters > 0;
    final serviceFit = signals.any(
      (s) =>
          s['label'] == 'Service-area fit' &&
          s['value'] == 'Inside your saved service area',
    );
    final reason = !usable
        ? 'More mapping evidence is needed before this area can be recommended.'
        : comparisonReason == lowerFitReason
        ? 'This area is a weaker match than the top recommendation, but still has usable ${business ? 'business' : 'residential'} and street evidence.'
        : comparisonReason == equalFitReason
        ? 'This area has a similar match to the top recommendation, with usable ${business ? 'business' : 'residential'} and street evidence.'
        : 'Mapped ${business ? 'businesses' : 'homes'} and local streets support reviewing this area for your campaign.';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (data['status'] == 'partial')
          const Text(
            'Partial mapping evidence · observations, not a complete inventory',
          ),
        if (data['status'] == 'empty')
          const Text(
            'Analysis completed: no matching classified mapped targets',
          ),
        Text(
          count is num
              ? '$count mapped ${business ? 'business' : 'residential'} targets'
              : 'Mapped target count unavailable',
          style: theme.textTheme.titleLarge,
        ),
        if ((data['unclassifiedMappedFeatureCount'] as num? ?? 0) > 0)
          Text(
            '${data['unclassifiedMappedFeatureCount']} unclassified mapped buildings / addresses',
          ),
        if (mix != null) ...[
          for (final category in categories)
            Text(
              categories.length == 1 && category['count'] == count
                  ? propertyTypeLabel(category['label'].toString())
                  : '${category['count']} ${propertyTypeLabel(category['label'].toString()).toLowerCase()}',
              style: theme.textTheme.bodyLarge,
            ),
          if ((mix['unknownCount'] as num? ?? 0) > 0)
            Text(
              'Partial property detail · ${mix['unknownCount']} unspecified',
            ),
        ] else
          const Text('Property type unavailable'),
        if (data['selectedAreaPropertyFacts'] is Map) ...[
          const SizedBox(height: 12),
          const Text('Recorded properties inside this area'),
          Text(
            '${data['selectedAreaPropertyFacts']['knownTypeRecords']} of ${data['selectedAreaPropertyFacts']['insideRecords']} parcel records have a recorded type',
          ),
          Text(
            '${data['selectedAreaPropertyFacts']['knownYearRecords']} of ${data['selectedAreaPropertyFacts']['insideRecords']} parcel records have a usable construction year',
          ),
          if (data['selectedAreaPropertyFacts']['constructionEra'] != null)
            Text(
              'Recorded construction era: ${data['selectedAreaPropertyFacts']['constructionEra']}',
            ),
          const Text('Parcel points, not verified homes or delivery stops'),
          if (data['selectedAreaPropertyFacts']['complete'] == false)
            const Text('Property records: partial returned coverage'),
        ],
        const SizedBox(height: 16),
        const Text('Estimated field time'),
        Text(
          workload?['minutes'] is num
              ? '~${fieldWorkload(workload!['minutes'] as num)}'
              : 'Not established',
          style: theme.textTheme.headlineMedium,
        ),
        if (data['partialTargetEstimate'] is Map)
          Text(
            'Known-target subset: ~${fieldWorkload(data['partialTargetEstimate']['minutes'] as num)} for ${data['partialTargetEstimate']['supportedTargetCount']} street-supported targets including walking. Full area/team workload is incomplete.',
          ),
        if (workload != null)
          Text(
            workload['oneScaler'] == true
                ? 'One-Scaler planning estimate'
                : 'Exceeds the six-hour one-Scaler limit. Review smaller work areas.',
          ),
        if (walking?['walkingOnly'] == true && walking?['minutes'] is num) ...[
          Text(
            'Walking-only planning estimate: ~${fieldWorkload(walking!['minutes'] as num)}',
          ),
          const Text(
            'This does not establish full field workload or an execution route.',
          ),
        ],
        if (team?['marketerCount'] is num) ...[
          Text(
            'Team planning: ${team!['marketerCount']} marketers · ${team['sessionHours']} hr each',
          ),
          Text(
            team['coveragePattern'] == 'stay_together'
                ? 'Stay together: one shared coverage area. Headcount does not multiply unique coverage. Travel and total team elapsed time remain unknown.'
                : 'Split streets: complementary coverage must be planned within this area; an even split is not established. Travel and total team elapsed time remain unknown.',
          ),
        ],
        const SizedBox(height: 16),
        Text(
          meters == null
              ? 'Supporting streets unavailable'
              : '${meters.round()} m supporting streets',
        ),
        const SizedBox(height: 8),
        if (!business) ...[
          Text(
            'Nearby housing: ${era.isEmpty ? 'Unavailable' : 'Predominantly ${era.first['value']}'}',
          ),
          Text('Regional property context', style: theme.textTheme.bodySmall),
        ],
        if (regional?['partial'] == true)
          const Text('Partial property-source coverage'),
        const SizedBox(height: 16),
        Text(
          data['mode'] == 'recommended'
              ? 'Why Scaled Circle recommends this area'
              : 'What we found in this area',
          style: theme.textTheme.titleSmall,
        ),
        Text(
          data['mode'] == 'recommended'
              ? reason
              : usable
              ? 'Mapped ${business ? 'business' : 'residential'} features and local street evidence are available in your boundary.'
              : 'Mapping evidence is incomplete for this boundary.',
        ),
        if (serviceFit) const Text('Inside your saved service area.'),
        const SizedBox(height: 12),
        Text(
          'Execution route not yet verified',
          style: theme.textTheme.bodySmall,
        ),
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
                  if (data['selectedAreaPropertyFacts'] is Map)
                    Text(
                      'Property source: ${data['selectedAreaPropertyFacts']['source']} · scope: ${data['selectedAreaPropertyFacts']['scope']} · matching: ${data['selectedAreaPropertyFacts']['method']}',
                    ),
                  if (data['selectedAreaPropertyFacts'] is Map)
                    Text(
                      'Record source date: ${data['selectedAreaPropertyFacts']['dataUpdatedAt'] ?? 'Not supplied'} · Retrieved: ${data['selectedAreaPropertyFacts']['retrievedAt'] ?? 'Not recorded'} · Version: ${data['selectedAreaPropertyFacts']['sourceVersion'] ?? 'Not recorded'}',
                    ),
                  if (data['propertyMatching'] is Map)
                    Text(
                      'Footprint matching: ${data['propertyMatching']['matchedFootprints'] ?? 'Unavailable'} unique matches · ${data['propertyMatching']['ambiguousFootprints'] ?? 'Unavailable'} ambiguous footprints. Individual property ages are not attached to mapped buildings.',
                    ),
                  for (final component
                      in data['serviceSuitability'] as List? ?? [])
                    Text(
                      '${component['intent']}: ${component['rule']} · ${component['scope']} · planning assumption, not component condition or customer intent',
                    ),
                  for (final reason in data['reasons'] as List? ?? [])
                    Text('• $reason'),
                  if (comparisonReason != null) Text(comparisonReason!),
                  if (mix != null)
                    Text(
                      'Detailed mapped classification: ${mix['classifiedCount']} of $count; ${mix['unknownCount']} unspecified.',
                    ),
                  if (workload?['supportedTargetCount'] is num)
                    Text(
                      'Workload uses ${workload!['supportedTargetCount']} street-supported mapped targets.',
                    ),
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
                  if (data['workloadComponents'] is Map) ...[
                    Text(
                      'Target handling: ${(data['workloadComponents']['targetHandlingMinutes'] as num).toStringAsFixed(1)} min',
                    ),
                    Text(
                      'Advisory walking component: ${(data['workloadComponents']['walkingMinutes'] as num).toStringAsFixed(1)} min',
                    ),
                    Text(
                      data['workloadComponents']['completeAreaWorkload'] == true
                          ? 'Supported person-work: ${data['workloadComponents']['totalPersonMinutes']} min · total team elapsed time not established'
                          : 'Known-target subset: ${data['workloadComponents']['knownTargetSubtotalMinutes']} min including walking. Complete area/team workload is not established; unclassified observations are excluded.',
                    ),
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

const lowerFitReason =
    'This different eligible section has a lower Property Intelligence fit on the disclosed signals.';
const equalFitReason =
    'This is a different eligible section with the same supported Property Intelligence fit; the available signals do not distinguish a stronger fit.';

String propertyTypeLabel(String label) => switch (label) {
  'Detached' => 'Detached homes',
  'Attached/semi-detached' => 'Attached / semi-detached homes',
  'Multifamily/shared residential' => 'Multifamily / shared residential',
  'House (attachment unknown)' => 'Houses (type unspecified)',
  _ => label,
};

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
    this.teamCapacity,
  });
  final dynamic geometry;
  final String campaignId;
  final String? zoneId;
  final Map<String, dynamic>? initialEvidence;
  final ZoneEvidenceLoader? loader;
  final String Function()? identity;
  final Map<String, dynamic>? teamCapacity;
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
    final changedTeam =
        widget.teamCapacity.toString() != oldWidget.teamCapacity.toString();
    if (CampaignAreaGeometry.savedDigest(widget.geometry) !=
            CampaignAreaGeometry.savedDigest(oldWidget.geometry) ||
        widget.campaignId != oldWidget.campaignId ||
        widget.zoneId != oldWidget.zoneId ||
        changedTeam ||
        changedOwner) {
      _owner = _identity;
      _reset(useInitial: !changedOwner && !changedTeam);
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
      if (widget.teamCapacity != null) 'teamCapacity': widget.teamCapacity,
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
