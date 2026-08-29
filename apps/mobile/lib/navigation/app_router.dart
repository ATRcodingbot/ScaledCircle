import 'package:flutter/material.dart';

import 'browser_history.dart';

typedef AppRouteFactory = Route<dynamic> Function(RouteSettings settings);

class AppRouteInformationParser extends RouteInformationParser<Uri> {
  const AppRouteInformationParser();

  @override
  Future<Uri> parseRouteInformation(RouteInformation routeInformation) async {
    return routeInformation.uri;
  }

  @override
  RouteInformation restoreRouteInformation(Uri configuration) {
    return RouteInformation(uri: configuration);
  }
}

class AppRouterDelegate extends RouterDelegate<Uri>
    with ChangeNotifier, PopNavigatorRouterDelegateMixin<Uri> {
  AppRouterDelegate(this._routeFactory);

  final AppRouteFactory _routeFactory;

  @override
  final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  Uri _location = Uri(path: '/');
  Object? _arguments;
  final List<Uri> _appHistory = <Uri>[];
  bool _browserBackPending = false;

  @override
  Uri get currentConfiguration => _location;

  void navigate(
    String location, {
    bool replace = false,
    BuildContext? context,
    Object? arguments,
  }) {
    final next = Uri.parse(location);
    if (next == _location) return;

    void update() {
      if (!replace) _appHistory.add(_location);
      _location = next;
      _arguments = arguments;
      notifyListeners();
    }

    if (replace && context != null) {
      Router.neglect(context, update);
    } else if (!replace && context != null) {
      Router.navigate(context, update);
    } else {
      update();
    }
  }

  bool popPreviousBusinessRoute(BuildContext context) {
    if (_browserBackPending) return true;
    while (_appHistory.isNotEmpty) {
      final previous = _appHistory.removeLast();
      if (!_isBusinessRoute(previous)) continue;
      if (canUseBrowserHistoryBack) {
        _browserBackPending = true;
        browserHistoryBack();
      } else {
        Router.neglect(context, () {
          _location = previous;
          _arguments = null;
          notifyListeners();
        });
      }
      return true;
    }
    return false;
  }

  static bool _isBusinessRoute(Uri location) =>
      location.path == '/business' || location.path.startsWith('/business/');

  @override
  Future<void> setNewRoutePath(Uri configuration) async {
    _browserBackPending = false;
    _appHistory.clear();
    _location = configuration;
    _arguments = null;
    notifyListeners();
  }

  @override
  Widget build(BuildContext context) {
    final settings = RouteSettings(
      name: _location.toString(),
      arguments: _arguments,
    );
    return AppRouterScope(
      delegate: this,
      child: Navigator(
        key: navigatorKey,
        pages: <Page<dynamic>>[
          _AppRoutePage(settings: settings, routeFactory: _routeFactory),
        ],
        onGenerateRoute: _routeFactory,
        onDidRemovePage: (_) {},
      ),
    );
  }
}

class _AppRoutePage extends Page<dynamic> {
  _AppRoutePage({required this.settings, required this.routeFactory})
    : super(
        key: ValueKey<String?>(settings.name),
        name: settings.name,
        arguments: settings.arguments,
      );

  final RouteSettings settings;
  final AppRouteFactory routeFactory;

  @override
  Route<dynamic> createRoute(BuildContext context) => routeFactory(this);
}

class AppRouterScope extends InheritedWidget {
  const AppRouterScope({
    super.key,
    required this.delegate,
    required super.child,
  });

  final AppRouterDelegate delegate;

  static AppRouterDelegate? maybeOf(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppRouterScope>();
    return scope?.delegate;
  }

  @override
  bool updateShouldNotify(AppRouterScope oldWidget) =>
      delegate != oldWidget.delegate;
}

abstract final class AppNavigation {
  static void push(BuildContext context, String location, {Object? arguments}) {
    final delegate = AppRouterScope.maybeOf(context);
    if (delegate == null) {
      Navigator.of(context).pushNamed(location, arguments: arguments);
      return;
    }
    delegate.navigate(location, context: context, arguments: arguments);
  }

  static void replace(
    BuildContext context,
    String location, {
    Object? arguments,
  }) {
    final delegate = AppRouterScope.maybeOf(context);
    if (delegate == null) {
      Navigator.of(
        context,
      ).pushReplacementNamed(location, arguments: arguments);
      return;
    }
    delegate.navigate(
      location,
      replace: true,
      context: context,
      arguments: arguments,
    );
  }
}
