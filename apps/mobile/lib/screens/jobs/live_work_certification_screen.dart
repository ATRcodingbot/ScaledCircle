import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../business/create/cleanup_location_picker_screen.dart';

/// Private, server-authorized single-job flow. No client financial writes.
class LiveWorkCertificationScreen extends StatefulWidget {
  const LiveWorkCertificationScreen({super.key, this.call});
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>)? call;
  @override
  State<LiveWorkCertificationScreen> createState() =>
      _LiveWorkCertificationState();
}

class _LiveWorkCertificationState extends State<LiveWorkCertificationScreen> {
  final _notes = TextEditingController();
  final _photos = <String, XFile>{};
  Map<String, dynamic>? _data;
  bool _busy = false;
  String? _error;
  FirebaseFunctions get _functions =>
      FirebaseFunctions.instanceFor(region: 'us-east1');
  Future<Map<String, dynamic>> _call(Map<String, dynamic> input) async =>
      widget.call != null
      ? widget.call!(input)
      : Map<String, dynamic>.from(
          (await _functions
                      .httpsCallable('liveWorkCertificationV1')
                      .call(input))
                  .data
              as Map,
        );

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _work(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'This step needs attention. Check the current status before trying again. No payment or approval is inferred.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() => _work(() async {
    final result = await _call({});
    if (mounted) setState(() => _data = result);
  });
  String _money(dynamic cents) =>
      '\$${((cents as num? ?? 0) / 100).toStringAsFixed(2)}';

  Future<bool> _confirm(String title, String text) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(text),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Not now'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm'),
            ),
          ],
        ),
      ) ==
      true;

  Future<void> _action(String action) async {
    final input = <String, dynamic>{'action': action, 'confirmation': true};
    if (action == 'create') {
      final place = await Navigator.push<CleanupLocationResult>(
        context,
        MaterialPageRoute(builder: (_) => const CleanupLocationPickerScreen()),
      );
      if (place == null || !mounted) return;
      if (!await _confirm(
        'Confirm authorized location',
        '${place.address}\n\nYou control this location and authorize the real yard work here. Saving the task does not charge your card.',
      )) {
        return;
      }
      input['location'] = {
        'address': place.address,
        'latitude': place.point.latitude,
        'longitude': place.point.longitude,
      };
    } else if (action == 'fund') {
      final quote = _data?['quote'] as Map?;
      if (!await _confirm(
        'Review Business payment',
        'Base: ${_money(quote?['workerAmountCents'])}\nScaledCircle fee: ${_money(quote?['platformFeeCents'])}\nTotal: ${_money(quote?['totalChargeCents'])}\n\nContinue only after the Founder payment checkpoint has been approved. Stripe will show the final payment confirmation.',
      )) {
        return;
      }
      await _work(() async {
        final result = await _functions
            .httpsCallable('createCampaignFundingCheckoutSession')
            .call({
              'campaignId': _data!['campaignId'],
              'approvedQuoteDigest': quote!['quoteDigest'],
            });
        final response = Map<String, dynamic>.from(result.data as Map);
        if (response['paymentMode'] != 'live' ||
            response['quote']?['totalChargeCents'] != 360) {
          throw StateError('Quote changed');
        }
        final url = Uri.parse(response['url'] as String);
        if (url.scheme != 'https' || url.host != 'checkout.stripe.com') {
          throw StateError('Invalid Checkout');
        }
        await launchUrl(url, mode: LaunchMode.externalApplication);
        final data = await _call({});
        if (mounted) setState(() => _data = data);
      });
      return;
    } else {
      final text = switch (action) {
        'publish' =>
          'Offer this funded task only to its intended Scaler. No public opportunity is created.',
        'apply' =>
          'Apply for this real task at the displayed location for the fixed \$3.00 compensation.',
        'assign' =>
          'Assign the valid application to this task for \$3.00, subject to the Scaler accepting.',
        'accept' =>
          'Accept the fixed \$3.00 job and its before/after-photo evidence requirements.',
        'submit' =>
          'Confirm you performed the real yard cleanup and these photos and notes describe your work. This sends it to the Business for review.',
        'approve' =>
          'Approve the actual work and evidence shown below. This records exactly \$3.00 as the Scaler’s available earning. It does not send a bank payout.',
        _ => '',
      };
      if (!await _confirm(_label(action), text)) return;
    }
    if (!mounted) return;
    await _work(() async {
      if (action == 'submit') {
        if (_photos.length != 2 || _notes.text.trim().length < 12) {
          throw StateError('Evidence required');
        }
        final uid = FirebaseAuth.instance.currentUser!.uid;
        final uploaded = <Map<String, String>>[];
        for (final purpose in ['before', 'after']) {
          final photo = _photos[purpose]!;
          final path =
              'completionProofs/${_data!['campaignId']}/$uid/${_data!['completionId']}/$purpose/${DateTime.now().microsecondsSinceEpoch}.jpg';
          await FirebaseStorage.instance
              .ref(path)
              .putData(
                await photo.readAsBytes(),
                SettableMetadata(contentType: 'image/jpeg'),
              );
          uploaded.add({'path': path, 'purpose': purpose});
        }
        input['photos'] = uploaded;
        input['notes'] = _notes.text.trim();
      }
      final result = await _call(input);
      if (mounted) setState(() => _data = result);
    });
  }

  String _label(String action) => switch (action) {
    'create' => 'Select location and save task',
    'fund' => 'Review funding',
    'publish' => 'Offer funded task',
    'apply' => 'Apply for task',
    'assign' => 'Assign Scaler',
    'accept' => 'Accept \$3 task',
    'submit' => 'Submit completed work',
    'approve' => 'Approve work and \$3 earning',
    _ => action,
  };
  @override
  Widget build(BuildContext context) {
    final data = _data;
    final actions = List<String>.from(data?['actions'] as List? ?? []);
    return Scaffold(
      appBar: AppBar(title: const Text('Yard Cleanup Check')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (_busy) const LinearProgressIndicator(),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(_error!),
                ),
              if (data != null) ...[
                Text(
                  data['title'] as String,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 12),
                Text(data['task'] as String),
                Text('Expected time: ${data['duration']}'),
                Text(
                  'Status: ${(data['status'] as String).replaceAll('_', ' ')}',
                ),
                const SizedBox(height: 12),
                const Text(
                  'Fixed Scaler compensation: \$3.00\nBonus: \$0.00\nGPS tracking is not required for this task.',
                ),
                if (data['location'] is Map)
                  Text('Work location: ${data['location']['address']}'),
                if (data['quote'] is Map)
                  Text(
                    'Platform fee: ${_money(data['quote']['platformFeeCents'])}\nTotal Business cost: ${_money(data['quote']['totalChargeCents'])}',
                  ),
                Text(
                  'Funding: ${(data['fundingStatus'] as String).replaceAll('_', ' ')}',
                ),
                if ((data['notes'] as String? ?? '').isNotEmpty)
                  Text('Scaler note: ${data['notes']}'),
                for (final photo in data['photos'] as List? ?? []) ...[
                  Text('${photo['purpose']} photo'),
                  Image.network(
                    photo['url'] as String,
                    height: 220,
                    fit: BoxFit.contain,
                  ),
                ],
                if (actions.contains('submit')) ...[
                  TextField(
                    controller: _notes,
                    maxLength: 2000,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Describe the work completed',
                    ),
                  ),
                  for (final purpose in ['before', 'after'])
                    OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              final photo = await ImagePicker().pickImage(
                                source: ImageSource.gallery,
                                imageQuality: 90,
                              );
                              if (photo != null && mounted) {
                                setState(() => _photos[purpose] = photo);
                              }
                            },
                      child: Text(
                        '${_photos.containsKey(purpose) ? 'Replace' : 'Choose'} $purpose photo',
                      ),
                    ),
                ],
                const SizedBox(height: 16),
                for (final action in actions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: FilledButton(
                      onPressed: _busy ? null : () => _action(action),
                      child: Text(_label(action)),
                    ),
                  ),
              ],
              TextButton(
                onPressed: _busy ? null : _load,
                child: const Text('Check current status'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
