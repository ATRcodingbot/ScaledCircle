import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import 'package:latlong2/latlong.dart';
import 'dart:convert';

import 'package:http/http.dart' as http;
import '../../../models/campaign/campaign_location.dart';
import '../../../services/campaign/campaign_service.dart';

class CampaignLocationsScreen extends StatefulWidget {
  const CampaignLocationsScreen({
    super.key,
    required this.campaignReference,
    required this.campaignType,
  });

  final DocumentReference<Map<String, dynamic>> campaignReference;
  final String campaignType;

  @override
  State<CampaignLocationsScreen> createState() =>
      _CampaignLocationsScreenState();
}

class _CampaignLocationsScreenState extends State<CampaignLocationsScreen> {
  final CampaignService _campaignService = CampaignService();

  final TextEditingController _addressController = TextEditingController();

  final TextEditingController _instructionsController = TextEditingController();

  final TextEditingController _latitudeController = TextEditingController();

  final TextEditingController _longitudeController = TextEditingController();

  final TextEditingController _quantityController = TextEditingController(
    text: '1',
  );

  final MapController _mapController = MapController();

  static const LatLng _defaultCenter = LatLng(39.2904, -76.6122);

  bool _savingLocation = false;
  bool _finishing = false;
  bool _findingAddress = false;

  LatLng? _selectedPoint;

  @override
  void dispose() {
    _addressController.dispose();
    _instructionsController.dispose();
    _latitudeController.dispose();
    _longitudeController.dispose();
    _quantityController.dispose();

    _mapController.dispose();

    super.dispose();
  }

  CampaignLocationType get _defaultLocationType {
    switch (widget.campaignType) {
      case 'yard_sign_installation':
        return CampaignLocationType.yardSignInstallation;

      case 'dump_run':
        return CampaignLocationType.dumpPickup;

      case 'event_marketing':
        return CampaignLocationType.eventLocation;

      default:
        return CampaignLocationType.servicePoint;
    }
  }

  String get _screenTitle {
    switch (widget.campaignType) {
      case 'yard_sign_installation':
        return 'Yard Sign Locations';

      case 'dump_run':
        return 'Dump Run Locations';

      case 'event_marketing':
        return 'Event Location';

      default:
        return 'Campaign Locations';
    }
  }

  String get _introText {
    switch (widget.campaignType) {
      case 'yard_sign_installation':
        return 'Add each exact location where you want signs installed. '
            'Search an address or tap the map to place the sign precisely.';

      case 'dump_run':
        return 'Add the pickup location and the dump or disposal location. '
            'Search an address or place the exact locations on the map.';

      case 'event_marketing':
        return 'Add the exact event or venue location where the Scaler '
            'should work.';

      default:
        return 'Add exact locations for this campaign.';
    }
  }

  void _clearLocationForm() {
    _addressController.clear();
    _instructionsController.clear();
    _latitudeController.clear();
    _longitudeController.clear();
    _quantityController.text = '1';

    setState(() {
      _selectedPoint = null;
    });
  }

  void _setSelectedPoint(LatLng point) {
    setState(() {
      _selectedPoint = point;

      _latitudeController.text = point.latitude.toStringAsFixed(7);

      _longitudeController.text = point.longitude.toStringAsFixed(7);
    });
  }

