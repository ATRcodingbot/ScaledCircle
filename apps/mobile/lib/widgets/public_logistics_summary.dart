import 'package:flutter/material.dart';

/// Pre-assignment view; exact details are supplied only by the Job Room authority.
class PublicLogisticsSummary extends StatelessWidget {
  const PublicLogisticsSummary({super.key, required this.logistics});
  final Map<String, dynamic> logistics;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        logistics['materialsRequired'] == true
            ? 'Material pickup or delivery required'
            : 'No physical materials required',
      ),
      if (logistics['postalCode'] is String)
        Text('Approximate area: ZIP ${logistics['postalCode']}'),
      if (logistics['approximateDistanceMiles'] is num)
        Text(
          'About ${logistics['approximateDistanceMiles']} miles from the work area',
        ),
      if (logistics['estimatedTravelMinutes'] is num)
        Text(
          'About ${logistics['estimatedTravelMinutes']} minutes added travel',
        ),
      if (logistics['materialsRequired'] == true)
        const Text(
          'Exact pickup and return details are provided in the Job Room after assignment.',
        ),
      if (logistics['accessStatus'] == 'restricted_or_uncertain')
        const Text(
          'Access may be restricted. Confirm authorized access before entering.',
        ),
      const Text(
        'Use authorized, serviceable areas only. Never bypass gates or enter private property without permission.',
      ),
    ],
  );
}
