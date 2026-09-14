import 'dart:typed_data';
import 'package:crypto/crypto.dart';

import 'package:flutter/material.dart';

class AuthenticatedMediaPreview extends StatefulWidget {
  const AuthenticatedMediaPreview({
    required this.load,
    required this.identity,
    required this.semanticLabel,
    this.fit = BoxFit.cover,
    this.compact = false,
    this.expectedSha256,
    this.onReady,
    super.key,
  });

  final Future<Uint8List?> Function() load;
  final Object identity;
  final String semanticLabel;
  final BoxFit fit;
  final bool compact;
  final String? expectedSha256;
  final VoidCallback? onReady;

  @override
  State<AuthenticatedMediaPreview> createState() =>
      _AuthenticatedMediaPreviewState();
}

class _AuthenticatedMediaPreviewState extends State<AuthenticatedMediaPreview> {
  late Future<Uint8List?> _future = widget.load();

  @override
  void didUpdateWidget(covariant AuthenticatedMediaPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.identity != widget.identity) _future = widget.load();
  }

  void _retry() => setState(() => _future = widget.load());

  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List?>(
    future: _future,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return Center(
          child: Semantics(
            label: 'Loading image preview',
            child: const SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        );
      }
      if (snapshot.hasError ||
          snapshot.data == null ||
          (widget.expectedSha256 != null &&
              sha256.convert(snapshot.data!).toString() !=
                  widget.expectedSha256)) {
        return Semantics(
          label: 'Preview unavailable',
          child: Center(
            child: widget.compact
                ? IconButton(
                    tooltip: 'Preview unavailable. Retry',
                    onPressed: _retry,
                    icon: const Icon(Icons.broken_image_outlined),
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.broken_image_outlined, size: 36),
                      const SizedBox(height: 4),
                      const Text('Preview unavailable'),
                      TextButton(onPressed: _retry, child: const Text('Retry')),
                    ],
                  ),
          ),
        );
      }
      return Image.memory(
        snapshot.data!,
        fit: widget.fit,
        semanticLabel: widget.semanticLabel,
        frameBuilder: (context, child, frame, synchronous) {
          if ((frame != null || synchronous) && widget.onReady != null) {
            final identity = widget.identity;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted && widget.identity == identity) {
                widget.onReady?.call();
              }
            });
          }
          return child;
        },
        errorBuilder: (_, _, _) => Semantics(
          label: 'Preview unavailable',
          child: Center(
            child: IconButton(
              tooltip: 'Preview unavailable. Retry',
              onPressed: _retry,
              icon: const Icon(Icons.broken_image_outlined),
            ),
          ),
        ),
      );
    },
  );
}
