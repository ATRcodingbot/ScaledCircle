import 'dart:async';
import 'package:flutter/material.dart';
import '../../config/app_environment.dart';
import '../../services/secure_function_service.dart';
import '../../widgets/campaign_card_header.dart';
import '../../widgets/scaler_wallet_metrics.dart';

/// All amounts and state transitions come from one server read snapshot.
class ScalerWalletScreen extends StatefulWidget {
  const ScalerWalletScreen({
    super.key,
    this.embedded = false,
    this.preview = false,
    this.loadSummary,
    this.staging = AppEnvironmentConfig.isStaging,
  });
  final bool embedded;
  final bool preview;
  final bool staging;
  final Future<Map<String, dynamic>> Function()? loadSummary;
  @override
  State<ScalerWalletScreen> createState() => _ScalerWalletScreenState();
}

class _ScalerWalletScreenState extends State<ScalerWalletScreen>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = false;
  bool _foreground = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_foreground) _load();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground) _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data =
          await (widget.loadSummary?.call() ??
                  const SecureFunctionService().call(
                    functionName: 'getScalerEarningsV1',
                    data: const {},
                  ))
              .timeout(const Duration(seconds: 20));
      for (final field in [
        'availableCents',
        'lifetimeCents',
        'awaitingReviewCents',
        'payoutPendingCents',
      ]) {
        if (data[field] is! int || (data[field] as int) < 0) {
          throw StateError('Incomplete earnings response');
        }
      }
      if (data['currency'] != 'usd' ||
          data['environment'] != (widget.staging ? 'staging' : 'production')) {
        throw StateError('Earnings environment mismatch');
      }
      if (mounted) setState(() => _data = data);
    } catch (_) {
      if (mounted) {
        setState(() {
          _data = null;
          _error =
              "We couldn't load your earnings. Your balance has not changed.";
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.preview) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Earnings',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              if (_data != null) ...[
                Text(
                  earningsMoney(_data!['availableCents'] as int),
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Text('Available Balance'),
                const SizedBox(height: 8),
                Text(
                  _data!['reviewAmountUnknown'] == true
                      ? 'Submitted work needs a payment assessment.'
                      : '${earningsMoney(_data!['awaitingReviewCents'] as int)} awaiting Business review',
                ),
              ] else if (_loading)
                const LinearProgressIndicator()
              else
                Text(_error ?? 'Earnings are temporarily unavailable.'),
              TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const ScalerWalletScreen(),
                  ),
                ),
                child: const Text('View earnings'),
              ),
            ],
          ),
        ),
      );
    }
    final body = _error != null
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _loading ? null : _load,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          )
        : _data == null
        ? const Center(child: CircularProgressIndicator())
        : _content(_data!);
    if (widget.embedded) return body;
    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: body,
    );
  }

  Widget _content(Map<String, dynamic> data) {
    final activity = (data['activity'] as List? ?? const []).whereType<Map>();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          if (widget.staging) ...[
            Text(
              'Staging · Test funds only',
              style: Theme.of(context).textTheme.labelSmall,
            ),
            const SizedBox(height: 8),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    earningsMoney(data['availableCents'] as int),
                    key: const ValueKey('available-balance'),
                    style: const TextStyle(
                      fontSize: 44,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const Text(
                    'Available Balance',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  const Text('Approved money in your Wallet.'),
                  const SizedBox(height: 16),
                  Text(
                    (data['cashout'] as Map?)?['message'] as String? ??
                        'Cash out is not available for this account yet.',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          ScalerWalletMetrics(
            awaitingReviewCents: data['awaitingReviewCents'] as int,
            reviewAmountUnknown: data['reviewAmountUnknown'] == true,
            payoutPendingCents: data['payoutPendingCents'] as int,
            lifetimeCents: data['lifetimeCents'] as int,
          ),
          const SizedBox(height: 28),
          Text(
            'Recent Activity',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          if (activity.isEmpty)
            const Text(
              'Approved payments and work awaiting review will appear here.',
            ),
          for (final item in activity) _activity(item),
          if (data['activityHasMore'] == true)
            const Text('Showing your most recent 100 activities.'),
        ],
      ),
    );
  }

  Widget _activity(Map item) {
    final kind = item['kind'];
    final pending = kind == 'awaiting_review';
    final cents = item['amountCents'] as int?;
    final amount = cents == null
        ? 'Amount pending review'
        : '${kind == 'approved' ? '+' : ''}${earningsMoney(cents)}${pending ? ' expected' : ''}';
    final status = switch (kind) {
      'approved' => 'Approved',
      'awaiting_review' => 'Awaiting Business Review',
      'payout_pending' => 'Payout Pending',
      'payout_completed' => 'Paid out',
      _ => 'Payout needs attention',
    };
    final at = item['at'] as int?;
    final coverage = item['coveragePercentage'] as num?;
    final base = item['baseCents'] as int?;
    final bonus = item['bonusCents'] as int?;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (at != null)
              Text(
                MaterialLocalizations.of(
                  context,
                ).formatShortDate(DateTime.fromMillisecondsSinceEpoch(at)),
              ),
            const SizedBox(height: 6),
            Text(
              campaignDisplayName(item['title'] as String? ?? 'Campaign work'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              amount,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            Text(status),
            if (pending && coverage != null)
              Text('${coverage.toStringAsFixed(2)}% Route Coverage Estimate'),
            // Do not display an equation that contradicts a historical estimate.
            // This only selects explanatory copy; it never calculates money state.
            if (pending &&
                base != null &&
                bonus != null &&
                cents == base + bonus)
              Text(
                '${earningsMoney(base)} base + ${earningsMoney(bonus)} bonus',
              ),
            if (pending &&
                base != null &&
                bonus != null &&
                cents != base + bonus)
              const Text('Previous estimate. Final payment requires review.'),
            if (pending && item['technicalReview'] == true)
              const Text('The review must resolve your expected payment.'),
          ],
        ),
      ),
    );
  }
}
