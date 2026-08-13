import 'package:flutter_app/models/campaign_area_geometry.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

void main() {
  test('standalone drawing supports the exact campaign shape set', () {
    expect(CampaignAreaShape.values.map((shape) => shape.name), [
      'polygon',
      'rectangle',
      'circle',
      'triangle',
    ]);
  });

  test('rectangle uses the same normalized polygon geometry', () {
    final area = CampaignAreaGeometry.fromInput(
      CampaignAreaShape.rectangle,
      const [LatLng(38.9, -76.5), LatLng(39.0, -76.4)],
    );
    expect(area.length, 4);
    expect(area[1], const LatLng(38.9, -76.4));
    expect(
      CampaignAreaGeometry.isComplete(CampaignAreaShape.rectangle, area),
      true,
    );
  });

  test('circle is normalized to the campaign-compatible 48-point polygon', () {
    final area = CampaignAreaGeometry.fromInput(
      CampaignAreaShape.circle,
      const [LatLng(38.9, -76.5), LatLng(38.91, -76.5)],
    );
    expect(area.length, 48);
  });
}
