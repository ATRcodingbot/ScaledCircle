import 'dart:async';
import 'package:flutter/material.dart';
import '../models/campaign_funding_presentation.dart';

class CampaignFundingStatus extends StatefulWidget {
  const CampaignFundingStatus({
    super.key,
    required this.load,
    required this.authorityKey,
    required this.currentAuthorityKey,
    this.authorityChanges,
  });
  final Future<Map<String, dynamic>> Function() load;
  final String authorityKey;
  final String Function() currentAuthorityKey;
  final Stream<Object?>? authorityChanges;

  @override
  State<CampaignFundingStatus> createState() => _CampaignFundingStatusState();
}

class _CampaignFundingStatusState extends State<CampaignFundingStatus>
    with WidgetsBindingObserver {
  CampaignFundingPresentation? _state;
  bool _loading = true;
  int _request = 0;
  Timer? _expiry;
  StreamSubscription<Object?>? _authoritySubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _authoritySubscription = widget.authorityChanges?.listen((_) {
      if (widget.authorityKey != widget.currentAuthorityKey()) {
        _request++;
        _expiry?.cancel();
        setState(() {
          _state = null;
          _loading = false;
        });
      }
    });
    _refresh();
  }

  @override
  void didUpdateWidget(CampaignFundingStatus oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.authorityKey != widget.authorityKey) _refresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refresh();
    } else {
      _expiry?.cancel();
      _request++;
      setState(() {
        _state = null;
        _loading = false;
      });
    }
  }

  Future<void> _refresh() async {
    _expiry?.cancel();
    final request = ++_request;
    final requestedAt = DateTime.now();
    final authority = widget.authorityKey;
    setState(() {
      _state = null;
      _loading = true;
    });
    CampaignFundingPresentation? result;
    try {
      result = CampaignFundingPresentation.fromServer(
        await widget.load().timeout(const Duration(seconds: 15)),
        campaignId: authority.split('/').last,
      );
    } catch (_) {
      // A failed or timed-out read never falls back to cached funding readiness.
    }
    if (!mounted || request != _request) return;
    if (authority != widget.currentAuthorityKey()) result = null;
    setState(() {
      _state = result;
      _loading = false;
    });
    if (result != null) {
      _expiry = Timer(
        Duration(
          milliseconds:
              (15000 - DateTime.now().difference(requestedAt).inMilliseconds)
                  .clamp(0, 15000),
        ),
        () {
          if (mounted) {
            setState(() {
              _state = null;
            });
          }
        },
      );
    }
  }

  @override
  void dispose() {
    _expiry?.cancel();
    _authoritySubscription?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.authorityKey == widget.currentAuthorityKey()
        ? _state
        : null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _loading
                  ? 'Checking campaign funding…'
                  : state?.title ?? 'Campaign status unavailable',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              state?.detail ??
                  'Work readiness is not confirmed. Refresh to check the current server state.',
            ),
            for (final obligation in state?.obligations ?? <String>[]) ...[
              const SizedBox(height: 8),
              Text(obligation),
            ],
            TextButton(
              onPressed: _loading ? null : _refresh,
              child: const Text('Refresh status'),
            ),
          ],
        ),
      ),
    );
  }
}
