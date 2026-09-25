import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';

String growthReadFailure(Object error, {bool privateWorkspace = false}) {
  if (error is FirebaseFunctionsException) {
    switch (error.code) {
      case 'unauthenticated':
        return 'Sign in to load this workspace, then retry.';
      case 'permission-denied':
        return privateWorkspace
            ? 'This account cannot access the private ScaledCircle workspace. Use your authorized ScaledCircle account.'
            : 'This account cannot access this Business workspace. Select your authorized Business account.';
      case 'not-found':
        return 'This workspace is unavailable. Check your selected Business, then retry.';
      case 'data-loss':
        return 'The service returned an unreadable workspace response. Retry later; your saved records have not been replaced.';
    }
  }
  if (error is FormatException || error is TypeError) {
    return 'The service returned an incompatible workspace response. Retry later; your saved records have not been replaced.';
  }
  if (error is TimeoutException) {
    return 'The workspace took too long to respond. Retry to load saved activity.';
  }
  return 'The workspace service is temporarily unavailable. Retry to load saved activity. No research will be started.';
}
