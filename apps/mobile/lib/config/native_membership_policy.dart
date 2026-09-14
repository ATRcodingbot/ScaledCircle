import 'package:flutter/foundation.dart';

/// Store companion apps consume existing memberships. Web billing remains the
/// purchase surface; do not add an external purchase CTA to native clients.
abstract final class NativeMembershipPolicy {
  static bool get purchasesAllowed => kIsWeb;

  static void requireWebPurchase() {
    if (!purchasesAllowed) {
      throw StateError('Membership purchases are not available in this app.');
    }
  }
}
