import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../widgets/mapped_address_field.dart';

class CleanupLocationResult {
  final LatLng point;
  final String address;

  const CleanupLocationResult({required this.point, required this.address});
}

class CleanupLocationPickerScreen extends StatefulWidget {
  const CleanupLocationPickerScreen({super.key});

  @override
  State<CleanupLocationPickerScreen> createState() =>
      _CleanupLocationPickerScreenState();
}

class _CleanupLocationPickerScreenState
    extends State<CleanupLocationPickerScreen> {
  final MapController _mapController = MapController();

  final TextEditingController searchController = TextEditingController();

  static const LatLng _defaultCenter = LatLng(39.2904, -76.6122);

  LatLng? _selectedPoint;

  String? _selectedAddress;

  @override
  void dispose() {
    searchController.dispose();

    _mapController.dispose();

    super.dispose();
  }

  void handleMapTap(TapPosition tapPosition, LatLng point) {
    setState(() {
      _selectedPoint = point;

      _selectedAddress = "Selected map location";
    });
  }

  void confirmLocation() {
    if (_selectedPoint == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("Select a location first.")));

      return;
    }

    Navigator.pop(
      context,
      CleanupLocationResult(
        point: _selectedPoint!,

        address: _selectedAddress ?? "Selected location",
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Select Cleanup Location")),

      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,

            options: MapOptions(
              initialCenter: _defaultCenter,

              initialZoom: 14,

              onTap: handleMapTap,
            ),

            children: [
              TileLayer(
                urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

                userAgentPackageName: "com.scaledcircle.mobile",
              ),

              if (_selectedPoint != null)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _selectedPoint!,

                      width: 50,

                      height: 50,

                      child: const Icon(
                        Icons.location_pin,

                        color: Colors.red,

                        size: 50,
                      ),
                    ),
                  ],
                ),
            ],
          ),

          Positioned(
            top: 15,

            left: 15,

            right: 15,

            child: Material(
              elevation: 5,

              borderRadius: BorderRadius.circular(12),

              child: MappedAddressField(
                controller: searchController,
                labelText: 'Job Site Address',
                hintText: 'Enter address, then search map',
                onSelected: (suggestion) {
                  final point = LatLng(
                    suggestion.latitude,
                    suggestion.longitude,
                  );
                  setState(() {
                    _selectedPoint = point;
                    _selectedAddress = suggestion.fullAddress;
                  });
                  _mapController.move(point, 17);
                },
              ),
            ),
          ),

          Positioned(
            bottom: 25,

            left: 20,

            right: 20,

            child: ElevatedButton.icon(
              onPressed: confirmLocation,

              icon: const Icon(Icons.check),

              label: const Text("Confirm Location"),

              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 55),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
