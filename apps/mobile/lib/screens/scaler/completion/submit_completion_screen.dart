import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../services/campaign/completion_submission_service.dart';

class SubmitCompletionScreen extends StatefulWidget {
  final String campaignId;
  final String businessId;
  final String zoneId;
  final String zoneName;
  final String routeId;
  final int gpsPointCount;
  final bool routeSimulated;

  const SubmitCompletionScreen({
    super.key,
    required this.campaignId,
    required this.businessId,
    required this.zoneId,
    required this.zoneName,
    required this.routeId,
    required this.gpsPointCount,
    required this.routeSimulated,
  });

  @override
  State<SubmitCompletionScreen> createState() => _SubmitCompletionScreenState();
}

class _SubmitCompletionScreenState extends State<SubmitCompletionScreen> {
  final CompletionSubmissionService _completionService =
      CompletionSubmissionService();

  final TextEditingController _notesController = TextEditingController();

  bool _submitting = false;

  String? _completionId;

  String? _loadError;

  @override
  void initState() {
    super.initState();

    _createDraftCompletion();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _createDraftCompletion() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return;
    }

    try {
      final completionId = await _completionService.createDraftCompletion(
        campaignId: widget.campaignId,
        businessId: widget.businessId,
        scalerId: user.uid,
        zoneId: widget.zoneId,
        zoneName: widget.zoneName,
        routeId: widget.routeId,
      );

      if (!mounted) return;

      setState(() {
        _completionId = completionId;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loadError = error.toString();
      });
    }
  }

  Future<void> _submitCompletion() async {
    if (_completionId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Completion is still loading.")),
      );

      return;
    }

    setState(() {
      _submitting = true;
    });

    try {
      await _completionService.submitCompletion(
        completionId: _completionId!,
        scalerNotes: _notesController.text.trim(),
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Completion submitted for review.")),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Unable to submit completion: $e")),
      );
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Submit Completion")),

      body: ListView(
        padding: const EdgeInsets.all(20),

        children: [
          const Text(
            "Completion Proof",

            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 10),

          const Text(
            "Marketing campaign completion is verified from the saved GPS "
            "route. No photo is required.",
          ),

          const SizedBox(height: 25),

          Card(
            child: ListTile(
              leading: const Icon(Icons.route),

              title: Text(
                _loadError != null
                    ? "GPS Route Verification Failed"
                    : _completionId == null
                    ? "Verifying GPS Route..."
                    : "GPS Route Ready",
              ),

              subtitle: Text(
                "${widget.gpsPointCount} recorded points"
                "${widget.routeSimulated ? ' (test simulation)' : ''}",
              ),

              trailing: _loadError != null
                  ? const Icon(Icons.error_outline, color: Colors.red)
                  : _completionId == null
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.verified, color: Colors.green),
            ),
          ),

          if (_loadError != null) ...[
            const SizedBox(height: 10),
            Text(
              _loadError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],

          const SizedBox(height: 20),

          TextField(
            controller: _notesController,

            maxLines: 5,

            decoration: const InputDecoration(
              labelText: "Completion Notes",

              hintText: "Describe the work completed...",

              border: OutlineInputBorder(),
            ),
          ),

          const SizedBox(height: 35),

          SizedBox(
            height: 55,

            child: ElevatedButton(
              onPressed: _submitting || _completionId == null
                  ? null
                  : _submitCompletion,

              child: _submitting
                  ? const SizedBox(
                      height: 22,

                      width: 22,

                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text("Submit Completion"),
            ),
          ),
        ],
      ),
    );
  }
}
