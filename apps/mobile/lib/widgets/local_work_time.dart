import 'package:flutter/material.dart';

String localWorkTime(BuildContext context, DateTime? date) {
  if (date == null) return 'Not recorded';
  final local = date.toLocal();
  final labels = MaterialLocalizations.of(context);
  return '${labels.formatMediumDate(local)}, ${labels.formatTimeOfDay(TimeOfDay.fromDateTime(local))}';
}
