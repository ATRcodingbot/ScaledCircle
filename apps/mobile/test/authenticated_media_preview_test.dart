import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/widgets/authenticated_media_preview.dart';

void main() {
  testWidgets('reloads bytes when the media identity changes', (tester) async {
    const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZ7hG3sAAAAASUVORK5CYII=';
    final first = base64Decode(png);
    final second = base64Decode(png);

    Widget preview(Object identity, Uint8List bytes) => MaterialApp(
      home: AuthenticatedMediaPreview(
        identity: identity,
        semanticLabel: 'Exact preview',
        load: () async => bytes,
      ),
    );

    await tester.pumpWidget(preview('asset-a:revision-a', first));
    await tester.pump();
    expect(
      (tester.widget<Image>(find.byType(Image)).image as MemoryImage).bytes,
      same(first),
    );

    await tester.pumpWidget(preview('asset-b:revision-b', second));
    await tester.pump();
    expect(
      (tester.widget<Image>(find.byType(Image)).image as MemoryImage).bytes,
      same(second),
    );
  });
}
