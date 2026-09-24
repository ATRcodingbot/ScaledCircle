import 'package:flutter/material.dart';
import '../services/platform_billing_service.dart';

/// An amount-only quote. A fresh campaign-bound quote is still required by
/// the existing funding action; displaying this cannot authorize funding.
class CampaignPlanningCost extends StatefulWidget {
  const CampaignPlanningCost({
    super.key,
    required this.workerBudget,
    required this.load,
  });
  final double workerBudget;
  final Future<CampaignCostQuote> Function(double) load;
  @override
  State<CampaignPlanningCost> createState() => _CampaignPlanningCostState();
}

class _CampaignPlanningCostState extends State<CampaignPlanningCost> {
  late Future<CampaignCostQuote> _quote;
  void _load() {
    _quote = widget
        .load(widget.workerBudget)
        .timeout(const Duration(seconds: 25));
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(CampaignPlanningCost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ((oldWidget.workerBudget * 100).round() !=
        (widget.workerBudget * 100).round()) {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<CampaignCostQuote>(
    future: _quote,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Planning total unavailable. Your draft is preserved.'),
            TextButton(
              onPressed: () => setState(_load),
              child: const Text('Retry planning quote'),
            ),
          ],
        );
      }
      if (snapshot.connectionState != ConnectionState.done) {
        return const Text('Checking planning total…');
      }
      final quote = snapshot.data!;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Planning total: \$${quote.estimatedTotal.toStringAsFixed(2)}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Text(
            'Maximum Scaler pay: \$${quote.workerCompensation.toStringAsFixed(2)}',
          ),
          Text(
            'Platform fee (${quote.platformFeePercentLabel}): \$${quote.platformFee.toStringAsFixed(2)}',
          ),
          const Text(
            'For the saved compensation amount only. This does not price or promise coverage of the entire territory. Route, material and completion scope remain separate. Funding requires a new campaign-bound review.',
          ),
        ],
      );
    },
  );
}
