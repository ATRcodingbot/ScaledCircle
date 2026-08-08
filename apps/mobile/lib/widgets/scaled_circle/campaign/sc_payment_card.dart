import 'package:flutter/material.dart';

import '../sc_card.dart';

class ScPaymentCard extends StatelessWidget {
  final double basePay;
  final double bonus;

  const ScPaymentCard({super.key, required this.basePay, required this.bonus});

  @override
  Widget build(BuildContext context) {
    final total = basePay + bonus;

    return ScCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,

        children: [
          const Row(
            children: [
              Icon(Icons.payments_outlined),

              SizedBox(width: 10),

              Text(
                "Scaler Payment",

                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ],
          ),

          const SizedBox(height: 18),

          _PaymentRow(label: "Base Pay", amount: basePay),

          const SizedBox(height: 12),

          _PaymentRow(label: "Completion Bonus", amount: bonus),

          const Divider(height: 28),

          _PaymentRow(label: "Maximum Earnings", amount: total, bold: true),
        ],
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  final String label;
  final double amount;
  final bool bold;

  const _PaymentRow({
    required this.label,
    required this.amount,
    this.bold = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,

      children: [
        Text(
          label,

          style: TextStyle(
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),

        Text(
          "\$${amount.toStringAsFixed(2)}",

          style: TextStyle(
            fontSize: bold ? 18 : 16,

            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ],
    );
  }
}
