Map<String, dynamic> ownTeamCapacityInput(
  double hours,
  String count,
  String? pattern,
) {
  final headcount = int.tryParse(count.trim());
  if (!hours.isFinite || hours < .5 || hours > 192) {
    throw const FormatException(
      'Choose at least 30 minutes of work per person (up to 192 hours).',
    );
  }
  if (headcount == null || headcount < 1) {
    throw const FormatException('Enter a positive whole number of marketers.');
  }
  if (!['split_streets', 'stay_together'].contains(pattern)) {
    throw const FormatException('Choose how your team will cover the area.');
  }
  return {
    'sessionHours': hours,
    'marketerCount': headcount,
    'coveragePattern': pattern,
  };
}
