bool _shownInThisAppSession = false;

bool hasShownEarlyAccessPrompt() => _shownInThisAppSession;

void markEarlyAccessPromptShown() {
  _shownInThisAppSession = true;
}
