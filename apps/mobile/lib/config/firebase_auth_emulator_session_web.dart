import 'package:web/web.dart' as web;

void clearRetainedAuthEmulatorOrigin(String appName) {
  // firebase_auth_web restores this hint automatically only when the page
  // hostname is literally "localhost". ScaledCircle staging uses 127.0.0.1,
  // so clear the hint and let useAuthEmulator attach the new JS Auth delegate
  // on every page load.
  web.window.sessionStorage.removeItem('$appName-firebaseEmulatorOrigin');
}
