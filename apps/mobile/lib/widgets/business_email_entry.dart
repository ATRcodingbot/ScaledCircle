import 'package:flutter/material.dart';
import '../services/business_email_service.dart';
import '../navigation/app_router.dart';

class BusinessEmailEntry extends StatefulWidget {
  const BusinessEmailEntry({super.key});
  @override
  State<BusinessEmailEntry> createState() => _BusinessEmailEntryState();
}

class _BusinessEmailEntryState extends State<BusinessEmailEntry> {
  late final Future<Map<String, dynamic>?> _availability;
  @override
  void initState() {
    super.initState();
    _availability = _check();
  }

  Future<Map<String, dynamic>?> _check() async {
    try {
      return await BusinessEmailService().availability();
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>?>(
    future: _availability,
    builder: (context, snapshot) {
      if (snapshot.data?['available'] != true) return const SizedBox.shrink();
      return ListTile(
        leading: const Icon(Icons.email_outlined),
        title: const Text('Email Connection · Private Beta'),
        subtitle: const Text('Business replies and owner-approved outreach'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => AppNavigation.push(context, '/business/email-connection'),
      );
    },
  );
}
