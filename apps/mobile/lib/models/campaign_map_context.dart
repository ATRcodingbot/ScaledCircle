import 'package:latlong2/latlong.dart';
import '../services/address_search_service.dart';

/// Navigation context only. Search results never become saved campaign work
/// until the Business explicitly saves a drawn/reviewed zone.
class CampaignMapContext {
  AddressSuggestion? selectedArea;

  List<Map<String, dynamic>> get searchBoundary =>
      selectedArea?.geometry
          .map((p) => Map<String, dynamic>.from(p))
          .toList() ??
      [];

  LatLng? get center => selectedArea == null
      ? null
      : LatLng(selectedArea!.latitude, selectedArea!.longitude);

  Map<String, double>? get bounds => selectedArea?.bounds;
}
