import 'package:flutter/material.dart';

class ScVerificationCard extends StatelessWidget {
  final bool beforePhotoRequired;
  final bool afterPhotoRequired;
  final bool businessApprovalRequired;

  final ValueChanged<bool> onBeforePhotoChanged;
  final ValueChanged<bool> onAfterPhotoChanged;
  final ValueChanged<bool> onBusinessApprovalChanged;

  const ScVerificationCard({
    super.key,

    required this.beforePhotoRequired,
    required this.afterPhotoRequired,
    required this.businessApprovalRequired,

    required this.onBeforePhotoChanged,
    required this.onAfterPhotoChanged,
    required this.onBusinessApprovalChanged,
  });


  @override
  Widget build(BuildContext context) {

    return Card(
      elevation: 4,

      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),

      child: Padding(
        padding: const EdgeInsets.all(20),

        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,

          children: [

            Row(
              children: [

                const Icon(
                  Icons.verified,
                ),

                const SizedBox(width:10),

                const Text(
                  "Verification Settings",
                  style: TextStyle(
                    fontSize:20,
                    fontWeight:FontWeight.bold,
                  ),
                ),

              ],
            ),


            const SizedBox(height:20),


            SwitchListTile(
              contentPadding: EdgeInsets.zero,

              title: const Text(
                "Before Photo Required",
              ),

              subtitle: const Text(
                "Scaler must upload proof before starting.",
              ),

              value: beforePhotoRequired,

              onChanged:
                  onBeforePhotoChanged,
            ),



            SwitchListTile(
              contentPadding: EdgeInsets.zero,

              title: const Text(
                "After Photo Required",
              ),

              subtitle: const Text(
                "Scaler must upload completion proof.",
              ),

              value: afterPhotoRequired,

              onChanged:
                  onAfterPhotoChanged,
            ),



            SwitchListTile(
              contentPadding: EdgeInsets.zero,

              title: const Text(
                "Business Approval Required",
              ),

              subtitle: const Text(
                "Business approves before payout.",
              ),

              value: businessApprovalRequired,

              onChanged:
                  onBusinessApprovalChanged,
            ),

          ],
        ),
      ),
    );
  }
}