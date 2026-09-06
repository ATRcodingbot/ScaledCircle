bool prohibitsResidentialPhotos(Object? type) {
  final normalized = '$type'.toLowerCase().replaceAll(RegExp('[^a-z0-9]'), '');
  return const {
    'neighborhoodcanvassing',
    'canvassing',
    'flyerdistribution',
    'flyer',
    'doorhanger',
    'doorhangers',
    'doorhangerdistribution',
  }.contains(normalized);
}
