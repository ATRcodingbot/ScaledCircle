import 'dart:async';

import 'package:flutter/material.dart';

/// Mounts a visible root before native Firebase initialization can fail or stall.
class IosStartupGate extends StatefulWidget {
  const IosStartupGate({
    super.key,
    required this.initialize,
    required this.child,
    this.timeout = const Duration(seconds: 30),
  });

  final Future<void> Function() initialize;
  final Widget child;
  final Duration timeout;

  @override
  State<IosStartupGate> createState() => _IosStartupGateState();
}

class _IosStartupGateState extends State<IosStartupGate> {
  Future<void>? _inFlight;
  bool _ready = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    setState(() => _failed = false);
    // A timeout cannot cancel native initialization. Retry joins that same
    // invocation until it settles, instead of starting a competing default app.
    final pending = _inFlight ??= Future<void>.sync(widget.initialize);
    pending.then<void>(
      (_) {
        if (identical(_inFlight, pending)) _inFlight = null;
      },
      onError: (Object _, StackTrace _) {
        if (identical(_inFlight, pending)) _inFlight = null;
      },
    );
    try {
      await pending.timeout(widget.timeout);
      if (!mounted) return;
      setState(() => _ready = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          debugPrint('ScaledCircle startup: application_frame_rendered');
        }
      });
    } catch (error) {
      // Never log exception messages: provider errors can contain private data.
      debugPrint(
        error is TimeoutException
            ? 'ScaledCircle startup: initialization_timeout'
            : 'ScaledCircle startup: initialization_failed',
      );
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_ready) return widget.child;
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('ScaledCircle', style: TextStyle(fontSize: 24)),
                  const SizedBox(height: 20),
                  if (_failed) ...[
                    const Text(
                      'ScaledCircle could not start. Please try again.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _start, child: const Text('Retry')),
                  ] else ...[
                    const CircularProgressIndicator(),
                    const SizedBox(height: 12),
                    const Text('Starting ScaledCircle…'),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