  Future<void> _findAddress() async {
    if (_findingAddress) {
      return;
    }

    final address = _addressController.text.trim();

    if (address.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Enter an address first.')));

      return;
    }

    setState(() {
      _findingAddress = true;
    });

    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'q': address,
        'format': 'jsonv2',
        'limit': '1',
        'countrycodes': 'us',
        'addressdetails': '1',
      });

      final response = await http.get(
        uri,
        headers: {
          'User-Agent': 'ScaledCircle/1.0',
          'Accept': 'application/json',
        },
      );

      if (response.statusCode != 200) {
        throw Exception(
          'Address service returned status ${response.statusCode}.',
        );
      }

      final decoded = jsonDecode(response.body);

      if (decoded is! List || decoded.isEmpty) {
        throw Exception(
          'No matching address was found. '
          'Try including the city, state, and ZIP code.',
        );
      }

      final firstResult = decoded.first;

      if (firstResult is! Map) {
        throw Exception('The address service returned an invalid result.');
      }

      final latitude = double.tryParse(firstResult['lat']?.toString() ?? '');

      final longitude = double.tryParse(firstResult['lon']?.toString() ?? '');

      if (latitude == null || longitude == null) {
        throw Exception(
          'The address result did not contain valid coordinates.',
        );
      }

      final point = LatLng(latitude, longitude);

      if (!mounted) {
        return;
      }

      _setSelectedPoint(point);

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }

        try {
          _mapController.move(point, 17);
        } catch (_) {
          // Map may still be attaching during the first frame.
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Address found. Adjust the pin if needed.'),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to find address: $e')));
    } finally {
      if (mounted) {
        setState(() {
          _findingAddress = false;
        });
      }
    }
  }

  void _handleMainMapTap(TapPosition tapPosition, LatLng point) {
    _setSelectedPoint(point);
  }

  Future<void> _openPinPicker(List<CampaignLocation> existingLocations) async {
    LatLng? workingPoint = _selectedPoint;

    LatLng initialCenter = _defaultCenter;

    if (workingPoint != null) {
      initialCenter = workingPoint;
    } else {
      for (final location in existingLocations) {
        if (location.hasValidCoordinates) {
          initialCenter = LatLng(location.latitude, location.longitude);

          break;
        }
      }
    }

    final selected = await Navigator.push<LatLng>(
      context,
      MaterialPageRoute(
        builder: (pickerContext) {
          return StatefulBuilder(
            builder: (context, setPickerState) {
              final markers = <Marker>[];

              for (final location in existingLocations) {
                if (!location.hasValidCoordinates) {
                  continue;
                }

                markers.add(
                  Marker(
                    point: LatLng(location.latitude, location.longitude),
                    width: 40,
                    height: 40,
                    child: Icon(
                      _locationIcon(location.type),
                      color: Colors.blueGrey,
                      size: 30,
                    ),
                  ),
                );
              }

              if (workingPoint != null) {
                markers.add(
                  Marker(
                    point: workingPoint!,
                    width: 52,
                    height: 52,
                    child: const Icon(
                      Icons.location_pin,
                      color: Colors.red,
                      size: 48,
                    ),
                  ),
                );
              }

              return Scaffold(
                appBar: AppBar(
                  title: const Text('Drop Location Pin'),
                  centerTitle: true,
                ),
                body: Column(
                  children: [
                    Expanded(
                      child: FlutterMap(
                        options: MapOptions(
                          initialCenter: initialCenter,
                          initialZoom: 16,
                          onTap: (tapPosition, point) {
                            setPickerState(() {
                              workingPoint = point;
                            });
                          },
                        ),
                        children: [
                          TileLayer(
                            urlTemplate:
                                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            userAgentPackageName: 'com.scaledcircle.app',
                          ),
                          MarkerLayer(markers: markers),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          if (workingPoint == null)
                            const Text(
                              'Tap the map where the work should be performed.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontWeight: FontWeight.w600),
                            )
                          else
                            Column(
                              children: [
                                const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.location_on, size: 20),
                                    SizedBox(width: 6),
                                    Text(
                                      'Selected Location',
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '${workingPoint!.latitude.toStringAsFixed(6)}, '
                                  '${workingPoint!.longitude.toStringAsFixed(6)}',
                                ),
                              ],
                            ),
                          const SizedBox(height: 14),
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: ElevatedButton.icon(
                              onPressed: workingPoint == null
                                  ? null
                                  : () {
                                      Navigator.pop(
                                        pickerContext,
                                        workingPoint,
                                      );
                                    },
                              icon: const Icon(Icons.check),
                              label: const Text('Use This Location'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );

    if (!mounted || selected == null) {
      return;
    }

    _setSelectedPoint(selected);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      try {
        _mapController.move(selected, 17);
      } catch (_) {
        // Main map may still be attaching.
      }
    });
  }

  bool _validateLocationInput() {
    final address = _addressController.text.trim();

    final latitude = double.tryParse(_latitudeController.text.trim());

    final longitude = double.tryParse(_longitudeController.text.trim());

    if (address.isEmpty && (latitude == null || longitude == null)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter an address or choose a location on the map.'),
        ),
      );

      return false;
    }

    if (address.isNotEmpty && (latitude == null || longitude == null)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Find the address or place a map pin before saving.'),
        ),
      );

      return false;
    }

    if ((latitude == null) != (longitude == null)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Both latitude and longitude are required.'),
        ),
      );

      return false;
    }

    if (latitude != null && (latitude < -90 || latitude > 90)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Latitude must be between -90 and 90.')),
      );

      return false;
    }

    if (longitude != null && (longitude < -180 || longitude > 180)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Longitude must be between -180 and 180.'),
        ),
      );

      return false;
    }

    final quantity = int.tryParse(_quantityController.text.trim()) ?? 1;

    if (quantity < 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Quantity must be at least 1.')),
      );

      return false;
    }

    return true;
  }

  Future<void> _saveLocation() async {
    await _saveLocationWithType(_defaultLocationType);
  }

  Future<void> _saveLocationWithType(CampaignLocationType type) async {
    if (_savingLocation) {
      return;
    }

    if (!_validateLocationInput()) {
      return;
    }

    final address = _addressController.text.trim();

    final latitude = double.tryParse(_latitudeController.text.trim());

    final longitude = double.tryParse(_longitudeController.text.trim());

    final quantity = int.tryParse(_quantityController.text.trim()) ?? 1;

    setState(() {
      _savingLocation = true;
    });

    try {
      await _campaignService.createLocation(
        location: CampaignLocation(
          id: '',
          campaignId: widget.campaignReference.id,
          type: type,
          status: CampaignLocationStatus.pending,
          address: address.isEmpty ? null : address,
          latitude: latitude ?? 0,
          longitude: longitude ?? 0,
          instructions: _instructionsController.text.trim().isEmpty
              ? null
              : _instructionsController.text.trim(),
          quantity: quantity,
        ),
      );

      if (!mounted) {
        return;
      }

      _clearLocationForm();

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_savedLocationMessage(type))));
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to add location: $e')));
    } finally {
      if (mounted) {
        setState(() {
          _savingLocation = false;
        });
      }
    }
  }

  String _savedLocationMessage(CampaignLocationType type) {
    switch (type) {
      case CampaignLocationType.dumpPickup:
        return 'Pickup location added.';

      case CampaignLocationType.dumpDropoff:
        return 'Disposal location added.';

      case CampaignLocationType.yardSignInstallation:
        return 'Yard sign location added.';

      case CampaignLocationType.eventLocation:
        return 'Event location added.';

      default:
        return 'Location added.';
    }
  }

  Future<void> _showDumpLocationTypePicker() async {
    if (!_validateLocationInput()) {
      return;
    }

    final selected = await showModalBottomSheet<CampaignLocationType>(
      context: context,
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'What type of location is this?',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.inventory_2_outlined),
                title: const Text('Pickup Location'),
                subtitle: const Text('Where the Scaler picks up the material.'),
                onTap: () {
                  Navigator.pop(sheetContext, CampaignLocationType.dumpPickup);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Dump / Disposal Location'),
                subtitle: const Text('Where the material should be taken.'),
                onTap: () {
                  Navigator.pop(sheetContext, CampaignLocationType.dumpDropoff);
                },
              ),
              const SizedBox(height: 10),
            ],
          ),
        );
      },
    );

    if (!mounted || selected == null) {
      return;
    }

    await _saveLocationWithType(selected);
  }

  Future<void> _deleteLocation(CampaignLocation location) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Remove Location?'),
          content: Text(
            location.address != null && location.address!.trim().isNotEmpty
                ? 'Remove ${location.address}?'
                : 'Remove this location?',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Remove'),
            ),
          ],
        );
      },
    );

    if (!mounted || confirmed != true) {
      return;
    }

    try {
      await _campaignService.deleteLocation(location.id);

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Location removed.')));
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Unable to remove location: $e')));
    }
  }

  Future<void> _finishSetup(List<CampaignLocation> locations) async {
    if (_finishing) {
      return;
    }

    if (locations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Add at least one location before continuing.'),
        ),
      );

      return;
    }

    if (widget.campaignType == 'dump_run') {
      final hasPickup = locations.any(
        (location) => location.type == CampaignLocationType.dumpPickup,
      );

      final hasDropoff = locations.any(
        (location) => location.type == CampaignLocationType.dumpDropoff,
      );

      if (!hasPickup || !hasDropoff) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Dump runs require both a pickup location '
              'and a dump/disposal location.',
            ),
          ),
        );

        return;
      }
    }

    setState(() {
      _finishing = true;
    });

    try {
      final totalQuantity = locations.fold<int>(
        0,
        (previousValue, location) => previousValue + location.quantity,
      );

      await widget.campaignReference.update({
        'locationCount': locations.length,
        'locationQuantity': totalQuantity,
        'setupStatus': 'configured',
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) {
        return;
      }

      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to finish location setup: $e')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _finishing = false;
        });
      }
    }
  }

  String _locationTypeLabel(CampaignLocationType type) {
    switch (type) {
      case CampaignLocationType.yardSignInstallation:
        return 'Yard Sign';

      case CampaignLocationType.dumpPickup:
        return 'Pickup';

      case CampaignLocationType.dumpDropoff:
        return 'Dump / Disposal';

      case CampaignLocationType.eventLocation:
        return 'Event';

      case CampaignLocationType.materialPickup:
        return 'Material Pickup';

      case CampaignLocationType.materialDropoff:
        return 'Material Drop-off';

      case CampaignLocationType.servicePoint:
        return 'Location';
    }
  }

  IconData _locationIcon(CampaignLocationType type) {
    switch (type) {
      case CampaignLocationType.yardSignInstallation:
        return Icons.signpost_outlined;

      case CampaignLocationType.dumpPickup:
        return Icons.inventory_2_outlined;

      case CampaignLocationType.dumpDropoff:
        return Icons.delete_outline;

      case CampaignLocationType.eventLocation:
        return Icons.event_outlined;

      case CampaignLocationType.materialPickup:
        return Icons.store_outlined;

      case CampaignLocationType.materialDropoff:
        return Icons.local_shipping_outlined;

      case CampaignLocationType.servicePoint:
        return Icons.location_on_outlined;
    }
  }

  LatLng _mapCenterForLocations(List<CampaignLocation> locations) {
    if (_selectedPoint != null) {
      return _selectedPoint!;
    }

    for (final location in locations) {
      if (location.hasValidCoordinates) {
        return LatLng(location.latitude, location.longitude);
      }
    }

    return _defaultCenter;
  }

  List<Marker> _buildLocationMarkers(List<CampaignLocation> locations) {
    final markers = <Marker>[];

    for (final location in locations) {
      if (!location.hasValidCoordinates) {
        continue;
      }

      markers.add(
        Marker(
          point: LatLng(location.latitude, location.longitude),
          width: 44,
          height: 44,
          child: Icon(
            _locationIcon(location.type),
            color: Colors.blue,
            size: 32,
          ),
        ),
      );
    }

    if (_selectedPoint != null) {
      markers.add(
        Marker(
          point: _selectedPoint!,
          width: 50,
          height: 50,
          child: const Icon(Icons.location_pin, color: Colors.red, size: 46),
        ),
      );
    }

    return markers;
  }

  void _updatePointFromManualCoordinates() {
    final latitude = double.tryParse(_latitudeController.text.trim());

    final longitude = double.tryParse(_longitudeController.text.trim());

    if (latitude == null || longitude == null) {
      return;
    }

    if (latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180) {
      return;
    }

    final point = LatLng(latitude, longitude);

    setState(() {
      _selectedPoint = point;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      try {
        _mapController.move(point, 17);
      } catch (_) {
        // Map may still be attaching.
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<CampaignLocation>>(
      stream: _campaignService.watchCampaignLocations(
        campaignId: widget.campaignReference.id,
      ),
      builder: (context, snapshot) {
        final locations = snapshot.data ?? [];

        return Scaffold(
          appBar: AppBar(title: Text(_screenTitle), centerTitle: true),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(_introText, style: const TextStyle(fontSize: 16)),

                const SizedBox(height: 20),

                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Add Location',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),

                        const SizedBox(height: 14),

                        TextFormField(
                          controller: _addressController,
                          textInputAction: TextInputAction.search,
                          onFieldSubmitted: (_) {
                            _findAddress();
                          },
                          decoration: const InputDecoration(
                            labelText: 'Address',
                            hintText: '123 Main St, Baltimore, MD',
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.location_on_outlined),
                          ),
                        ),

                        const SizedBox(height: 12),

                        SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton.icon(
                            onPressed: _findingAddress ? null : _findAddress,
                            icon: _findingAddress
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.search),
                            label: Text(
                              _findingAddress
                                  ? 'Finding Address...'
                                  : 'Find Address',
                            ),
                          ),
                        ),

                        const SizedBox(height: 18),

                        const Text(
                          'Exact Location',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),

                        const SizedBox(height: 8),

                        const Text(
                          'Tap the map to fine-tune the exact work location.',
                        ),

                        const SizedBox(height: 12),

                        SizedBox(
                          height: 300,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: FlutterMap(
                              mapController: _mapController,
                              options: MapOptions(
                                initialCenter: _mapCenterForLocations(
                                  locations,
                                ),
                                initialZoom: 14,
                                onTap: _handleMainMapTap,
                              ),
                              children: [
                                TileLayer(
                                  urlTemplate:
                                      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                                  userAgentPackageName: 'com.scaledcircle.app',
                                ),
                                MarkerLayer(
                                  markers: _buildLocationMarkers(locations),
                                ),
                              ],
                            ),
                          ),
                        ),

                        const SizedBox(height: 12),

                        SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: OutlinedButton.icon(
                            onPressed: () {
                              _openPinPicker(locations);
                            },
                            icon: const Icon(Icons.open_in_full),
                            label: Text(
                              _selectedPoint == null
                                  ? 'Open Full Map & Drop Pin'
                                  : 'Adjust Pin on Full Map',
                            ),
                          ),
                        ),

                        if (_selectedPoint != null) ...[
                          const SizedBox(height: 10),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey.shade300),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.location_pin),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    '${_selectedPoint!.latitude.toStringAsFixed(6)}, '
                                    '${_selectedPoint!.longitude.toStringAsFixed(6)}',
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Clear pin',
                                  onPressed: () {
                                    setState(() {
                                      _selectedPoint = null;

                                      _latitudeController.clear();

                                      _longitudeController.clear();
                                    });
                                  },
                                  icon: const Icon(Icons.close),
                                ),
                              ],
                            ),
                          ),
                        ],

                        const SizedBox(height: 14),

                        ExpansionTile(
                          tilePadding: EdgeInsets.zero,
                          title: const Text('Manual Coordinates'),
                          subtitle: const Text('Optional fallback'),
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: TextFormField(
                                    controller: _latitudeController,
                                    keyboardType:
                                        const TextInputType.numberWithOptions(
                                          decimal: true,
                                          signed: true,
                                        ),
                                    decoration: const InputDecoration(
                                      labelText: 'Latitude',
                                      border: OutlineInputBorder(),
                                    ),
                                    onChanged: (_) {
                                      _updatePointFromManualCoordinates();
                                    },
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: TextFormField(
                                    controller: _longitudeController,
                                    keyboardType:
                                        const TextInputType.numberWithOptions(
                                          decimal: true,
                                          signed: true,
                                        ),
                                    decoration: const InputDecoration(
                                      labelText: 'Longitude',
                                      border: OutlineInputBorder(),
                                    ),
                                    onChanged: (_) {
                                      _updatePointFromManualCoordinates();
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),

                        const SizedBox(height: 14),

                        TextFormField(
                          controller: _quantityController,
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText:
                                widget.campaignType == 'yard_sign_installation'
                                ? 'Signs at this location'
                                : 'Quantity',
                            border: const OutlineInputBorder(),
                          ),
                        ),

                        const SizedBox(height: 14),

                        TextFormField(
                          controller: _instructionsController,
                          maxLines: 3,
                          decoration: InputDecoration(
                            labelText:
                                widget.campaignType == 'yard_sign_installation'
                                ? 'Placement Instructions'
                                : 'Location Instructions',
                            hintText:
                                widget.campaignType == 'yard_sign_installation'
                                ? 'Example: Front-left side of driveway.'
                                : null,
                            border: const OutlineInputBorder(),
                          ),
                        ),

                        const SizedBox(height: 16),

                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton.icon(
                            onPressed: _savingLocation
                                ? null
                                : widget.campaignType == 'dump_run'
                                ? _showDumpLocationTypePicker
                                : _saveLocation,
                            icon: _savingLocation
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.add_location_alt_outlined),
                            label: Text(
                              widget.campaignType == 'dump_run'
                                  ? 'Add Pickup or Dump Location'
                                  : 'Add Location',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Configured Locations',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    Chip(label: Text(locations.length.toString())),
                  ],
                ),

                const SizedBox(height: 12),

                if (snapshot.connectionState == ConnectionState.waiting &&
                    !snapshot.hasData)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: CircularProgressIndicator(),
                    ),
                  ),

                if (snapshot.hasError)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        'Unable to load locations: '
                        '${snapshot.error}',
                      ),
                    ),
                  ),

                if (locations.isEmpty &&
                    snapshot.connectionState != ConnectionState.waiting)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(18),
                      child: Text('No locations have been added yet.'),
                    ),
                  ),

                ...locations.map((location) {
                  final hasAddress =
                      location.address != null &&
                      location.address!.trim().isNotEmpty;

                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: ListTile(
                      leading: CircleAvatar(
                        child: Icon(_locationIcon(location.type)),
                      ),
                      title: Text(
                        hasAddress
                            ? location.address!
                            : '${location.latitude.toStringAsFixed(5)}, '
                                  '${location.longitude.toStringAsFixed(5)}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 4),
                          Text(_locationTypeLabel(location.type)),
                          if (location.quantity > 1)
                            Text('Quantity: ${location.quantity}'),
                          if (location.instructions != null &&
                              location.instructions!.trim().isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(location.instructions!),
                          ],
                        ],
                      ),
                      trailing: IconButton(
                        tooltip: 'Remove location',
                        onPressed: () {
                          _deleteLocation(location);
                        },
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ),
                  );
                }),

                const SizedBox(height: 24),

                SizedBox(
                  height: 55,
                  child: ElevatedButton.icon(
                    onPressed: _finishing
                        ? null
                        : () {
                            _finishSetup(locations);
                          },
                    icon: _finishing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check_circle_outline),
                    label: Text(
                      _finishing ? 'Saving...' : 'Finish Location Setup',
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
