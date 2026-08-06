import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/wallet_service.dart';

class BusinessDashboardScreen extends StatefulWidget {
  const BusinessDashboardScreen({super.key});

  @override
  State<BusinessDashboardScreen> createState() =>
      _BusinessDashboardScreenState();
}

class _BusinessDashboardScreenState extends State<BusinessDashboardScreen> {
  final WalletService _walletService = WalletService();

  bool _loading = true;

  double _availableCredits = 0.0;
  double _reservedCredits = 0.0;

  String? _errorMessage;

  @override
  void initState() {
    super.initState();

    _initializeBusinessWallet();
  }

  Future<void> _initializeBusinessWallet() async {
    try {
      final user = FirebaseAuth.instance.currentUser;

      if (user == null) {
        throw Exception('You must be logged in.');
      }

      await _walletService.createWallet(
        userId: user.uid,
        ownerType: 'business',
      );

      // DEVELOPMENT-ONLY TEST CREDITS.
      //
      // The promoKey makes this grant idempotent:
      // the same account will not receive it twice.
      //
      // Remove this automatic grant before production.
      await _walletService.grantPromotionalCredits(
        businessId: user.uid,
        amount: 10000.0,
        promoKey: 'development-business-10000-v1',
        description: 'Development promotional credits for marketplace testing.',
      );

      await _loadWalletBalances();
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _errorMessage = 'Unable to initialize business wallet: $e';

        _loading = false;
      });
    }
  }

  Future<void> _loadWalletBalances() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    final availableCredits = await _walletService.getAvailableCredits(user.uid);

    final reservedCredits = await _walletService.getReservedCredits(user.uid);

    if (!mounted) {
      return;
    }

    setState(() {
      _availableCredits = availableCredits;
      _reservedCredits = reservedCredits;
      _errorMessage = null;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Business Dashboard'),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: _loadWalletBalances,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Scaled Circle Business',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text('Manage campaign funding and secured worker pay.'),
            const SizedBox(height: 24),
            if (_loading)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(30),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            if (!_loading && _errorMessage != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      const Icon(Icons.error_outline, size: 42),
                      const SizedBox(height: 10),
                      Text(_errorMessage!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _initializeBusinessWallet,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            if (!_loading && _errorMessage == null) ...[
              Row(
                children: [
                  Expanded(
                    child: _walletCard(
                      icon: Icons.account_balance_wallet_outlined,
                      label: 'Available Credits',
                      value: '\$${_availableCredits.toStringAsFixed(2)}',
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _walletCard(
                      icon: Icons.lock_outline,
                      label: 'Reserved Credits',
                      value: '\$${_reservedCredits.toStringAsFixed(2)}',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.science_outlined),
                          SizedBox(width: 10),
                          Text(
                            'Development Funding',
                            style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'This account is currently receiving test promotional credits so campaigns can be funded without using real Stripe payments.',
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'These credits have no cash value and should be removed from the client app before production.',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _walletCard({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Icon(icon, size: 30),
            const SizedBox(height: 10),
            Text(
              value,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 5),
            Text(label, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
