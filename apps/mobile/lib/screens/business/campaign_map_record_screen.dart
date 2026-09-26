import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_map/flutter_map.dart';
import '../../services/business_operations_service.dart';
import '../../services/binary_artifact_download.dart';
import '../../services/map_record_print.dart';
import '../../services/business_workspace_service.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../widgets/smart_zone_geometry_map.dart';

class CampaignMapRecordScreen extends StatefulWidget {
  const CampaignMapRecordScreen({
    super.key,
    required this.campaignId,
    this.loadRecord,
    this.tileProvider,
    this.exportRecord,
  });
  final Future<Map<String, dynamic>> Function()? loadRecord;
  final TileProvider? tileProvider;
  final Future<void> Function(Uint8List bytes, bool print)? exportRecord;
  final String campaignId;
  @override
  State<CampaignMapRecordScreen> createState() =>
      _CampaignMapRecordScreenState();
}

class _CampaignMapRecordScreenState extends State<CampaignMapRecordScreen> {
  final boundary = GlobalKey();
  final tileReset = StreamController<void>.broadcast();
  final tiles = <String, TileImage>{};
  Map<String, dynamic>? record;
  String? error;
  bool busy = false, ready = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(milliseconds: 500), (_) {
      tiles.removeWhere((_, tile) => tile.cancelLoading.isCompleted);
      final next =
          tiles.isNotEmpty &&
          tiles.values.every((t) => t.readyToDisplay && !t.loadError);
      if (mounted && next != ready) setState(() => ready = next);
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    tileReset.close();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final uid = widget.loadRecord == null
          ? FirebaseAuth.instance.currentUser!.uid
          : '';
      final value = widget.loadRecord != null
          ? await widget.loadRecord!()
          : await BusinessOperationsService().call(
              BusinessWorkspaceSession.businessIdFor(uid),
              'campaignMapRecord',
              {'campaignId': widget.campaignId},
            );
      if (mounted) setState(() => record = value);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> capture(bool print) async {
    setState(() => busy = true);
    try {
      await WidgetsBinding.instance.endOfFrame;
      final image =
          await (boundary.currentContext!.findRenderObject()
                  as RenderRepaintBoundary)
              .toImage(pixelRatio: 2);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (data == null) throw StateError('Map image unavailable.');
      final bytes = data.buffer.asUint8List();
      if (widget.exportRecord != null) {
        await widget.exportRecord!(bytes, print);
      } else if (print) {
        await printMapPng(base64Encode(bytes));
      } else {
        await downloadBinaryArtifact(
          filename: 'campaign-map-${widget.campaignId}.png',
          bytes: bytes,
          mimeType: 'image/png',
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = record;
    final zones = operationRows(r?['zones']);
    final territory = smartZonePoints(r?['territory']);
    final points = [
      ...territory,
      ...zones.expand((z) => smartZonePoints(z['serviceArea'])),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Campaign map record')),
      body: SingleChildScrollView(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'Free map record from saved geography. Exporting does not fund, assign or change campaign work.',
              ),
            ),
            if (error != null) SelectableText(error!),
            if (r == null && error == null) const CircularProgressIndicator(),
            if (r != null) ...[
              Wrap(
                spacing: 12,
                children: [
                  FilledButton(
                    onPressed: !ready || busy ? null : () => capture(false),
                    child: const Text('Download Map'),
                  ),
                  OutlinedButton(
                    onPressed: !ready || busy ? null : () => capture(true),
                    child: const Text('Print Map'),
                  ),
                ],
              ),
              if (!ready)
                const Text(
                  'Waiting for map background. If tiles fail, exports remain unavailable.',
                ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: RepaintBoundary(
                  key: boundary,
                  child: Container(
                    width: 900,
                    color: Colors.white,
                    padding: const EdgeInsets.all(20),
                    child: DefaultTextStyle(
                      style: const TextStyle(color: Colors.black, fontSize: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r['campaignName'],
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            '${r['businessName']} · Reference ${r['campaignId']}',
                          ),
                          Text(
                            'Exported ${r['exportedAt']} · Campaign status: ${r['status']}',
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            height: 580,
                            child: FlutterMap(
                              options: MapOptions(
                                onMapReady: () => WidgetsBinding.instance
                                    .addPostFrameCallback((_) {
                                      if (mounted) tileReset.add(null);
                                    }),
                                initialCameraFit: CameraFit.bounds(
                                  bounds: LatLngBounds.fromPoints(points),
                                  padding: const EdgeInsets.all(32),
                                ),
                                interactionOptions: const InteractionOptions(
                                  flags: InteractiveFlag.none,
                                ),
                              ),
                              children: [
                                TileLayer(
                                  tileProvider: widget.tileProvider,
                                  reset: tileReset.stream,
                                  urlTemplate:
                                      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                                  userAgentPackageName: 'com.scaledcircle.app',
                                  tileBuilder: (context, widget, tile) {
                                    tiles[tile.coordinates.toString()] = tile;
                                    return widget;
                                  },
                                ),
                                PolygonLayer(
                                  polygons: [
                                    if (territory.length >= 3)
                                      Polygon(
                                        points: territory,
                                        color: Colors.transparent,
                                        borderColor: Colors.black,
                                        borderStrokeWidth: 3,
                                      ),
                                    for (var i = 0; i < zones.length; i++)
                                      Polygon(
                                        points: smartZonePoints(
                                          zones[i]['serviceArea'],
                                        ),
                                        color: smartZoneColor(
                                          i,
                                        ).withValues(alpha: .15),
                                        borderColor: smartZoneColor(i),
                                        borderStrokeWidth: 3,
                                        label: '${i + 1}',
                                        labelStyle: const TextStyle(
                                          color: Colors.black,
                                          fontSize: 20,
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const Text(
                            '© OpenStreetMap contributors · https://www.openstreetmap.org/copyright',
                          ),
                          Text(
                            'Solid black: saved territory. Colored boundaries: ${zones.length} saved zones.',
                          ),
                          Text(r['notice']),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
