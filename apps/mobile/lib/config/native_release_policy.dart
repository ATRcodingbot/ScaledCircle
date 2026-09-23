import 'package:flutter/foundation.dart';

/// This native version ships Core OS and Scaler account tools. The restriction
/// applies to every account and cannot be changed by an entitlement or flag.
abstract final class NativeReleasePolicy {
  static const premiumToolsAvailable = kIsWeb;

  static const webOnlyPaths = {
    '/business/email-connection',
    '/business/growth',
    '/business/growth-agents',
    '/business/ai-team',
    '/growth-agents',
    '/business/social-operations',
    '/business/landing-pages',
    '/business/brand-assets',
    '/business/physical-marketing',
    '/business/postcards',
    '/business/tracking-numbers',
    '/business/attribution',
    '/admin/postcards',
    '/admin',
    '/sales',
  };

  static bool allowsRoute(String location, {bool web = kIsWeb}) {
    if (web) return true;
    final uri = Uri.tryParse(location);
    if (uri == null) return false;
    final path = uri.path.replaceFirst(RegExp(r'/+$'), '');
    return !webOnlyPaths.any((p) => path == p || path.startsWith('$p/'));
  }

  static bool includesService(String plan, {bool web = kIsWeb}) =>
      web || const {'starter', 'growth', 'scale'}.contains(plan);

  static void requirePremiumWeb() {
    if (!premiumToolsAvailable) {
      throw StateError('This tool is not included in this native app version.');
    }
  }
}
