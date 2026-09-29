import 'dart:js_interop';
import 'package:web/web.dart' as web;

Future<void> openMapPrint(String pngBase64) async {
  if (!RegExp(r'^[A-Za-z0-9+/=]+$').hasMatch(pngBase64)) {
    throw const FormatException('Invalid map image.');
  }
  final html =
      '<!doctype html><html><head><title>Scaled Circle campaign map record</title><style>@page{size:landscape;margin:10mm}body{margin:0;font-family:sans-serif}img{width:100%;height:auto;max-height:95vh;object-fit:contain}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print Map</button><img alt="Saved campaign map record" src="data:image/png;base64,$pngBase64"></body></html>';
  final blob = web.Blob(
    [html.toJS as web.BlobPart].toJS,
    web.BlobPropertyBag(type: 'text/html'),
  );
  final url = web.URL.createObjectURL(blob);
  final opened = web.window.open(url, '_blank');
  if (opened == null) {
    web.URL.revokeObjectURL(url);
    throw StateError('Allow this print tab to open, then try Print Map again.');
  }
  // Keep the URL for the opened print tab; it contains only this authorized PNG.
}
