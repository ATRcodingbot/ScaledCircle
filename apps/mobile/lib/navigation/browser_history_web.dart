import 'package:web/web.dart' as web;

const bool canUseBrowserHistoryBack = true;

void browserHistoryBack() => web.window.history.back();
