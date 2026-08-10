import 'package:flutter/material.dart';

import '../../services/public_site_service.dart';
import '../../widgets/referral_source_fields.dart';

class WaitlistScreen extends StatefulWidget {
  final String initialRole;

  const WaitlistScreen({super.key, this.initialRole = 'business'});

  @override
  State<WaitlistScreen> createState() => _WaitlistScreenState();
}

class _WaitlistScreenState extends State<WaitlistScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _contactNumberController = TextEditingController();
  final _companyController = TextEditingController();
  final _postalCodeController = TextEditingController();
  final _websiteController = TextEditingController();
  final _referrerNameController = TextEditingController();

  late String _role;
  String? _discoverySource;
  bool _consent = false;
  bool _loading = false;
  String? _successMessage;

  @override
  void initState() {
    super.initState();
    _role = widget.initialRole == 'scaler' ? 'scaler' : 'business';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _contactNumberController.dispose();
    _companyController.dispose();
    _postalCodeController.dispose();
    _websiteController.dispose();
    _referrerNameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || !_consent) {
      setState(() {});
      return;
    }

    setState(() => _loading = true);
    try {
      final result = await PublicSiteService.joinWaitlist(
        role: _role,
        displayName: _nameController.text.trim(),
        email: _emailController.text.trim(),
        companyName: _companyController.text.trim(),
        postalCode: _postalCodeController.text.trim(),
        contactNumber: _contactNumberController.text.trim(),
        website: _websiteController.text.trim(),
        consent: _consent,
        discoverySource: _discoverySource!,
        referrerName: _discoverySource == ReferralSourceFields.personalReferral
            ? _referrerNameController.text.trim()
            : '',
      );
      if (!mounted) return;
      setState(() {
        _successMessage = result.alreadyJoined
            ? 'You are already on the list. We kept your latest details.'
            : result.message;
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFF020914);
    const panel = Color(0xFF071525);
    const border = Color(0xFF173653);
    const green = Color(0xFF14E39A);

    return Scaffold(
      backgroundColor: background,
      appBar: AppBar(
        backgroundColor: background,
        foregroundColor: Colors.white,
        title: const Text('Scaled Circle Maryland Early Access'),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: panel,
                border: Border.all(color: border),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: _successMessage == null
                    ? Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Join the Maryland launch list',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 34,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Coming soon. Joining does not create an active marketplace account.',
                              style: TextStyle(color: Color(0xFFB6C7D7)),
                            ),
                            const SizedBox(height: 24),
                            SegmentedButton<String>(
                              segments: const [
                                ButtonSegment(
                                  value: 'business',
                                  label: Text('Business'),
                                  icon: Icon(Icons.business),
                                ),
                                ButtonSegment(
                                  value: 'scaler',
                                  label: Text('Scaler'),
                                  icon: Icon(Icons.directions_walk),
                                ),
                              ],
                              selected: {_role},
                              onSelectionChanged: (value) {
                                setState(() => _role = value.first);
                              },
                            ),
                            const SizedBox(height: 20),
                            _field(
                              controller: _nameController,
                              label: 'Name',
                              validator: _required,
                            ),
                            if (_role == 'business') ...[
                              const SizedBox(height: 14),
                              _field(
                                controller: _companyController,
                                label: 'Business name',
                                validator: _required,
                              ),
                            ],
                            const SizedBox(height: 14),
                            _field(
                              controller: _emailController,
                              label: 'Email',
                              keyboardType: TextInputType.emailAddress,
                              validator: (value) {
                                final text = value?.trim() ?? '';
                                if (!text.contains('@') ||
                                    !text.contains('.')) {
                                  return 'Enter a valid email.';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 14),
                            _field(
                              controller: _contactNumberController,
                              label: 'Contact number (optional)',
                              keyboardType: TextInputType.phone,
                            ),
                            const SizedBox(height: 14),
                            _field(
                              controller: _postalCodeController,
                              label: 'ZIP / postal code',
                              validator: _required,
                            ),
                            Offstage(
                              offstage: true,
                              child: TextFormField(
                                controller: _websiteController,
                              ),
                            ),
                            const SizedBox(height: 14),
                            ReferralSourceFields(
                              source: _discoverySource,
                              onSourceChanged: (value) => setState(() {
                                _discoverySource = value;
                                if (value !=
                                    ReferralSourceFields.personalReferral) {
                                  _referrerNameController.clear();
                                }
                              }),
                              referrerNameController: _referrerNameController,
                              dark: true,
                              enabled: !_loading,
                            ),
                            const SizedBox(height: 16),
                            CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              activeColor: green,
                              checkColor: background,
                              value: _consent,
                              onChanged: (value) {
                                setState(() => _consent = value == true);
                              },
                              title: const Text(
                                'Email me launch updates and beta invitations.',
                                style: TextStyle(color: Colors.white),
                              ),
                              subtitle: !_consent
                                  ? const Text(
                                      'Required to join.',
                                      style: TextStyle(
                                        color: Color(0xFFFFB34D),
                                      ),
                                    )
                                  : null,
                              controlAffinity: ListTileControlAffinity.leading,
                            ),
                            const SizedBox(height: 16),
                            FilledButton(
                              onPressed: _loading ? null : _submit,
                              style: FilledButton.styleFrom(
                                backgroundColor: green,
                                foregroundColor: background,
                                padding: const EdgeInsets.all(18),
                              ),
                              child: _loading
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Text('Join Email Alerts'),
                            ),
                            const SizedBox(height: 14),
                            Text(
                              _role == 'business'
                                  ? 'Business launch benefit: free subscription. The 10% platform fee and Scaler pay still apply.'
                                  : 'Early Scalers can build verified history before the broader launch.',
                              style: const TextStyle(color: Color(0xFF88A0B3)),
                            ),
                          ],
                        ),
                      )
                    : Column(
                        children: [
                          const Icon(
                            Icons.check_circle,
                            color: green,
                            size: 64,
                          ),
                          const SizedBox(height: 18),
                          Text(
                            _successMessage!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 26,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'We will email you when your access is ready.',
                            style: TextStyle(color: Color(0xFFB6C7D7)),
                          ),
                          const SizedBox(height: 24),
                          OutlinedButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Back to Scaled Circle'),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String? _required(String? value) {
    return (value?.trim().isEmpty ?? true) ? 'Required.' : null;
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    String? Function(String?)? validator,
    TextInputType? keyboardType,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      validator: validator,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Color(0xFF9EB1C2)),
        enabledBorder: const OutlineInputBorder(
          borderSide: BorderSide(color: Color(0xFF31506B)),
        ),
        focusedBorder: const OutlineInputBorder(
          borderSide: BorderSide(color: Color(0xFF14E39A), width: 2),
        ),
      ),
    );
  }
}
