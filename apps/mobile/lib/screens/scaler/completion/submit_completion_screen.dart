import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../services/completion_service.dart';

class SubmitCompletionScreen extends StatefulWidget {
  final String campaignId;

  const SubmitCompletionScreen({super.key, required this.campaignId});

  @override
  State<SubmitCompletionScreen> createState() => _SubmitCompletionScreenState();
}

class _SubmitCompletionScreenState extends State<SubmitCompletionScreen> {
  final CompletionService _completionService = CompletionService();

  final TextEditingController _notesController = TextEditingController();

  bool _submitting = false;

  final List<String> _photos = [];

  @override
  void dispose() {
    _notesController.dispose();

    super.dispose();
  }

  Future<void> _submitCompletion() async {
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("You must be logged in.")));

      return;
    }

    setState(() {
      _submitting = true;
    });

    try {
      await _completionService.submitCompletion(
        campaignId: widget.campaignId,

        scalerId: user.uid,

        photos: _photos,

        notes: _notesController.text.trim(),
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

  void _addPhotoPlaceholder() {
    setState(() {
      _photos.add("photo_${_photos.length + 1}");
    });
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
            "Add photos and notes showing the campaign was completed.",
          ),

          const SizedBox(height: 25),

          Card(
            child: ListTile(
              leading: const Icon(Icons.photo_camera),

              title: Text("${_photos.length} Photos Added"),

              trailing: IconButton(
                icon: const Icon(Icons.add),

                onPressed: _addPhotoPlaceholder,
              ),
            ),
          ),

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
              onPressed: _submitting ? null : _submitCompletion,

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
