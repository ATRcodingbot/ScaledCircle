import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../services/campaign_tracking_service.dart';

class CampaignTrackingScreen extends StatefulWidget {
  const CampaignTrackingScreen({super.key, required this.campaign});

  final DocumentSnapshot campaign;

  @override
  State<CampaignTrackingScreen> createState() => _CampaignTrackingScreenState();
}

class _CampaignTrackingScreenState extends State<CampaignTrackingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _trackingService = const CampaignTrackingService();

  late final TextEditingController _destinationController;
  late final TextEditingController _headlineController;
  late final TextEditingController _bodyController;
  late final TextEditingController _callToActionController;
  late final TextEditingController _phoneController;
  late final TextEditingController _emailController;

  late String _destinationType;
  bool _trackWeb = true;
  bool _trackQr = true;
  bool _createPrintable = true;
  bool _trackPhone = false;
  bool _trackEmail = false;
  bool _saving = false;

  String _trackingCode = '';
  String _trackingUrl = '';
  String _qrTrackingUrl = '';
  String _phoneTrackingStatus = 'not_requested';
  String _emailTrackingStatus = 'not_requested';

  Map<String, dynamic> get _initialData {
    return widget.campaign.data() as Map<String, dynamic>? ?? {};
  }

  @override
  void initState() {
    super.initState();
    final data = _initialData;
    final channels =
        (data['trackingChannels'] as List?)
            ?.map((value) => value.toString())
            .toSet() ??
        <String>{};

    _destinationType =
        data['trackingDestinationType']?.toString() == 'scaled_circle_landing'
        ? 'scaled_circle_landing'
        : 'existing_website';
    _destinationController = TextEditingController(
      text:
          data['trackingDestinationUrl']?.toString() ??
          data['landingPageUrl']?.toString() ??
          '',
    );
    _headlineController = TextEditingController(
      text:
          data['landingPageHeadline']?.toString() ??
          data['campaignName']?.toString() ??
          '',
    );
    _bodyController = TextEditingController(
      text:
          data['landingPageBody']?.toString() ??
          data['description']?.toString() ??
          '',
    );
    _callToActionController = TextEditingController(
      text: data['trackingCallToActionLabel']?.toString() ?? 'Learn More',
    );
    _phoneController = TextEditingController(
      text: data['forwardingPhoneNumber']?.toString() ?? '',
    );
    _emailController = TextEditingController(
      text: data['forwardingEmail']?.toString() ?? '',
    );
    _trackWeb = channels.isEmpty || channels.contains('web');
    _trackQr = channels.isEmpty || channels.contains('qr');
    _createPrintable = channels.isEmpty || channels.contains('print');
    _trackPhone = channels.contains('phone');
    _trackEmail = channels.contains('email');
    _trackingCode = data['trackingCode']?.toString() ?? '';
    _trackingUrl = data['trackingUrl']?.toString() ?? '';
    _qrTrackingUrl = data['qrCodeUrl']?.toString() ?? _trackingUrl;
    _phoneTrackingStatus =
        data['phoneTrackingStatus']?.toString() ?? 'not_requested';
    _emailTrackingStatus =
        data['emailTrackingStatus']?.toString() ?? 'not_requested';
  }

  @override
  void dispose() {
    _destinationController.dispose();
    _headlineController.dispose();
    _bodyController.dispose();
    _callToActionController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  String _normalizedDestination() {
    final text = _destinationController.text.trim();

    if (text.isEmpty || text.contains('://')) {
      return text;
    }

    return 'https://$text';
  }

  List<String> _selectedChannels() {
    return [
      if (_trackWeb) 'web',
      if (_trackQr) 'qr',
      if (_createPrintable) 'print',
      if (_trackPhone) 'phone',
      if (_trackEmail) 'email',
    ];
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate() || _saving) return;

    setState(() {
      _saving = true;
    });

    try {
      final destination = _normalizedDestination();
      final result = await _trackingService.provision(
        campaignId: widget.campaign.id,
        destinationType: _destinationType,
        destinationUrl: destination,
        landingPageHeadline: _headlineController.text.trim(),
        landingPageBody: _bodyController.text.trim(),
        callToActionLabel: _callToActionController.text.trim(),
        channels: _selectedChannels(),
        forwardingPhoneNumber: _trackPhone
            ? _phoneController.text.trim()
            : null,
        forwardingEmail: _trackEmail ? _emailController.text.trim() : null,
      );

      if (!mounted) return;
      setState(() {
        _destinationController.text = destination;
        _trackingCode = result.trackingCode;
        _trackingUrl = result.trackingUrl;
        _qrTrackingUrl = result.qrTrackingUrl;
        _phoneTrackingStatus = result.phoneTrackingStatus;
        _emailTrackingStatus = result.emailTrackingStatus;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Campaign tracking is ready.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to save tracking: $error')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _sharePrintablePdf() async {
    final qrData = _qrTrackingUrl.isNotEmpty ? _qrTrackingUrl : _trackingUrl;

    if (qrData.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Save tracking before creating a PDF.')),
      );
      return;
    }

    final campaignName =
        _initialData['campaignName']?.toString() ?? 'Local Campaign';
    final description = _bodyController.text.trim().isNotEmpty
        ? _bodyController.text.trim()
        : _initialData['description']?.toString() ?? '';
    final document = pw.Document();

    document.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.letter,
        margin: const pw.EdgeInsets.all(54),
        build: (_) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.center,
            children: [
              pw.Spacer(),
              pw.Text(
                campaignName,
                textAlign: pw.TextAlign.center,
                style: pw.TextStyle(
                  fontSize: 34,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              if (description.isNotEmpty) ...[
                pw.SizedBox(height: 20),
                pw.Text(
                  description,
                  textAlign: pw.TextAlign.center,
                  style: const pw.TextStyle(fontSize: 16, lineSpacing: 5),
                ),
              ],
              pw.SizedBox(height: 36),
              pw.BarcodeWidget(
                barcode: pw.Barcode.qrCode(),
                data: qrData,
                width: 190,
                height: 190,
              ),
              pw.SizedBox(height: 18),
              pw.Text(
                _callToActionController.text.trim().isEmpty
                    ? 'Scan to learn more'
                    : _callToActionController.text.trim(),
                style: pw.TextStyle(
                  fontSize: 18,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              pw.Spacer(),
              pw.Text(
                'Tracked local marketing powered by Scaled Circle',
                style: const pw.TextStyle(
                  fontSize: 9,
                  color: PdfColors.grey700,
                ),
              ),
            ],
          );
        },
      ),
    );

    final safeName = campaignName
        .replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '_')
        .replaceAll(RegExp(r'_+'), '_');
    await Printing.sharePdf(
      bytes: await document.save(),
      filename: '${safeName.isEmpty ? 'campaign' : safeName}_print.pdf',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Campaign Tracking & Materials'),
        centerTitle: true,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Choose the destination',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Every tracked web link and QR scan can open an existing '
              'Squarespace page or a Scaled Circle campaign landing page.',
            ),
            const SizedBox(height: 18),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'existing_website',
                  icon: Icon(Icons.open_in_browser),
                  label: Text('My website'),
                ),
                ButtonSegment(
                  value: 'scaled_circle_landing',
                  icon: Icon(Icons.web_asset_outlined),
                  label: Text('Landing page'),
                ),
              ],
              selected: {_destinationType},
              onSelectionChanged: (selection) {
                setState(() {
                  _destinationType = selection.first;
                });
              },
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: _destinationController,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Business website or campaign destination',
                hintText: 'https://www.yourbusiness.com/offer',
                prefixIcon: Icon(Icons.link),
              ),
              validator: (value) {
                final normalized = _normalizedDestination();
                final uri = Uri.tryParse(normalized);
                if (value == null ||
                    value.trim().isEmpty ||
                    uri == null ||
                    !uri.hasAuthority ||
                    (uri.scheme != 'https' && uri.scheme != 'http')) {
                  return 'Enter a complete website address.';
                }
                return null;
              },
            ),
            if (_destinationType == 'scaled_circle_landing') ...[
              const SizedBox(height: 16),
              TextFormField(
                controller: _headlineController,
                decoration: const InputDecoration(labelText: 'Page headline'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter a landing-page headline.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _bodyController,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Page message'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _callToActionController,
                decoration: const InputDecoration(
                  labelText: 'Call-to-action button',
                  hintText: 'Get a free estimate',
                ),
              ),
            ],
            const SizedBox(height: 28),
            const Text(
              'Attribution channels',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            _channelSwitch(
              title: 'Tracked website link',
              subtitle: 'Records a visit before opening the destination.',
              value: _trackWeb,
              onChanged: (value) => setState(() => _trackWeb = value),
            ),
            _channelSwitch(
              title: 'Campaign QR code',
              subtitle: 'Uses the same campaign ledger and identifies scans.',
              value: _trackQr,
              onChanged: (value) => setState(() => _trackQr = value),
            ),
            _channelSwitch(
              title: 'Printable campaign file',
              subtitle: 'Creates a vector-QR PDF suitable for a printer.',
              value: _createPrintable,
              onChanged: (value) => setState(() => _createPrintable = value),
            ),
            _providerChannel(
              title: 'Tracking phone number',
              subtitle:
                  'Forwards calls to the business and records campaign call '
                  'events after Twilio is connected.',
              value: _trackPhone,
              status: _phoneTrackingStatus,
              controller: _phoneController,
              fieldLabel: 'Business phone receiving forwarded calls',
              onChanged: (value) => setState(() => _trackPhone = value),
            ),
            _providerChannel(
              title: 'Tracking email address',
              subtitle:
                  'Forwards campaign email to the business after the inbound '
                  'email provider and DNS subdomain are connected.',
              value: _trackEmail,
              status: _emailTrackingStatus,
              controller: _emailController,
              fieldLabel: 'Business email receiving forwarded messages',
              keyboardType: TextInputType.emailAddress,
              onChanged: (value) => setState(() => _trackEmail = value),
            ),
            const SizedBox(height: 22),
            ElevatedButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.auto_graph),
              label: Text(_saving ? 'Preparing...' : 'Save Tracking Setup'),
            ),
            if (_trackingUrl.isNotEmpty) ...[
              const SizedBox(height: 26),
              _buildReadyCard(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _channelSwitch({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(title),
      subtitle: Text(subtitle),
      value: value,
      onChanged: onChanged,
    );
  }

  Widget _providerChannel({
    required String title,
    required String subtitle,
    required bool value,
    required String status,
    required TextEditingController controller,
    required String fieldLabel,
    required ValueChanged<bool> onChanged,
    TextInputType? keyboardType,
  }) {
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(title),
              subtitle: Text(subtitle),
              value: value,
              onChanged: onChanged,
            ),
            if (value) ...[
              TextFormField(
                controller: controller,
                keyboardType: keyboardType,
                decoration: InputDecoration(labelText: fieldLabel),
                validator: (fieldValue) {
                  if (value &&
                      (fieldValue == null || fieldValue.trim().isEmpty)) {
                    return 'Enter the forwarding destination.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.info_outline, size: 18),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_providerStatusLabel(status))),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildReadyCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Tracking ready',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 14),
            if (_trackQr)
              Center(
                child: Container(
                  color: Colors.white,
                  padding: const EdgeInsets.all(14),
                  child: QrImageView(
                    data: _qrTrackingUrl.isNotEmpty
                        ? _qrTrackingUrl
                        : _trackingUrl,
                    size: 190,
                  ),
                ),
              ),
            const SizedBox(height: 14),
            const Text(
              'Tracked campaign link',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 5),
            SelectableText(_trackingUrl),
            const SizedBox(height: 8),
            Text('Campaign tracking code: $_trackingCode'),
            if (_createPrintable) ...[
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: _sharePrintablePdf,
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('Create & Share Printer PDF'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _providerStatusLabel(String status) {
    switch (status) {
      case 'active':
        return 'Connected and active.';
      case 'provider_connection_required':
        return 'Requested. Provider connection and DNS/number provisioning '
            'are still required before this channel is live.';
      default:
        return 'This channel has not been provisioned yet.';
    }
  }
}
