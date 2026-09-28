import 'package:flutter/material.dart';

/// The same authored workflow diagram as web/marketing/businesses.html.
/// Coordinates, colors and labels are kept together for comparison with its SVG.
/// This contains no geographic, customer, route or performance data.
class CampaignWorkflowIllustration extends StatelessWidget {
  const CampaignWorkflowIllustration({super.key});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: const Color(0xEE0B202D),
      border: Border.all(color: const Color(0xFF406472)),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            ExcludeSemantics(
              child: Icon(Icons.circle, size: 7, color: Color(0xFF14E39A)),
            ),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'One connected campaign',
                style: TextStyle(color: Color(0xFFC8DCE4), fontSize: 14),
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Semantics(
          image: true,
          label:
              'Workflow illustration of an assigned area and field work. '
              'Not a real location, live campaign or recorded route.',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: const AspectRatio(
              aspectRatio: 360 / 160,
              child: CustomPaint(painter: _WorkflowPainter()),
            ),
          ),
        ),
        const SizedBox(height: 18),
        const _ProofRow('Assigned area', 'Clear scope'),
        const _ProofRow('Field execution', 'Reviewable route'),
        const _ProofRow('Campaign responses', 'Connected evidence'),
        const SizedBox(height: 12),
        const Text(
          'Workflow illustration · not a live campaign or performance claim',
          style: TextStyle(color: Color(0xFF8DADBD), fontSize: 13, height: 1.5),
        ),
      ],
    ),
  );
}

class _ProofRow extends StatelessWidget {
  const _ProofRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 14),
    decoration: const BoxDecoration(
      border: Border(top: BorderSide(color: Color(0xFF355463))),
    ),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final labelWidget = Text(
          label,
          style: const TextStyle(color: Color(0xFFACC7D2), fontSize: 14),
        );
        final valueWidget = Text(
          value,
          style: const TextStyle(
            color: Color(0xFFE5FFF4),
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        );
        if (constraints.maxWidth < 300 ||
            MediaQuery.textScalerOf(context).scale(14) > 21) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [labelWidget, const SizedBox(height: 5), valueWidget],
          );
        }
        return Row(
          children: [
            Expanded(child: labelWidget),
            const SizedBox(width: 16),
            Flexible(child: valueWidget),
          ],
        );
      },
    ),
  );
}

class _WorkflowPainter extends CustomPainter {
  const _WorkflowPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 360, size.height / 160);
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, 360, 160),
      Paint()..color = const Color(0xFF102D3A),
    );
    // SVG: M0 35h360M0 95h360M65 0v160M170 0v160M280 0v160
    final streets = Path()
      ..moveTo(0, 35)
      ..lineTo(360, 35)
      ..moveTo(0, 95)
      ..lineTo(360, 95)
      ..moveTo(65, 0)
      ..lineTo(65, 160)
      ..moveTo(170, 0)
      ..lineTo(170, 160)
      ..moveTo(280, 0)
      ..lineTo(280, 160);
    canvas.drawPath(
      streets,
      Paint()
        ..color = const Color(0xFF325463)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 12,
    );
    // SVG: M78 20h184v114H78Z; 5-unit dash/gap, 10% green fill.
    final area = Path()..addRect(const Rect.fromLTWH(78, 20, 184, 114));
    canvas.drawPath(
      area,
      Paint()..color = const Color(0xFF14E39A).withValues(alpha: .1),
    );
    final outline = Paint()
      ..color = const Color(0xFF14E39A)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final metric in area.computeMetrics()) {
      for (double offset = 0; offset < metric.length; offset += 10) {
        canvas.drawPath(metric.extractPath(offset, offset + 5), outline);
      }
    }
    // SVG: M92 115V50h145v65h-70V75
    final work = Path()
      ..moveTo(92, 115)
      ..lineTo(92, 50)
      ..lineTo(237, 50)
      ..lineTo(237, 115)
      ..lineTo(167, 115)
      ..lineTo(167, 75);
    canvas.drawPath(
      work,
      Paint()
        ..color = const Color(0xFF5AE5B9)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawCircle(
      const Offset(92, 115),
      8,
      Paint()..color = const Color(0xFF14E39A),
    );
    canvas.drawCircle(const Offset(167, 75), 6, Paint()..color = Colors.white);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_WorkflowPainter oldDelegate) => false;
}
