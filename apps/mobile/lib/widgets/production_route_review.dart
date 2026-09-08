import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../config/app_environment.dart';
import 'smart_zone_geometry_map.dart';

Future<void> reviewProductionRouteAnalysis(
  BuildContext context,
  dynamic result,
) async {
  if (!AppEnvironmentConfig.isProduction ||
      result is! Map ||
      result['routeReviewRequired'] != true) {
    return;
  }
  final preview = Map<String, dynamic>.from(result['routePreview'] as Map);
  var checked = false;
  final approved = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: const Text('Review the assigned route'),
        content: SizedBox(
          width: 650,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SmartZoneGeometryMap(zones: [preview]),
                const SizedBox(height: 12),
                const Text(
                  'The line shows the route used for Route Coverage Estimate. '
                  'Review access restrictions before funding. Full base requires 80%; an offered bonus requires 95%. '
                  'No household count or property photos are used as completion proof.',
                ),
                CheckboxListTile(
                  value: checked,
                  onChanged: (v) => setDialogState(() => checked = v == true),
                  title: const Text(
                    'I reviewed this route for authorized public access.',
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Adjust territory'),
          ),
          FilledButton(
            onPressed: checked ? () => Navigator.pop(context, true) : null,
            child: const Text('Confirm route'),
          ),
        ],
      ),
    ),
  );
  if (approved == true) {
    await FirebaseFunctions.instanceFor(
      region: 'us-east1',
    ).httpsCallable('analyzeCampaignZone').call({
      'zoneId': result['zoneId'],
      'routeReviewDigest': result['routeReviewDigest'],
    });
  }
}
