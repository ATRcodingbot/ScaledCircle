import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/public_site_service.dart';
import '../../widgets/referral_source_fields.dart';

Future<void> showEarlyAccessDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierColor: const Color(0xE8020914),
    builder: (_) => const _EarlyAccessDialog(),
  );
}

class _EarlyAccessDialog extends StatefulWidget {
  const _EarlyAccessDialog();

  @override
  State<_EarlyAccessDialog> createState() => _EarlyAccessDialogState();
}

class _EarlyAccessDialogState extends State<_EarlyAccessDialog> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _companyController = TextEditingController();
  final _emailController = TextEditingController();
  final _contactNumberController = TextEditingController();
  final _postalController = TextEditingController();
  final _websiteController = TextEditingController();
  final _referrerNameController = TextEditingController();

  String _role = 'business';
  String? _discoverySource;
  bool _consent = false;
  bool _submitting = false;
  String? _successMessage;

  @override
  void dispose() {
    _nameController.dispose();
    _companyController.dispose();
    _emailController.dispose();
    _contactNumberController.dispose();
    _postalController.dispose();
    _websiteController.dispose();
    _referrerNameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false) || !_consent) {
      setState(() {});
      return;
    }

    setState(() => _submitting = true);
    try {
      final result = await PublicSiteService.joinWaitlist(
        role: _role,
        displayName: _nameController.text.trim(),
        email: _emailController.text.trim(),
        companyName: _role == 'business' ? _companyController.text.trim() : '',
        postalCode: _postalController.text.trim(),
        contactNumber: _contactNumberController.text.trim(),
        website: _websiteController.text.trim(),
        consent: true,
        source: 'flutter_home_modal',
        discoverySource: _discoverySource!,
        referrerName: _discoverySource == ReferralSourceFields.personalReferral
            ? _referrerNameController.text.trim()
            : '',
      );
      if (!mounted) return;
      setState(() {
        _successMessage = result.alreadyJoined
            ? 'You are already on the list. We updated your details.'
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
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _close() => Navigator.of(context).pop();

  String? _required(String? value) {
    return (value?.trim().isEmpty ?? true) ? 'Required.' : null;
  }

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFF020914);
    const panel = Color(0xFF071525);
    const border = Color(0xFF173653);
    const green = Color(0xFF14E39A);

    return Shortcuts(
      shortcuts: const {
        SingleActivator(LogicalKeyboardKey.escape): _DismissDialogIntent(),
      },
      child: Actions(
        actions: {
          _DismissDialogIntent: CallbackAction<_DismissDialogIntent>(
            onInvoke: (_) {
              _close();
              return null;
            },
          ),
        },
        child: Focus(
          autofocus: true,
          child: Dialog(
            backgroundColor: Colors.transparent,
            insetPadding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 640, maxHeight: 760),
              child: Material(
                color: panel,
                shape: RoundedRectangleBorder(
                  side: const BorderSide(color: border),
                  borderRadius: BorderRadius.circular(24),
                ),
                clipBehavior: Clip.antiAlias,
                child: Stack(
                  children: [
                    SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(28, 30, 28, 28),
                      child: _successMessage == null
                          ? Form(
                              key: _formKey,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  const Padding(
                                    padding: EdgeInsets.only(right: 52),
                                    child: Text(
                                      'Maryland Early Sign Up!',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 30,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  SegmentedButton<String>(
                                    segments: const [
                                      ButtonSegment(
                                        value: 'business',
                                        label: Text('Business'),
                                        icon: Icon(Icons.business_outlined),
                                      ),
                                      ButtonSegment(
                                        value: 'scaler',
                                        label: Text('Scaler'),
                                        icon: Icon(Icons.directions_walk),
                                      ),
                                    ],
                                    selected: {_role},
                                    onSelectionChanged: _submitting
                                        ? null
                                        : (selection) => setState(
                                            () => _role = selection.first,
                                          ),
                                  ),
                                  const SizedBox(height: 18),
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
                                      return text.contains('@') &&
                                              text.contains('.')
                                          ? null
                                          : 'Enter a valid email.';
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
                                    controller: _postalController,
                                    label: 'ZIP / postal code',
                                    keyboardType: TextInputType.number,
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
                                          ReferralSourceFields
                                              .personalReferral) {
                                        _referrerNameController.clear();
                                      }
                                    }),
                                    referrerNameController:
                                        _referrerNameController,
                                    dark: true,
                                    enabled: !_submitting,
                                  ),
                                  const SizedBox(height: 10),
                                  CheckboxListTile(
                                    contentPadding: EdgeInsets.zero,
                                    activeColor: green,
                                    checkColor: background,
                                    value: _consent,
                                    onChanged: _submitting
                                        ? null
                                        : (value) => setState(
                                            () => _consent = value == true,
                                          ),
                                    title: const Text(
                                      'Email me launch updates and beta invitations.',
                                      style: TextStyle(color: Colors.white),
                                    ),
                                    subtitle: !_consent
                                        ? const Text(
                                            'Required to join email alerts.',
                                            style: TextStyle(
                                              color: Color(0xFFFFB34D),
                                            ),
                                          )
                                        : null,
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
                                  ),
                                  const SizedBox(height: 10),
                                  FilledButton(
                                    onPressed: _submitting ? null : _submit,
                                    style: FilledButton.styleFrom(
                                      backgroundColor: green,
                                      foregroundColor: background,
                                      padding: const EdgeInsets.all(18),
                                    ),
                                    child: _submitting
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
                                    style: const TextStyle(
                                      color: Color(0xFF88A0B3),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : Padding(
                              padding: const EdgeInsets.symmetric(vertical: 54),
                              child: Column(
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
                                      fontSize: 24,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  OutlinedButton(
                                    onPressed: _close,
                                    child: const Text('Continue Exploring'),
                                  ),
                                ],
                              ),
                            ),
                    ),
                    Positioned(
                      right: 8,
                      top: 8,
                      child: SizedBox.square(
                        dimension: 48,
                        child: IconButton(
                          tooltip: 'Close early sign up',
                          onPressed: _close,
                          style: IconButton.styleFrom(
                            foregroundColor: Colors.white,
                            backgroundColor: const Color(0xFF102A41),
                          ),
                          icon: const Icon(Icons.close, size: 28),
                        ),
                      ),
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
        errorBorder: const OutlineInputBorder(
          borderSide: BorderSide(color: Color(0xFFFF6B6B)),
        ),
      ),
    );
  }
}

class _DismissDialogIntent extends Intent {
  const _DismissDialogIntent();
}
