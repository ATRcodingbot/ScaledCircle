import 'package:flutter/material.dart';
import '../services/address_search_service.dart';
import 'mapped_address_field.dart';

/// Search text is never saved as geography. The owner confirms server-resolved
/// selections when saving the surrounding profile form.
class BusinessGeographyEditor extends StatelessWidget {
  const BusinessGeographyEditor({
    super.key,
    required this.baseController,
    required this.areaController,
    required this.base,
    required this.areas,
    required this.onBaseChanged,
    required this.onAreasChanged,
    required this.search,
    this.legacyAreas = const [],
    this.enabled = true,
  });
  final TextEditingController baseController, areaController;
  final AddressSuggestion? base;
  final List<AddressSuggestion> areas;
  final ValueChanged<AddressSuggestion?> onBaseChanged;
  final ValueChanged<List<AddressSuggestion>> onAreasChanged;
  final Future<List<AddressSuggestion>> Function(String, bool) search;
  final List<String> legacyAreas;
  final bool enabled;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        'Where is your Business based?',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const SizedBox(height: 8),
      const Text(
        'A city or ZIP is enough. An exact street address stays private.',
      ),
      const SizedBox(height: 12),
      MappedAddressField(
        key: const Key('business-base-search'),
        controller: baseController,
        labelText: 'Business base',
        hintText: 'Search a city, ZIP or address',
        enabled: enabled,
        searchAddresses: (q) => search(q, false),
        onChanged: (_) => onBaseChanged(null),
        onSelected: onBaseChanged,
        validator: (_) =>
            base == null ? 'Search and select your Business base.' : null,
      ),
      if (base != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('Selected: ${base!.fullAddress}'),
        ),
      const SizedBox(height: 24),
      Text(
        'Where do you provide services?',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const SizedBox(height: 8),
      const Text(
        'Choose up to eight cities, counties or ZIPs. You’ll choose a separate marketing area for each campaign.',
      ),
      if (legacyAreas.isNotEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(
            'Previously entered: ${legacyAreas.join('; ')}. Search and confirm the matching areas below. Your existing profile stays unchanged until you save.',
          ),
        ),
      Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          for (final area in areas)
            InputChip(
              key: ValueKey('service-area-${area.canonicalId}'),
              label: Text(area.fullAddress, softWrap: true),
              onDeleted: enabled
                  ? () => onAreasChanged(
                      areas
                          .where((a) => a.canonicalId != area.canonicalId)
                          .toList(),
                    )
                  : null,
            ),
        ],
      ),
      const SizedBox(height: 12),
      MappedAddressField(
        key: const Key('business-area-search'),
        controller: areaController,
        labelText: 'Add service area',
        hintText: 'Search a city, county or ZIP',
        enabled: enabled && areas.length < 8,
        searchAddresses: (q) => search(q, true),
        onSelected: (area) {
          if (areas.any((a) => a.canonicalId == area.canonicalId)) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('That service area is already selected.'),
              ),
            );
          } else if (areas.length < 8) {
            onAreasChanged([...areas, area]);
          }
          areaController.clear();
        },
        validator: (_) =>
            areas.isEmpty ? 'Select at least one service area.' : null,
      ),
      const SizedBox(height: 24),
    ],
  );
}
