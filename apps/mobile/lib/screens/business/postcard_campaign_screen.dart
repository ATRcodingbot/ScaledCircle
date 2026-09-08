import 'dart:async';
import 'postcard_creation_screen.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_environment.dart';
import '../../services/postcard_fulfillment_service.dart';
import '../../services/physical_marketing_service.dart';
import '../../services/binary_artifact_download.dart';
import '../../services/private_pdf_picker.dart';
import '../../widgets/authenticated_media_preview.dart';

class PostcardCampaignScreen extends StatefulWidget {
  const PostcardCampaignScreen({
    super.key,
    this.admin = false,
    this.service,
    this.physical,
  });
  final bool admin;
  final PostcardGateway? service;
  final PhysicalMarketingGateway? physical;
  @override
  State<PostcardCampaignScreen> createState() => _PostcardCampaignScreenState();
}

class _PostcardCampaignScreenState extends State<PostcardCampaignScreen> {
  late final _service = widget.service ?? PostcardFulfillmentService();
  late final _physical = widget.physical ?? PhysicalMarketingService();
  Map<String, dynamic>? _data;
  String? _error;
  bool _busy = false;
  Timer? _timer;
  bool get _available =>
      AppEnvironmentConfig.isStaging || widget.service != null;
  Map<String, dynamic> _map(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : {};
  List<Map<String, dynamic>> _list(dynamic v) => (v as List? ?? [])
      .whereType<Map>()
      .map((x) => Map<String, dynamic>.from(x))
      .toList();
  String _money(dynamic n) =>
      n is num ? '\$${(n / 100).toStringAsFixed(2)}' : 'Not confirmed';
  @override
  void initState() {
    super.initState();
    if (_available) {
      _load();
      _timer = Timer.periodic(const Duration(seconds: 30), (_) {
        if (!_busy && ModalRoute.of(context)?.isCurrent == true) {
          _load(quiet: true);
        }
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    try {
      final data = await _service.call('workspace', {'admin': widget.admin});
      if (mounted) {
        setState(() {
          _data = data;
          if (!quiet) _error = null;
        });
      }
    } catch (_) {
      if (mounted && !quiet) {
        setState(() => _error = 'Postcards could not load. Please retry.');
      }
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      await _load();
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e
              .toString()
              .replaceFirst(RegExp(r'^\[[^\]]+\]\s*'), '')
              .replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Map<String, String>?> _form(
    String title,
    Map<String, String> fields, {
    String? acknowledgment,
    String? optionalAcknowledgment,
    String button = 'Save',
  }) async {
    final controllers = fields.map(
      (k, v) => MapEntry(k, TextEditingController(text: v)),
    );
    var checked = false;
    final route = DialogRoute<Map<String, String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final e in controllers.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: TextField(
                        controller: e.value,
                        maxLines: e.key.contains('route') ? 4 : 1,
                        decoration: InputDecoration(labelText: e.key),
                      ),
                    ),
                  if (acknowledgment != null || optionalAcknowledgment != null)
                    CheckboxListTile(
                      value: checked,
                      onChanged: (v) => setLocal(() => checked = v == true),
                      title: Text(acknowledgment ?? optionalAcknowledgment!),
                      controlAffinity: ListTileControlAffinity.leading,
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back'),
            ),
            FilledButton(
              onPressed: acknowledgment != null && !checked
                  ? null
                  : () => Navigator.pop(context, {
                      ...controllers.map((k, v) => MapEntry(k, v.text.trim())),
                      if (optionalAcknowledgment != null)
                        '_optional': checked.toString(),
                    }),
              child: Text(button),
            ),
          ],
        ),
      ),
    );
    final result = await Navigator.of(context, rootNavigator: true).push(route);
    // The pop result arrives before the exit animation removes the TextFields.
    await route.completed;
    for (final c in controllers.values) {
      c.dispose();
    }
    return result;
  }

  Future<void> _create() => _design(null);

  Future<void> _design(Map<String, dynamic>? order) async {
    await Navigator.of(context).push(
      MaterialPageRoute<bool>(
        builder: (_) => PostcardCreationScreen(
          service: _service,
          physical: _physical,
          workspace: _map(_data?['physical']),
          order: order,
        ),
      ),
    );
    await _load();
  }

  Future<void> _approveDesign(
    Map<String, dynamic> order,
    Map<String, dynamic> material,
  ) async {
    if (order['mailingPending'] == true) {
      await _design(order);
      return;
    }
    final version = _map(material['version']),
        artifact = _map(version['artifact']);
    var checked = false;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, local) => AlertDialog(
          title: const Text('Review your mailpiece'),
          content: SizedBox(
            width: 760,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final proof in _list(artifact['proofs']))
                    SizedBox(
                      height: 300,
                      child: AuthenticatedMediaPreview(
                        identity: proof['storagePath'],
                        semanticLabel: 'Mailpiece side ${proof['side']}',
                        fit: BoxFit.contain,
                        load: () => _physical.bytes(
                          proof['storagePath'].toString(),
                          maximumBytes: 5 * 1024 * 1024,
                        ),
                      ),
                    ),
                  const Text(
                    'Review both sides, your Business details and the QR destination. ScaledCircle will confirm the mailing routes and final quote before you pay.',
                  ),
                  CheckboxListTile(
                    value: checked,
                    onChanged: (v) => local(() => checked = v == true),
                    title: const Text(
                      'I approve this exact design for production.',
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Back'),
            ),
            FilledButton(
              onPressed: checked ? () => Navigator.pop(context, true) : null,
              child: const Text('Approve & request quote'),
            ),
          ],
        ),
      ),
    );
    if (accepted == true) {
      await _run(() async {
        await _physical.approve(
          material['materialId'].toString(),
          version['versionId'].toString(),
        );
        await _service.call('requestQuote', {
          'orderId': order['orderId'],
          'materialId': material['materialId'],
          'versionId': version['versionId'],
        });
      });
    }
  }

  Future<void> _pay(Map<String, dynamic> order) async {
    final q = _map(order['quote']);
    final accepted = await _form(
      'Review quote — ${_money(q['totalCents'])}',
      {},
      acknowledgment:
          'I approve the ${q['quantity']} pieces and listed routes, the exact approved design, and the cancellation terms shown on this order.',
      button: 'Pay ScaledCircle — TEST',
    );
    if (accepted == null) return;
    await _run(() async {
      final response = await _service.call('checkout', {
        'orderId': order['orderId'],
        'quoteId': q['quoteId'],
        'artifactHash': order['artifactHash'],
        'acceptTerms': true,
      });
      final url = Uri.parse(response['url'].toString());
      if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
        throw Exception(
          'Checkout could not open. Reopen this order to use the same payment.',
        );
      }
    });
  }

  int _cents(String? input) {
    final value = num.tryParse(input ?? '');
    if (value == null ||
        value < 0 ||
        (value * 100 - (value * 100).round()).abs() > 0.00001) {
      throw Exception('Enter a valid dollar amount.');
    }
    return (value * 100).round();
  }

  Future<void> _quote(Map<String, dynamic> order) async {
    final v = await _form(
      'Confirm quote · Fulfillment & Creative is automatically 20% of printing + postage',
      {
        'USPS routes (ZIP, route, count, residential/all)': '',
        'Printer / vendor': '',
        'Print specification': '6 × 11, two sides, CMYK, 0.125 inch bleed',
        'Printer quote / USPS route evidence reference': '',
        'Printing customer price (USD)': '',
        'Actual estimated print cost incl vendor tax (USD)': '',
        'Confirmed USPS rate per piece (USD)': '',
        'Postage total (USD)': '',
        'Estimated handling cost (USD)': '0',
        'Customer tax (USD)': '0',
        'Stock thickness (inches)': '',
        'Single piece weight (oz)': '',
        'USPS verification date (YYYY-MM-DD)': '',
        'Estimated mailing window': '',
      },
      acknowledgment: order['simulation'] == true
          ? 'I reviewed uploaded originals and final print files for image quality, safe text placement and clear mailing panel. This is a software simulation. Counts, stock and local costs are illustrative; no USPS route verification, printer quote or physical mailing is claimed.'
          : 'I reviewed uploaded originals and final print files for image quality, safe text placement and clear mailing panel. I checked current USPS rates, complete route counts, exclusions and daily ZIP limits; the physical stock is flexible, uniformly thick and eligible; print and handling costs are confirmed. No mailing date is guaranteed.',
      button: 'Confirm final quote',
    );
    if (v == null) return;
    await _run(() async {
      final routes = v['USPS routes (ZIP, route, count, residential/all)']!
          .split('\n')
          .where((s) => s.trim().isNotEmpty)
          .map((line) {
            final a = line.split(',').map((s) => s.trim()).toList();
            if (a.length != 4) {
              throw Exception(
                'Use ZIP, route, count, residential/all on each line.',
              );
            }
            return {
              'zip': a[0],
              'route': a[1],
              'quantity': int.parse(a[2]),
              'delivery': a[3],
            };
          })
          .toList();
      await _service.call('confirmQuote', {
        'orderId': order['orderId'],
        'artworkReviewed': true,
        'routes': routes,
        'vendor': v['Printer / vendor'],
        'printSpecification': v['Print specification'],
        'routeEvidenceReference':
            v['Printer quote / USPS route evidence reference'],
        'printingCents': _cents(v['Printing customer price (USD)']),
        'printCostCents': _cents(
          v['Actual estimated print cost incl vendor tax (USD)'],
        ),
        'postageRateCents': _cents(v['Confirmed USPS rate per piece (USD)']),
        'postageCents': _cents(v['Postage total (USD)']),
        'postageCostCents': _cents(v['Postage total (USD)']),
        'handlingCostCents': _cents(v['Estimated handling cost (USD)']),
        'taxCents': _cents(v['Customer tax (USD)']),
        'stockThicknessInches': double.parse(v['Stock thickness (inches)']!),
        'pieceWeightOz': double.parse(v['Single piece weight (oz)']!),
        'uspsVerifiedOn': v['USPS verification date (YYYY-MM-DD)'],
        'estimate': v['Estimated mailing window'],
        'simulationAcknowledged': order['simulation'] == true,
        'uspsVerified': order['simulation'] != true,
        'mailpieceVerified': order['simulation'] != true,
        'stockFlexible': true,
        'costsConfirmed': order['simulation'] != true,
      });
    });
  }

  Future<void> _advance(Map<String, dynamic> order, String next) async {
    final v = await _form(
      'Update fulfillment',
      {
        'Evidence record ID (where required)': '',
        if (next == 'MAILED')
          'Mail acceptance date (YYYY-MM-DD)': DateTime.now()
              .toIso8601String()
              .substring(0, 10),
      },
      acknowledgment: order['simulation'] == true
          ? 'This is a software simulation. No physical printing or mailing is claimed.'
          : 'I confirm the physical step was completed and the evidence belongs to this order.',
      button: 'Confirm update',
    );
    if (v == null) return;
    await _run(() async {
      await _service.call('advance', {
        'orderId': order['orderId'],
        'status': next,
        'simulation': order['simulation'] == true,
        if (next == 'MAILED')
          'mailDate': v['Mail acceptance date (YYYY-MM-DD)'],
        if (v.values.first.isNotEmpty) 'evidenceId': v.values.first,
      });
    });
  }

  Future<void> _download(
    Map<String, dynamic> order, {
    int? originalIndex,
  }) async => _run(() async {
    final result = await _service.call('artifact', {
      'orderId': order['orderId'],
      'admin': widget.admin,
      'originalIndex': ?originalIndex,
    });
    await downloadBinaryArtifact(
      filename: result['filename'].toString(),
      bytes: base64Decode(result['base64'].toString()),
      mimeType: result['contentType']?.toString() ?? 'application/pdf',
    );
  });
  Future<void> _uploadEvidence(Map<String, dynamic> order) async {
    final kind = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Private fulfillment receipt'),
        children: [
          for (final choice in const {
            'printer_confirmation': 'Printer order confirmation',
            'printer_receipt': 'Printer receipt',
            'usps_receipt': 'USPS acceptance / payment receipt',
            'mailing_documents': 'USPS mailing documents',
          }.entries)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, choice.key),
              child: Text(choice.value),
            ),
        ],
      ),
    );
    if (kind == null) return;
    await _run(() async {
      final bytes = await pickPrivatePdf();
      if (bytes == null) return;
      await _service.call('evidence', {
        'orderId': order['orderId'],
        'kind': kind,
        'base64': base64Encode(bytes),
      });
    });
  }

  Future<void> _recordCosts(Map<String, dynamic> order) async {
    final v = await _form(
      'Record actual fulfillment costs',
      {
        'Printing incl vendor tax (USD)': '',
        'USPS postage (USD)': '',
        'Handling (USD)': '0',
        'Other fees (USD)': '0',
      },
      acknowledgment: order['simulation'] == true
          ? 'Simulation costs only; no physical expense is claimed.'
          : 'These are actual costs supported by retained receipts.',
    );
    if (v == null) return;
    await _run(() async {
      await _service.call('costs', {
        'orderId': order['orderId'],
        'actualPrintCents': _cents(v['Printing incl vendor tax (USD)']),
        'actualPostageCents': _cents(v['USPS postage (USD)']),
        'actualHandlingCents': _cents(v['Handling (USD)']),
        'actualFeesCents': _cents(v['Other fees (USD)']),
      });
    });
  }

  Future<void> _hold(Map<String, dynamic> order) async {
    final holding = order['heldFromStatus'] != null;
    final v = await _form(
      holding ? 'Resolve fulfillment hold' : 'Hold fulfillment',
      {'Review note': ''},
      acknowledgment: holding
          ? 'The issue is resolved. Return only to the last verified step; do not repeat printing or mailing.'
          : 'Stop fulfillment until this issue is resolved.',
    );
    if (v == null) return;
    await _run(() async {
      await _service.call('advance', {
        'orderId': order['orderId'],
        'status': holding ? order['heldFromStatus'] : 'ON_HOLD',
        'note': v['Review note'],
        'resolveHold': holding,
        'simulation': order['simulation'] == true,
      });
    });
  }

  Future<void> _refund(Map<String, dynamic> order) async {
    final v = await _form(
      'Reconcile confirmed TEST refund',
      {'Existing Stripe refund ID': ''},
      acknowledgment:
          'I reviewed the cancellation terms and completed the appropriate refund in the Stripe TEST dashboard. This action verifies it; it does not create a refund.',
    );
    if (v == null) return;
    await _run(() async {
      await _service.call('refund', {
        'orderId': order['orderId'],
        'refundId': v.values.first,
      });
    });
  }

  Widget _card(Map<String, dynamic> order) {
    final q = _map(order['quote']),
        ops = _map(order['operations']),
        materials = _list(
          _map(_data?['physical'])['materials'],
        ).where((m) => m['campaignId'] == order['campaignId']).toList();
    final status = order['status'].toString();
    const steps = [
      'PAID',
      'PRINT_READY',
      'ORDERED_FOR_PRINT',
      'READY_FOR_PICKUP',
      'PRINT_RECEIVED',
      'USPS_PREPARATION',
      'MAILED',
      'COMPLETED',
    ];
    const labels = [
      'Paid',
      'Print ready',
      'Ordered for print',
      'Ready for pickup',
      'Print received',
      'USPS preparation',
      'Mailed',
      'Completed',
    ];
    final step = steps.indexOf(status);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              order['name']?.toString() ?? 'Neighborhood Postcards',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(order['customerStatus']?.toString() ?? status),
            if (order['simulation'] == true)
              const Text('TEST simulation — no physical printing or mailing'),
            Text(
              order['mailingPending'] == true
                  ? 'Mailing area chosen after design approval'
                  : '${order['targetArea']} · ${order['zip']}',
            ),
            if (q.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('${q['quantity']} pieces · ${q['estimate']}'),
              for (final route in _list(q['routes']))
                Text(
                  '${route['zip']} ${route['route']} · ${route['quantity']} ${route['delivery'] == 'residential' ? 'residential addresses' : 'addresses'}',
                ),
              Text(
                'Printing: ${_money(q['printingCents'])}\nUSPS Postage: ${_money(q['postageCents'])}\nScaledCircle Fulfillment & Creative${q['feePolicy'] != null ? ' (20%)' : ''}: ${_money(q['fulfillmentCents'])}\nTax: ${_money(q['taxCents'])}',
              ),
              Text(
                'Total ${_money(q['totalCents'])}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(q['cancellationPolicy'].toString()),
            ],
            if (order['mailedAt'] != null)
              Text(
                '${order['simulation'] == true ? 'Simulated mailing' : 'Mailed'} on ${order['mailDate'] ?? order['mailedAt']}',
              ),
            if (order['refundCents'] != null)
              Text(
                'Refund confirmed: ${_money(order['refundCents'])} of ${_money(order['paidCents'])}',
              ),
            if (widget.admin) ...[
              const Divider(),
              if (order['uploadReview'] != null)
                const Text(
                  'Uploaded artwork: review original image quality, safe text placement and the final mailing panel before quoting.',
                ),
              for (final source in _list(order['uploadSources']))
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => _download(
                          order,
                          originalIndex: source['index'] as int,
                        ),
                  child: Text(
                    'Download original artwork ${(source['index'] as int) + 1}',
                  ),
                ),
              Text(
                'Business: ${order['businessName'] ?? 'Business workspace'}',
              ),
              Text(
                'Mailing method: Neighborhood Mail · Created ${order['createdAt'] ?? 'Not available'}',
              ),
              if (order['paidCents'] != null)
                Text('Customer paid: ${_money(order['paidCents'])} TEST'),
              Text(
                'Internal stage: ${step >= 0 ? labels[step] : order['customerStatus']}',
              ),
              if (ops.isNotEmpty)
                Text(
                  'Vendor: ${ops['vendor']}\nEstimated print ${_money(ops['printCostCents'])} · postage ${_money(ops['postageCostCents'])}\nEstimated margin ${_money(ops['estimatedGrossMarginCents'])}\nActual margin ${_money(ops['actualGrossMarginCents'])}',
                ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (status == 'QUOTE_REQUESTED')
                    FilledButton(
                      onPressed: _busy ? null : () => _quote(order),
                      child: const Text('Confirm quote'),
                    ),
                  if (step >= 0 && step < steps.length - 1)
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () => _advance(order, steps[step + 1]),
                      child: Text('Mark ${labels[step + 1].toLowerCase()}'),
                    ),
                  TextButton(
                    onPressed: () => launchUrl(
                      Uri.parse(
                        'https://www.usps.com/business/every-door-direct-mail.htm',
                      ),
                      mode: LaunchMode.externalApplication,
                    ),
                    child: const Text('USPS mailing steps & forms'),
                  ),
                  TextButton(
                    onPressed: _busy ? null : () => _uploadEvidence(order),
                    child: const Text('Attach private receipt'),
                  ),
                  if (order['paidCents'] != null)
                    TextButton(
                      onPressed: _busy ? null : () => _recordCosts(order),
                      child: const Text('Record actual costs'),
                    ),
                  if ((step >= 0 && step < 6) ||
                      order['heldFromStatus'] != null)
                    TextButton(
                      onPressed: _busy ? null : () => _hold(order),
                      child: Text(
                        order['heldFromStatus'] != null
                            ? 'Resolve hold'
                            : 'Hold fulfillment',
                      ),
                    ),
                  if (status == 'CANCEL_REQUESTED')
                    TextButton(
                      onPressed: _busy ? null : () => _refund(order),
                      child: const Text('Review & reconcile refund'),
                    ),
                ],
              ),
              for (final receipt in _list(order['evidence']))
                SelectableText(
                  '${receipt['label']} · ${receipt['evidenceId']}',
                ),
              const Text(
                'Use the USPS EDDM tool to select complete routes, prepare facing slips and PS Form 3587, apply do-not-deliver exclusions and confirm the designated drop-off office. Bundle by carrier route (50–100 pieces, at most 6 inches high). Retain the official acceptance receipt. ScaledCircle does not submit USPS orders automatically.',
              ),
            ] else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (status == 'DRAFT')
                    FilledButton(
                      onPressed: _busy ? null : () => _design(order),
                      child: const Text('Create or choose design'),
                    ),
                  if (status == 'DRAFT')
                    for (final m in materials.where(
                      (m) => m['version'] != null,
                    ))
                      OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () => _approveDesign(order, m),
                        child: const Text('Review prepared design'),
                      ),
                  if (status == 'QUOTED')
                    FilledButton(
                      onPressed: _busy ? null : () => _pay(order),
                      child: const Text('Review quote & pay'),
                    ),
                  if (['PAYMENT_PENDING', 'PAYMENT_HOLD'].contains(status))
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () => _run(() async {
                              await _service.call('reconcile', {
                                'orderId': order['orderId'],
                              });
                            }),
                      child: const Text('Check payment'),
                    ),
                  if (![
                    'CANCELED',
                    'REFUNDED',
                    'MAILED',
                    'COMPLETED',
                  ].contains(status))
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              final answer = await _form(
                                'Request cancellation',
                                {},
                                acknowledgment:
                                    'Stop fulfillment and request cancellation under the terms on this order.',
                                button: 'Request cancellation',
                              );
                              if (answer != null) {
                                await _run(() async {
                                  await _service.call('cancel', {
                                    'orderId': order['orderId'],
                                  });
                                });
                              }
                            },
                      child: const Text('Request cancellation'),
                    ),
                ],
              ),
            if (order['storagePath'] != null)
              TextButton.icon(
                onPressed: _busy ? null : () => _download(order),
                icon: const Icon(Icons.download_outlined),
                label: const Text('Download approved print file'),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.admin ? 'Postcard fulfillment' : 'Neighborhood Postcards',
      ),
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1050),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Fulfilled by ScaledCircle',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const Text(
              'Choose where you want to reach. Create your postcard. ScaledCircle handles printing and mailing.',
            ),
            const SizedBox(height: 12),
            if (!_available)
              const Text(
                'Postcard Campaigns — Beta. Managed fulfillment is being verified; customer payments are not available yet.',
              )
            else ...[
              const Text('STAGING · TEST payments only'),
              if (_error != null)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        Text(_error!),
                        TextButton(
                          onPressed: _busy ? null : _load,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                ),
              if (_busy || (_data == null && _error == null))
                const LinearProgressIndicator(),
              if (_data != null && !widget.admin)
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _create,
                    icon: const Icon(Icons.add),
                    label: const Text('Create Postcard Campaign'),
                  ),
                ),
              for (final order in _list(_data?['orders'])) _card(order),
              if (_data != null && _list(_data?['orders']).isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(
                    widget.admin
                        ? 'No postcard orders yet. Confirm requested quotes here; only reconciled payments are ready for fulfillment.'
                        : 'Your postcard campaigns will appear here. You will review the design and final quote before paying.',
                  ),
                ),
            ],
          ],
        ),
      ),
    ),
  );
}
