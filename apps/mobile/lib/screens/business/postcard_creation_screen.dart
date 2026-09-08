import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import '../../services/physical_marketing_service.dart';
import '../../services/postcard_fulfillment_service.dart';
import '../../services/postcard_artwork_picker.dart';
import '../../widgets/authenticated_media_preview.dart';
import 'brand_assets_screen.dart';

/// A short guided flow. Technical print preparation stays on the server.
class PostcardCreationScreen extends StatefulWidget {
  const PostcardCreationScreen({
    super.key,
    required this.service,
    required this.physical,
    required this.workspace,
    this.order,
    this.pickArtwork,
  });
  final PostcardGateway service;
  final PhysicalMarketingGateway physical;
  final Map<String, dynamic> workspace;
  final Map<String, dynamic>? order;
  final Future<List<Map<String, dynamic>>?> Function()? pickArtwork;
  @override
  State<PostcardCreationScreen> createState() => _PostcardCreationScreenState();
}

class _PostcardCreationScreenState extends State<PostcardCreationScreen> {
  Map<String, dynamic> _map(dynamic v) =>
      v is Map ? Map<String, dynamic>.from(v) : {};
  List<Map<String, dynamic>> _list(dynamic v) => (v as List? ?? [])
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();
  late Map<String, dynamic> _workspace = widget.workspace;
  late Map<String, dynamic>? _order = widget.order;
  final _name = TextEditingController(),
      _headline = TextEditingController(),
      _message = TextEditingController(),
      _cta = TextEditingController(),
      _phone = TextEditingController(),
      _website = TextEditingController(),
      _destination = TextEditingController(),
      _area = TextEditingController(),
      _zip = TextEditingController(),
      _quantity = TextEditingController(text: '200'),
      _primary = TextEditingController(),
      _secondary = TextEditingController();
  String? _mode, _service, _asset, _tracking, _page;
  String _image = 'none', _contact = 'business', _destinationKind = 'page';
  int _step = 0;
  bool _busy = false,
      _qr = false,
      _logo = true,
      _checked = false,
      _simulation = false,
      _replaceBack = true;
  String? _error;
  Map<String, dynamic>? _upload, _version;
  String? _materialId;
  String? _draftSignature, _draftRequestId;
  final _request = 'postcard_${DateTime.now().microsecondsSinceEpoch}';
  List<String> get _services =>
      (_workspace['availableServices'] as List? ?? []).cast<String>();
  List<Map<String, dynamic>> get _pages => _list(_workspace['landingPages']);
  List<Map<String, dynamic>> get _media => _list(_workspace['approvedMedia']);
  List<Map<String, dynamic>> get _phones => _list(
    _workspace['trackingNumbers'],
  ).where((p) => p['campaignId'] == _order?['campaignId']).toList();
  bool get _fixedBack =>
      _mode == 'upload' && _upload?['pageCount'] == 2 && !_replaceBack;
  static const steps = [
    'Message',
    'Image',
    'Contact method',
    'QR / destination',
    'Preview',
    'Mailing area',
    'Quantity',
    'Quote',
  ];
  @override
  void initState() {
    super.initState();
    final identity = _map(_workspace['businessIdentity']);
    _name.text = identity['businessName']?.toString() ?? '';
    _phone.text = identity['phone']?.toString() ?? '';
    _website.text = identity['website']?.toString() ?? '';
    _primary.text = identity['primaryColor']?.toString() ?? '#176FD1';
    _secondary.text = identity['secondaryColor']?.toString() ?? '#10243E';
    _service = _services.firstOrNull;
    _page = _pages.firstOrNull?['landingPageId']?.toString();
    _qr = _page != null || _website.text.startsWith('https://');
    _destination.text = _website.text;
    _destinationKind = _page == null ? 'website' : 'page';
    _cta.text = _qr ? 'Scan to learn more' : 'Get in touch';
    _area.text = _order?['targetArea']?.toString() ?? '';
    _zip.text = _order?['zip']?.toString() ?? '';
    _quantity.text = (_order?['desiredQuantity'] ?? 200).toString();
    _simulation = _order?['simulation'] == true;
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _headline,
      _message,
      _cta,
      _phone,
      _website,
      _destination,
      _area,
      _zip,
      _quantity,
      _primary,
      _secondary,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e
              .toString()
              .replaceFirst(RegExp(r'^\[[^\]]+\]\s*'), '')
              .replaceFirst('Bad state: ', '')
              .replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _suggest() {
    final c = _map(_map(_workspace['copySuggestions'])[_service]);
    _headline.text =
        c['headline']?.toString() ?? 'Explore ${_service ?? 'our services'}';
    _message.text = c['supportingText']?.toString() ?? '';
  }

  Future<void> _ensureOrder() async {
    _order ??= await widget.service.call('create', {
      'requestId': _request,
      'name': '${_name.text.trim()} Postcards',
      'creationMode': _mode,
      'simulation': _simulation,
    });
  }

  Future<void> _uploadFile() => _run(() async {
    // Open the picker during the user's gesture, before any network wait.
    final files = await (widget.pickArtwork ?? pickPostcardArtwork)();
    if (files == null) return;
    await _ensureOrder();
    final upload = await widget.service.call('uploadArtwork', {
      'campaignId': _order!['campaignId'],
      'files': files,
    });
    if (mounted) setState(() => _upload = upload);
  });
  Future<void> _assets(String choice) async {
    setState(() => _image = choice);
    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const BrandAssetsScreen()));
    if (!mounted) return;
    await _run(() async {
      final data = await widget.physical.workspace();
      if (mounted) setState(() => _workspace = data);
    });
  }

  Future<void> _next() => _run(() async {
    if (_step == 0) {
      if (_name.text.trim().isEmpty || _service == null) {
        throw StateError(
          'Add a Business name and approved service in your Business profile first.',
        );
      }
      if (_mode == 'upload') {
        if (_upload == null) {
          throw StateError('Upload your front design first.');
        }
        if (_headline.text.isEmpty) _headline.text = '${_name.text} postcard';
      } else if (_headline.text.trim().isEmpty) {
        throw StateError('Add a headline for your postcard.');
      }
    }
    if (_step == 1 && _mode != 'upload' && _image != 'none' && _asset == null) {
      throw StateError('Choose an approved image, or choose No Photo.');
    }
    if (_step == 2 && !_fixedBack) {
      if (_contact == 'business' && _phone.text.trim().isEmpty) {
        throw StateError('Enter your Business phone, or choose No phone.');
      }
      if (_contact == 'tracking' && _tracking == null) {
        throw StateError(
          'Choose an available number already bound to this campaign.',
        );
      }
    }
    if (_step == 3) {
      if (_qr &&
          !_fixedBack &&
          (_destinationKind == 'page'
              ? _page == null
              : !_destination.text.startsWith('https://'))) {
        throw StateError(
          'Choose a published Landing Page or complete https:// destination, or turn QR off.',
        );
      }
      await _ensureOrder();
      final selected = _media.where((m) => m['assetId'] == _asset).firstOrNull;
      final draft = <String, dynamic>{
        'productSpecId': 'postcard_eddm_6x11',
        'sideCount': 2,
        'campaignId': _order!['campaignId'],
        'creationMode': _mode,
        'service': _service,
        'headline': _headline.text.trim(),
        'offer': _message.text.trim(),
        'cta': _cta.text.trim(),
        'displayBusinessName': _name.text.trim(),
        'includeLogo': _logo,
        'primaryColor': _primary.text,
        'secondaryColor': _secondary.text,
        'website': _fixedBack ? null : _website.text.trim(),
        'qrEnabled': _qr && !_fixedBack,
        'landingPageId': _qr && _destinationKind == 'page' ? _page : null,
        'destinationUrl': _qr && _destinationKind == 'website'
            ? _destination.text.trim()
            : null,
        'includeBusinessPhone': !_fixedBack && _contact == 'business',
        'businessPhone': _phone.text.trim(),
        'trackingPhoneAssetId': !_fixedBack && _contact == 'tracking'
            ? _tracking
            : null,
        if (_mode == 'upload') 'artworkUploadId': _upload!['uploadId'],
        'replaceUploadedBack': _replaceBack,
        if (_mode != 'upload' && _image != 'none' && selected != null)
          'media': {
            'assetId': selected['assetId'],
            'revisionId': selected['revisionId'],
          },
      };
      final signature = jsonEncode(draft);
      if (signature != _draftSignature) {
        _draftSignature = signature;
        _draftRequestId =
            '${_request}_design_${DateTime.now().microsecondsSinceEpoch}';
        _materialId = null;
      }
      if (_materialId == null) {
        final created = await widget.physical.create(
          requestId: _draftRequestId!,
          draft: draft,
        );
        _materialId = created['materialId'].toString();
      }
      _version = await widget.physical.prepare(_materialId!);
      _checked = false;
    }
    if (_step == 4) {
      if (!_checked) {
        throw StateError(
          'Review both sides and explicitly approve this exact version.',
        );
      }
      await widget.physical.approve(
        _materialId!,
        _version!['versionId'].toString(),
      );
    }
    if (_step == 5 &&
        (_area.text.trim().isEmpty ||
            !RegExp(r'^\d{5}$').hasMatch(_zip.text.trim()))) {
      throw StateError('Enter the neighborhood and five-digit ZIP Code.');
    }
    if (_step == 6) {
      final q = int.tryParse(_quantity.text);
      if (q == null || q < 200 || q > 5000) {
        throw StateError('Choose a preferred quantity from 200 to 5,000.');
      }
      await widget.service.call('mailing', {
        'orderId': _order!['orderId'],
        'targetArea': _area.text.trim(),
        'zip': _zip.text.trim(),
        'desiredQuantity': q,
      });
    }
    if (_step == 7) {
      await widget.service.call('requestQuote', {
        'orderId': _order!['orderId'],
        'materialId': _materialId,
        'versionId': _version!['versionId'],
      });
      if (mounted) Navigator.pop(context, true);
      return;
    }
    if (mounted) setState(() => _step++);
  });
  Widget _field(TextEditingController c, String label, {int lines = 1}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: TextField(
          controller: c,
          maxLines: lines,
          decoration: InputDecoration(labelText: label),
        ),
      );
  Widget _select(
    String label,
    String? value,
    List<DropdownMenuItem<String>> items,
    ValueChanged<String?> change,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: DropdownButtonFormField<String>(
      key: ValueKey('$label:$value'),
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: items,
      onChanged: _busy ? null : change,
    ),
  );
  Widget _option(String title, String subtitle, VoidCallback action) => Card(
    child: ListTile(
      contentPadding: const EdgeInsets.all(20),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: _busy ? null : action,
    ),
  );
  Widget _body() {
    if (_mode == null) {
      return Column(
        children: [
          const Text(
            'Start with your own design, customize a template, or let ScaledCircle help create one from your Business.',
          ),
          for (final choice in [
            ('upload', 'Use My Design', 'Upload your existing postcard.'),
            (
              'template',
              'Customize a Template',
              'Personalize a prepared two-sided layout.',
            ),
            (
              'assisted',
              'Create It For Me',
              'Start with your real Business services and brand.',
            ),
          ])
            _option(
              choice.$2,
              choice.$3,
              () => setState(() {
                _mode = choice.$1;
                if (_mode != 'upload') _suggest();
              }),
            ),
        ],
      );
    }
    if (_step == 0) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_mode == 'assisted')
            const Text(
              'We prepared a starting message from your approved Business service. Review and edit it before approval.',
            ),
          const SizedBox(height: 12),
          _field(_name, 'Business name'),
          _select(
            'Service',
            _service,
            _services
                .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                .toList(),
            (v) => setState(() {
              _service = v;
              if (_mode != 'upload') _suggest();
            }),
          ),
          if (_mode == 'upload') ...[
            const Text(
              'Upload the front first. A two-page PDF or separate front/back files are supported on the web. Your original stays unchanged. We prepare the postal panel and show the final rendition for approval.',
            ),
            if (!kIsWeb)
              const Text(
                'Choose a PNG/JPG front here. For PDF or separate front/back files, open Postcards on the website.',
              ),
            OutlinedButton.icon(
              onPressed: _busy ? null : _uploadFile,
              icon: const Icon(Icons.upload_file),
              label: Text(
                _upload == null ? 'Choose artwork' : 'Replace uploaded artwork',
              ),
            ),
            if (_upload != null)
              Text(
                '${_upload!['pageCount']} side(s) checked. Text safety and source image quality are reviewed before print.',
              ),
            if (_upload?['pageCount'] == 2)
              SwitchListTile(
                value: _replaceBack,
                onChanged: (v) => setState(() => _replaceBack = v),
                title: const Text('Use a ScaledCircle back'),
                subtitle: const Text(
                  'On: use your front and add an editable contact / QR back. Off: retain your fixed back artwork; no new phone or QR is added.',
                ),
              ),
          ] else ...[
            _field(_headline, 'Headline'),
            _field(_message, 'Offer or message', lines: 3),
            _field(_cta, 'Call to action'),
          ],
          ExpansionTile(
            title: const Text('Optional customization'),
            children: [
              SwitchListTile(
                value: _logo,
                onChanged: (v) => setState(() => _logo = v),
                title: const Text('Use my approved Business logo'),
              ),
              _field(_primary, 'Brand color (for example #176FD1)'),
              _field(_secondary, 'Accent color (for example #10243E)'),
            ],
          ),
          if (_order == null)
            CheckboxListTile(
              value: _simulation,
              onChanged: (v) => setState(() => _simulation = v == true),
              title: const Text(
                'Software certification only — nothing printed or mailed.',
              ),
            ),
        ],
      );
    }
    if (_step == 1) {
      if (_mode == 'upload') {
        return const Text(
          'Your uploaded design supplies the image. We preserve its shape and composition.',
        );
      }
      return Column(
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(
                onPressed: () => _assets('photo'),
                child: const Text('Use My Photo'),
              ),
              OutlinedButton(
                onPressed: () => setState(() => _image = 'brand'),
                child: const Text('Use My Brand Asset'),
              ),
              OutlinedButton(
                onPressed: () => _assets('generated'),
                child: const Text('Generate a Service Image'),
              ),
              OutlinedButton(
                onPressed: () => setState(() {
                  _image = 'none';
                  _asset = null;
                }),
                child: const Text('No Photo'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            _image == 'none'
                ? 'A clean text layout is selected.'
                : 'Upload or generate in Brand Assets, approve the image, then return here to choose it.',
          ),
          if (_image != 'none')
            _select(
              'Approved image',
              _asset,
              _media
                  .where(
                    (m) =>
                        _image != 'generated' ||
                        m['origin'] == 'generated_service_concept',
                  )
                  .map(
                    (m) => DropdownMenuItem(
                      value: m['assetId'].toString(),
                      child: Text(
                        '${m['title']}${m['origin'] == 'generated_service_concept' ? ' · Concept image' : ''}',
                      ),
                    ),
                  )
                  .toList(),
              (v) => setState(() => _asset = v),
            ),
          const Text(
            'Generated service images are illustrative concepts. They are labeled on the postcard and are never presented as your completed project.',
          ),
        ],
      );
    }
    if (_step == 2) {
      if (_fixedBack) {
        return const Text(
          'Contact details already in your uploaded back stay as supplied. No new phone attribution is claimed.',
        );
      }
      return Column(
        children: [
          _select('Phone choice', _contact, const [
            DropdownMenuItem(
              value: 'business',
              child: Text('My Business Number'),
            ),
            DropdownMenuItem(
              value: 'tracking',
              child: Text('ScaledCircle Tracking Number'),
            ),
            DropdownMenuItem(value: 'none', child: Text('No phone')),
          ], (v) => setState(() => _contact = v!)),
          if (_contact == 'business') ...[
            _field(_phone, 'Business phone — exactly as printed'),
            const Text(
              'Calls to your own number are not measured by ScaledCircle.',
            ),
          ],
          if (_contact == 'tracking') ...[
            const Text(
              'Use a ScaledCircle tracking number to measure calls from this campaign. Only an active number already bound to this campaign can be used.',
            ),
            if (_phones.isEmpty)
              const Text(
                'No eligible number is currently bound. Use your own number or no phone to continue.',
              ),
            if (_phones.isNotEmpty)
              _select(
                'Campaign tracking number',
                _tracking,
                _phones
                    .map(
                      (p) => DropdownMenuItem(
                        value: p['trackingPhoneAssetId'].toString(),
                        child: Text(p['displayNumber'].toString()),
                      ),
                    )
                    .toList(),
                (v) => setState(() => _tracking = v),
              ),
          ],
          _field(_website, 'Business website (optional, https://)'),
        ],
      );
    }
    if (_step == 3) {
      if (_fixedBack) {
        return const Text(
          'Your uploaded back is fixed artwork. Any existing QR remains as supplied; ScaledCircle does not claim to measure it. To add a new tracked QR, go back and choose a ScaledCircle back.',
        );
      }
      return Column(
        children: [
          SwitchListTile(
            value: _qr,
            onChanged: (v) => setState(() {
              _qr = v;
              if (!v && _cta.text == 'Scan to learn more') {
                _cta.text = 'Get in touch';
              }
              if (v && _cta.text == 'Get in touch') {
                _cta.text = 'Scan to learn more';
              }
            }),
            title: const Text('Include a QR code'),
            subtitle: const Text(
              'Recommended, optional. Turn it off whenever you prefer.',
            ),
          ),
          if (_qr) ...[
            _select(
              'Destination',
              _destinationKind,
              const [
                DropdownMenuItem(
                  value: 'page',
                  child: Text('ScaledCircle Landing Page'),
                ),
                DropdownMenuItem(
                  value: 'website',
                  child: Text('Business website / approved response URL'),
                ),
              ],
              (v) => setState(() => _destinationKind = v!),
            ),
            if (_destinationKind == 'page')
              _select(
                'Published Landing Page',
                _page,
                _pages
                    .map(
                      (p) => DropdownMenuItem(
                        value: p['landingPageId'].toString(),
                        child: Text(p['title'].toString()),
                      ),
                    )
                    .toList(),
                (v) => setState(() => _page = v),
              ),
            if (_destinationKind == 'website')
              _field(_destination, 'Approved https:// destination'),
          ],
          if (!_qr && _contact != 'tracking')
            const Text(
              'Response attribution will be limited. Printing and mailing still work without tracking.',
            ),
        ],
      );
    }
    if (_step == 4) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final proof in _list(_map(_version?['artifact'])['proofs'])) ...[
            Text(
              proof['side'] == 1 ? 'FRONT' : 'BACK',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            AspectRatio(
              aspectRatio: 1.8,
              child: AuthenticatedMediaPreview(
                identity: proof['storagePath'],
                semanticLabel: proof['side'] == 1
                    ? 'Postcard front'
                    : 'Postcard back',
                fit: BoxFit.contain,
                load: () => widget.physical.bytes(
                  proof['storagePath'].toString(),
                  maximumBytes: 8 * 1024 * 1024,
                ),
              ),
            ),
          ],
          const Text(
            'The clear right side of the BACK is reserved for mailing and postage. Review all text, image quality, contact details and destination. Keep important content away from trimmed edges.',
          ),
          CheckboxListTile(
            value: _checked,
            onChanged: (v) => setState(() => _checked = v == true),
            title: const Text(
              'I approve these exact front and back designs, contact details and destination.',
            ),
          ),
        ],
      );
    }
    if (_step == 5) {
      return Column(
        children: [
          _field(_area, 'Neighborhood / mailing area'),
          _field(_zip, 'ZIP Code'),
          const Text(
            'ScaledCircle confirms complete USPS carrier routes and exclusions before the final quote. No route or delivery count is invented.',
          ),
        ],
      );
    }
    if (_step == 6) {
      return Column(
        children: [
          _field(_quantity, 'Preferred quantity'),
          const Text(
            '200–5,000 pieces. The final quantity follows complete eligible routes and will appear in your quote before payment.',
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${_name.text} · ${_area.text} · ${_zip.text}'),
        Text('${_quantity.text} preferred pieces'),
        const SizedBox(height: 16),
        const Text(
          'Your exact design is approved. ScaledCircle will confirm printing, actual USPS postage and the final route count.',
        ),
        const Text(
          'ScaledCircle Fulfillment & Creative: 20% of printing + USPS postage, before tax. This covers creative assistance, print preparation, coordination and managed mailing.',
        ),
        const Text(
          'You will review the itemized quote and intentionally pay next. Requesting a quote does not charge you.',
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Create your postcard')),
    body: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: SingleChildScrollView(
          key: ValueKey('creation:$_mode:$_step'),
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_mode != null) ...[
                Text(
                  'Step ${_step + 1} of 8 · ${steps[_step]}',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                LinearProgressIndicator(value: (_step + 1) / 8),
                const SizedBox(height: 24),
              ],
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              _body(),
              if (_mode != null) ...[
                const SizedBox(height: 24),
                Wrap(
                  spacing: 12,
                  children: [
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                              if (_step == 0) {
                                _mode = null;
                              } else {
                                _step--;
                              }
                              _error = null;
                            }),
                      child: const Text('Back'),
                    ),
                    FilledButton(
                      onPressed: _busy || (_step == 4 && !_checked)
                          ? null
                          : _next,
                      child: Text(
                        _busy
                            ? 'Preparing…'
                            : _step == 7
                            ? 'Request my quote'
                            : _step == 3
                            ? 'Prepare preview'
                            : _step == 4
                            ? 'Approve exact design'
                            : 'Continue',
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}
