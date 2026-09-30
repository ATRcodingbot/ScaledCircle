import 'package:flutter/material.dart';

import '../models/user/user_profile.dart';
import '../services/affiliate_service.dart';
import 'app_router.dart';
import 'app_routes.dart';

/// Only trusted in-app callers carry return destinations. URL query strings
/// never grant a redirect; the destination retains its existing route guards.
class PublicAuthArguments {
  const PublicAuthArguments({this.returnRoute});
  final String? returnRoute;
}

UserRole publicAuthRole(Uri? route) =>
    route?.queryParameters['role'] == 'scaler'
    ? UserRole.scaler
    : UserRole.business;

String? publicAuthReferral(Uri? route, {Uri? browserLocation}) {
  final code =
      route?.queryParameters['ref'] ??
      AffiliateService.referralCodeFromUri(browserLocation ?? Uri.base);
  final normalized = code?.trim().toUpperCase();
  return normalized != null &&
          RegExp(r'^[A-HJ-NP-Z2-9]{6,16}$').hasMatch(normalized)
      ? normalized
      : null;
}

String publicAuthLocation(String path, UserRole role, {String? referralCode}) {
  return Uri(
    path: path,
    queryParameters: {
      'role': role == UserRole.scaler ? 'scaler' : 'business',
      if (referralCode != null &&
          RegExp(r'^[A-HJ-NP-Z2-9]{6,16}$').hasMatch(referralCode))
        'ref': referralCode,
    },
  ).toString();
}

void openNamedRegistration(
  BuildContext context,
  UserRole role, {
  String? returnRoute,
  String? referralCode,
}) {
  final current = Uri.tryParse(ModalRoute.of(context)?.settings.name ?? '');
  AppNavigation.push(
    context,
    publicAuthLocation(
      AppRoutes.createAccount,
      role,
      referralCode: referralCode ?? publicAuthReferral(current),
    ),
    arguments: PublicAuthArguments(returnRoute: returnRoute),
  );
}
