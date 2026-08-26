import 'dart:convert';

class ZoneDisplayIdentity {
  const ZoneDisplayIdentity({
    required this.authoritativeId,
    required this.ordinal,
    required this.label,
    required this.styleKey,
    required this.sourceIndex,
  });

  final String authoritativeId;
  final int ordinal;
  final String label;
  final int styleKey;
  final int sourceIndex;
}

final _canonicalZoneName = RegExp(r'^zone\s+(\d+)$', caseSensitive: false);

List<ZoneDisplayIdentity> resolveZoneDisplayIdentities(
  List<Map<String, dynamic>> zones,
) {
  final candidates = <_ZoneIdentityCandidate>[
    for (var index = 0; index < zones.length; index++)
      _ZoneIdentityCandidate.from(zones[index], index),
  ];
  final ordered = [...candidates]
    ..sort((first, second) {
      final firstOrdinal = first.preferredOrdinal;
      final secondOrdinal = second.preferredOrdinal;
      if (firstOrdinal != null && secondOrdinal != null) {
        final ordinalResult = firstOrdinal.compareTo(secondOrdinal);
        if (ordinalResult != 0) return ordinalResult;
      } else if (firstOrdinal != null) {
        return -1;
      } else if (secondOrdinal != null) {
        return 1;
      }
      return first.stableKey.compareTo(second.stableKey);
    });
  final usedOrdinals = <int>{};
  final resolved = <int, ZoneDisplayIdentity>{};
  var nextOrdinal = 1;
  for (final candidate in ordered) {
    var ordinal = candidate.preferredOrdinal;
    if (ordinal == null || ordinal < 1 || usedOrdinals.contains(ordinal)) {
      while (usedOrdinals.contains(nextOrdinal)) {
        nextOrdinal++;
      }
      ordinal = nextOrdinal;
    }
    usedOrdinals.add(ordinal);
    final numericName = candidate.nameOrdinal;
    final label =
        candidate.rawName != null &&
            (numericName == null || numericName == ordinal)
        ? candidate.rawName!
        : 'Zone $ordinal';
    resolved[candidate.sourceIndex] = ZoneDisplayIdentity(
      authoritativeId: candidate.authoritativeId,
      ordinal: ordinal,
      label: label,
      styleKey: ordinal,
      sourceIndex: candidate.sourceIndex,
    );
  }
  return [for (var index = 0; index < zones.length; index++) resolved[index]!];
}

ZoneDisplayIdentity resolveSingleZoneDisplayIdentity(
  Map<String, dynamic> zone, {
  int fallbackOrdinal = 1,
}) {
  final copy = Map<String, dynamic>.from(zone);
  if (_ZoneIdentityCandidate.from(copy, 0).preferredOrdinal == null) {
    copy['zoneNumber'] = fallbackOrdinal;
  }
  return resolveZoneDisplayIdentities([copy]).single;
}

class _ZoneIdentityCandidate {
  const _ZoneIdentityCandidate({
    required this.authoritativeId,
    required this.preferredOrdinal,
    required this.nameOrdinal,
    required this.rawName,
    required this.sourceIndex,
    required this.stableKey,
  });

  factory _ZoneIdentityCandidate.from(
    Map<String, dynamic> zone,
    int sourceIndex,
  ) {
    final rawName = _firstText(zone, const [
      'zoneName',
      'name',
      'label',
      'title',
    ]);
    final nameMatch = rawName == null
        ? null
        : _canonicalZoneName.firstMatch(rawName);
    final nameOrdinal = nameMatch == null
        ? null
        : int.tryParse(nameMatch.group(1)!);
    final explicitOrdinal = _firstPositiveInteger(zone, const [
      'zoneNumber',
      'displayOrdinal',
      'zoneOrder',
      'planOrder',
    ]);
    final authoritativeId =
        _firstText(zone, const ['zoneId', 'id', 'documentId']) ??
        _stableZoneData(zone);
    return _ZoneIdentityCandidate(
      authoritativeId: authoritativeId,
      preferredOrdinal: explicitOrdinal ?? nameOrdinal,
      nameOrdinal: nameOrdinal,
      rawName: rawName,
      sourceIndex: sourceIndex,
      stableKey:
          '${(explicitOrdinal ?? nameOrdinal ?? 999999).toString().padLeft(6, '0')}:$authoritativeId',
    );
  }

  final String authoritativeId;
  final int? preferredOrdinal;
  final int? nameOrdinal;
  final String? rawName;
  final int sourceIndex;
  final String stableKey;
}

String? _firstText(Map<String, dynamic> zone, List<String> fields) {
  for (final field in fields) {
    final value = zone[field]?.toString().trim();
    if (value != null && value.isNotEmpty) return value;
  }
  return null;
}

int? _firstPositiveInteger(Map<String, dynamic> zone, List<String> fields) {
  for (final field in fields) {
    final value = zone[field];
    final parsed = value is num
        ? value.toInt()
        : int.tryParse(value?.toString() ?? '');
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

String _stableZoneData(Map<String, dynamic> zone) {
  final stable = <String, dynamic>{
    if (zone['smartZonePlanId'] != null)
      'smartZonePlanId': zone['smartZonePlanId'],
    if (zone['serverZoneGeometryDigest'] != null)
      'serverZoneGeometryDigest': zone['serverZoneGeometryDigest'],
    if (zone['geometry'] != null) 'geometry': zone['geometry'],
    if (zone['serviceArea'] != null) 'serviceArea': zone['serviceArea'],
    if (zone['createdAt'] != null) 'createdAt': zone['createdAt'].toString(),
  };
  return jsonEncode(stable);
}
