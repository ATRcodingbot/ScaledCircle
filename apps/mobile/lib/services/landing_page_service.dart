import 'package:cloud_functions/cloud_functions.dart';

class LandingPageService {
  LandingPageService({FirebaseFunctions? functions})
    : _functions =
          functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');
  final FirebaseFunctions _functions;

  Future<Map<String, dynamic>> create({
    required Map<String, dynamic> content,
    required bool tracking,
  }) async {
    final result = await _functions
        .httpsCallable('getLandingPageWorkspace')
        .call(<String, dynamic>{
          'action': 'create',
          'content': content,
          'trackingMode': tracking ? 'first_party' : 'off',
        });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> load(String pageId) async {
    final result = await _functions
        .httpsCallable('getLandingPageWorkspace')
        .call(<String, dynamic>{'pageId': pageId});
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> list() async {
    final result = await _functions.httpsCallable('getLandingPageWorkspace').call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> save(
    String pageId,
    Map<String, dynamic> content, {
    required bool tracking,
  }) async {
    final result = await _functions
        .httpsCallable('mutateLandingPageDraft')
        .call(<String, dynamic>{
          'pageId': pageId,
          'content': content,
          'trackingMode': tracking ? 'first_party' : 'off',
        });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> transition(String pageId, String action) async {
    final result = await _functions.httpsCallable('transitionLandingPage').call(
      <String, dynamic>{'pageId': pageId, 'action': action},
    );
    return Map<String, dynamic>.from(result.data as Map);
  }
}
