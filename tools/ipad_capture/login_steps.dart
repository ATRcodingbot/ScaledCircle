import 'dart:async';

const loginSteps = {
  'login-entry',
  'login-open',
  'login-screen',
  'email-find',
  'email-input',
  'password-find',
  'password-obscured',
  'password-input',
  'login-button',
  'login-submit',
  'auth-observe',
  'uid-match',
  'workspace-initialize',
};

/// The UI adapter owns finders; this order and each boundary can be tested offline.
Future<void> runLoginSteps(
  Future<String> Function(String step) perform,
  Future<void> Function(String step, int seconds, Future<void> Function())
  stage,
) async {
  var entry = '';
  await stage('login-entry', 5, () async {
    entry = await perform('login-entry');
  });
  if (entry == 'public') {
    await stage('login-open', 8, () async {
      await perform('login-open');
    });
  }
  for (final step in [
    'login-screen',
    'email-find',
    'email-input',
    'password-find',
    'password-obscured',
    'password-input',
    'login-button',
    'login-submit',
  ]) {
    await stage(step, 6, () async {
      await perform(step);
    });
  }
  await stage('auth-observe', 30, () async {
    await perform('auth-observe');
  });
  await stage('uid-match', 5, () async {
    await perform('uid-match');
  });
  await stage('workspace-initialize', 35, () async {
    await perform('workspace-initialize');
  });
}
