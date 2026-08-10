import 'package:web/web.dart' as web;

const _storageKey = 'scaledCircleEarlyAccessPromptShown';

bool hasShownEarlyAccessPrompt() {
  return web.window.sessionStorage.getItem(_storageKey) == 'true';
}

void markEarlyAccessPromptShown() {
  web.window.sessionStorage.setItem(_storageKey, 'true');
}
