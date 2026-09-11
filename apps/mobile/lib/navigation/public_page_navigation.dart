import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'app_router.dart';

Future<void> openPublicPage(BuildContext context, String path) async {
  if (kIsWeb) {
    var destination = Uri.base.replace(path: path, fragment: '', query: '');
    final referral = Uri.base.queryParameters['ref'];
    if (referral != null &&
        RegExp(
          r'^[A-HJ-NP-Z2-9]{6,16}$',
          caseSensitive: false,
        ).hasMatch(referral)) {
      destination = destination.replace(
        queryParameters: {'ref': referral.toUpperCase()},
      );
    }
    await launchUrl(destination, webOnlyWindowName: '_self');
  } else {
    AppNavigation.push(context, path);
  }
}
