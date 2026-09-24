// These interfaces are pinned transitive dependencies of the Firebase SDKs.
// ignore_for_file: depend_on_referenced_packages

import 'dart:async';

import 'package:cloud_firestore_platform_interface/cloud_firestore_platform_interface.dart'
    as firestore;
import 'package:cloud_functions_platform_interface/cloud_functions_platform_interface.dart'
    as functions;
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart'
    as auth;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart'
    as core;
import 'package:flutter_test/flutter_test.dart';

/// An entirely in-memory Firebase transport for the real campaign route widgets.
///
/// Install before mounting the application, seed [documents], and configure
/// [onCall] for every expected callable. Unmount the widgets before [restore].
/// Each installation uses a distinct app name so FlutterFire's cached public
/// SDK instances cannot retain another test's platform delegates.
///
/// This deliberately supports only the reads used by these workflows. Writes
/// are recorded and rejected; no operation can fall through to a native SDK.
class CampaignRefreshFirebase {
  CampaignRefreshFirebase({String? uid = 'owner'}) {
    _auth = _MemoryAuth(this);
    setUser(uid);
  }

  final documents = <String, Map<String, dynamic>>{};
  final reads = <String>[];
  final gets = <String>[];
  final subscriptions = <String>[];
  final writes = <Object>[];
  final calls = <String>[];
  final callArguments = <Map<String, dynamic>>[];

  /// Return a completer's future here to hold a permission refresh in flight.
  Future<Object?> Function(String name, Map<String, dynamic> data)? onCall;

  final _documentChanges = StreamController<String>.broadcast(sync: true);
  final _documentErrors =
      StreamController<({String path, Object error})>.broadcast(sync: true);
  final _authChanges = StreamController<auth.UserPlatform?>.broadcast(
    sync: true,
  );
  late final _MemoryAuth _auth;
  late core.FirebasePlatform _previousCore;
  core.FirebasePlatform? _previousCoreDelegate;
  late auth.FirebaseAuthPlatform _previousAuth;
  late firestore.FirebaseFirestorePlatform _previousFirestore;
  late functions.FirebaseFunctionsPlatform _previousFunctions;
  FirebaseApp? _app;
  bool _installed = false;
  bool _restored = false;
  static int _nextApp = 0;
  static CampaignRefreshFirebase? _installedHarness;

  Future<void> install() async {
    if (_installed || _restored || _installedHarness != null) {
      throw StateError('Install one fresh CampaignRefreshFirebase at a time.');
    }
    _previousCore = core.FirebasePlatform.instance;
    _previousCoreDelegate = Firebase.delegatePackingProperty;
    _previousAuth = auth.FirebaseAuthPlatform.instance;
    _previousFunctions = functions.FirebaseFunctionsPlatform.instance;
    core.FirebasePlatform.instance = _MemoryCore(
      'campaign-refresh-test-${_nextApp++}',
    );
    Firebase.delegatePackingProperty = core.FirebasePlatform.instance;
    // The default Firestore platform is lazy and requires an initialized app.
    _previousFirestore = firestore.FirebaseFirestorePlatform.instance;
    _app = Firebase.app();
    auth.FirebaseAuthPlatform.instance = _auth;
    firestore.FirebaseFirestorePlatform.instance = _MemoryFirestore(this);
    functions.FirebaseFunctionsPlatform.instance = _MemoryFunctions(this);
    _installed = true;
    _installedHarness = this;
  }

  Future<void> restore() async {
    if (!_installed) return;
    // Deletes only this synthetic app and unregisters its cached auth service.
    await _app!.delete();
    auth.FirebaseAuthPlatform.instance = _previousAuth;
    firestore.FirebaseFirestorePlatform.instance = _previousFirestore;
    functions.FirebaseFunctionsPlatform.instance = _previousFunctions;
    core.FirebasePlatform.instance = _previousCore;
    Firebase.delegatePackingProperty = _previousCoreDelegate;
    _installed = false;
    _restored = true;
    _installedHarness = null;
    await _authChanges.close();
    await _documentChanges.close();
    await _documentErrors.close();
  }

  void setUser(String? uid) {
    if (_restored) throw StateError('The Firebase test transport is restored.');
    _auth.user = uid == null ? null : _MemoryUser(_auth, uid);
    _authChanges.add(_auth.user);
  }

  /// Emits a server snapshot; null represents a deleted or missing document.
  void emitDocument(String path, Map<String, dynamic>? data) {
    if (_restored) throw StateError('The Firebase test transport is restored.');
    if (data == null) {
      documents.remove(path);
    } else {
      documents[path] = _copyMap(data);
    }
    _documentChanges.add(path);
  }

  /// Fails and terminates existing listeners for this document only.
  /// A later subscription starts normally from the current document fixture.
  void emitDocumentError(String path, Object error) {
    if (_restored) throw StateError('The Firebase test transport is restored.');
    _documentErrors.add((path: path, error: error));
  }

  Never _rejectWrite(String method, String path, [Object? data]) {
    writes.add({'method': method, 'path': path, 'data': data});
    throw UnsupportedError('Unexpected Firestore $method at $path');
  }
}

Map<String, dynamic> _copyMap(Map<String, dynamic> data) =>
    data.map((key, value) => MapEntry(key, _copyValue(value)));

dynamic _copyValue(dynamic value) {
  if (value is Map<String, dynamic>) return _copyMap(value);
  if (value is List) return value.map(_copyValue).toList();
  return value;
}

class _MemoryCore extends core.FirebasePlatform {
  _MemoryCore(String name)
    : _app = _MemoryApp(
        name,
        const FirebaseOptions(
          apiKey: 'offline-test-key',
          appId: 'offline-campaign-test',
          messagingSenderId: 'offline-test-sender',
          projectId: 'offline-campaign-test',
        ),
      );

  final _MemoryApp _app;

  @override
  List<core.FirebaseAppPlatform> get apps => [_app];

  @override
  core.FirebaseAppPlatform app([String name = '[DEFAULT]']) {
    if (name != '[DEFAULT]' && name != _app.name) {
      throw UnsupportedError('Unexpected Firebase app: $name');
    }
    return _app;
  }

  @override
  Future<core.FirebaseAppPlatform> initializeApp({
    String? name,
    FirebaseOptions? options,
  }) async => app(name ?? '[DEFAULT]');
}

class _MemoryApp extends core.FirebaseAppPlatform {
  _MemoryApp(super.name, super.options);

  @override
  bool get isAutomaticDataCollectionEnabled => false;

  @override
  Future<void> delete() async {}
}

class _MemoryAuth extends auth.FirebaseAuthPlatform {
  _MemoryAuth(this.backend);

  final CampaignRefreshFirebase backend;
  auth.UserPlatform? user;

  @override
  auth.FirebaseAuthPlatform delegateFor({required FirebaseApp app}) => this;

  @override
  auth.FirebaseAuthPlatform setInitialValues({
    auth.InternalUserDetails? currentUser,
    String? languageCode,
  }) => this;

  @override
  auth.UserPlatform? get currentUser => user;

  @override
  String? get languageCode => 'en';

  Stream<auth.UserPlatform?> _changes() => Stream.multi((controller) {
    final subscription = backend._authChanges.stream.listen(
      controller.add,
      onError: controller.addError,
      onDone: controller.close,
    );
    controller.add(user);
    controller.onCancel = subscription.cancel;
  });

  @override
  Stream<auth.UserPlatform?> authStateChanges() => _changes();

  @override
  Stream<auth.UserPlatform?> idTokenChanges() => _changes();

  @override
  Stream<auth.UserPlatform?> userChanges() => _changes();

  @override
  Future<void> signOut() async => backend.setUser(null);
}

class _MemoryUser extends auth.UserPlatform {
  _MemoryUser(auth.FirebaseAuthPlatform platform, String uid)
    : super(
        platform,
        _UnusedMultiFactor(),
        auth.InternalUserDetails(
          userInfo: auth.InternalUserInfo(
            uid: uid,
            email: '$uid@example.test',
            displayName: uid,
            isAnonymous: false,
            isEmailVerified: true,
          ),
          providerData: [],
        ),
      );

  @override
  Future<void> reload() async {}

  @override
  Future<String?> getIdToken(bool forceRefresh) async => 'offline-test-token';
}

class _UnusedMultiFactor extends Fake implements auth.MultiFactorPlatform {}

class _MemoryFirestore extends firestore.FirebaseFirestorePlatform {
  _MemoryFirestore(this.backend);

  final CampaignRefreshFirebase backend;

  @override
  firestore.FirebaseFirestorePlatform delegateFor({
    required FirebaseApp app,
    required String databaseId,
  }) {
    if (databaseId != '(default)') {
      throw UnsupportedError('Unexpected Firestore database: $databaseId');
    }
    return this;
  }

  @override
  firestore.DocumentReferencePlatform doc(String documentPath) =>
      _MemoryDocument(this, documentPath);

  @override
  firestore.CollectionReferencePlatform collection(String collectionPath) =>
      _MemoryCollection(this, collectionPath);

  @override
  firestore.WriteBatchPlatform batch() =>
      backend._rejectWrite('batch', '(batch)');

  @override
  firestore.Settings get settings => const firestore.Settings();

  firestore.DocumentSnapshotPlatform snapshot(String path) {
    backend.reads.add(path);
    final data = backend.documents[path];
    return firestore.DocumentSnapshotPlatform(
      this,
      path,
      data == null ? null : _copyMap(data),
      firestore.InternalSnapshotMetadata(
        hasPendingWrites: false,
        isFromCache: false,
      ),
    );
  }
}

class _MemoryDocument extends firestore.DocumentReferencePlatform {
  _MemoryDocument(_MemoryFirestore super.firestore, super.path);

  _MemoryFirestore get _db => this.firestore as _MemoryFirestore;

  @override
  Future<firestore.DocumentSnapshotPlatform> get([
    firestore.GetOptions options = const firestore.GetOptions(),
  ]) async {
    _db.backend.gets.add(path);
    return _db.snapshot(path);
  }

  @override
  Stream<firestore.DocumentSnapshotPlatform> snapshots({
    bool includeMetadataChanges = false,
    required firestore.ListenSource listenSource,
  }) => Stream.multi((controller) {
    _db.backend.subscriptions.add(path);
    final subscription = _db.backend._documentChanges.stream
        .where((changedPath) => changedPath == path)
        .listen(
          (_) => controller.add(_db.snapshot(path)),
          onError: controller.addError,
          onDone: controller.close,
        );
    late final StreamSubscription<({String path, Object error})>
    errorSubscription;
    errorSubscription = _db.backend._documentErrors.stream
        .where((event) => event.path == path)
        .listen((event) {
          controller.addError(event.error);
          controller.close();
          unawaited(subscription.cancel());
          unawaited(errorSubscription.cancel());
        });
    controller.add(_db.snapshot(path));
    controller.onCancel = () async {
      await subscription.cancel();
      await errorSubscription.cancel();
    };
  });

  @override
  Future<void> set(
    Map<String, dynamic> data, [
    firestore.SetOptions? options,
  ]) => _db.backend._rejectWrite('set', path, data);

  @override
  Future<void> update(Map<firestore.FieldPath, dynamic> data) =>
      _db.backend._rejectWrite('update', path, data);

  @override
  Future<void> delete() => _db.backend._rejectWrite('delete', path);
}

Map<String, dynamic> _queryParameters() => {
  'where': <List<dynamic>>[],
  'orderBy': <List<dynamic>>[],
  'startAt': null,
  'startAfter': null,
  'endAt': null,
  'endBefore': null,
  'limit': null,
  'limitToLast': null,
};

class _MemoryCollection extends firestore.CollectionReferencePlatform {
  _MemoryCollection(_MemoryFirestore super.firestore, super.path) {
    parameters.addAll(_queryParameters());
  }

  _MemoryQuery get _query =>
      _MemoryQuery(this.firestore as _MemoryFirestore, path, parameters);

  @override
  bool get isCollectionGroupQuery => false;

  @override
  firestore.DocumentReferencePlatform doc([String? path]) {
    if (path == null) {
      return this.firestore.doc('${this.path}/offline-new-document');
    }
    return this.firestore.doc('${this.path}/$path');
  }

  @override
  firestore.QueryPlatform where(List<List<dynamic>> conditions) =>
      _query.where(conditions);

  @override
  firestore.QueryPlatform orderBy(Iterable<List<dynamic>> orders) =>
      _query.orderBy(orders);

  @override
  firestore.QueryPlatform limit(int limit) => _query.limit(limit);

  @override
  Future<firestore.QuerySnapshotPlatform> get([
    firestore.GetOptions options = const firestore.GetOptions(),
  ]) => _query.get(options);

  @override
  Stream<firestore.QuerySnapshotPlatform> snapshots({
    bool includeMetadataChanges = false,
    required firestore.ListenSource listenSource,
  }) => _query.snapshots(
    includeMetadataChanges: includeMetadataChanges,
    listenSource: listenSource,
  );
}

class _MemoryQuery extends firestore.QueryPlatform {
  _MemoryQuery(_MemoryFirestore super.firestore, this.path, super.params);

  final String path;

  _MemoryFirestore get _db => this.firestore as _MemoryFirestore;

  @override
  bool get isCollectionGroupQuery => false;

  @override
  firestore.QueryPlatform where(List<List<dynamic>> conditions) {
    for (final condition in conditions) {
      if (condition[1] != '==') {
        throw UnsupportedError('Unexpected query operator: ${condition[1]}');
      }
    }
    return _MemoryQuery(_db, path, {...parameters, 'where': conditions});
  }

  @override
  firestore.QueryPlatform orderBy(Iterable<List<dynamic>> orders) =>
      _MemoryQuery(_db, path, {...parameters, 'orderBy': orders.toList()});

  @override
  firestore.QueryPlatform limit(int limit) =>
      _MemoryQuery(_db, path, {...parameters, 'limit': limit});

  bool _matches(String documentPath, Map<String, dynamic> data) {
    if (!documentPath.startsWith('$path/') ||
        documentPath.substring(path.length + 1).contains('/')) {
      return false;
    }
    for (final condition in parameters['where'] as List) {
      final field = condition[0];
      final components = field is firestore.FieldPath
          ? field.components
          : field.toString().split('.');
      dynamic value = data;
      if (components.length == 1 && components.single == '__name__') {
        value = documentPath.split('/').last;
      } else {
        for (final component in components) {
          value = value is Map ? value[component] : null;
        }
      }
      if (value != condition[2]) return false;
    }
    return true;
  }

  firestore.QuerySnapshotPlatform _snapshot() {
    _db.backend.reads.add(path);
    var matches = _db.backend.documents.entries.where(
      (entry) => _matches(entry.key, entry.value),
    );
    final limit = parameters['limit'] as int?;
    if (limit != null) matches = matches.take(limit);
    final docs = matches.map((entry) => _db.snapshot(entry.key)).toList();
    // Ordering is intentionally irrelevant to the campaign workflow fixtures.
    // Only the initial added changes are needed by these widgets.
    return firestore.QuerySnapshotPlatform(docs, [
      for (var index = 0; index < docs.length; index++)
        firestore.DocumentChangePlatform(
          firestore.DocumentChangeType.added,
          -1,
          index,
          docs[index],
        ),
    ], firestore.SnapshotMetadataPlatform(false, false));
  }

  @override
  Future<firestore.QuerySnapshotPlatform> get([
    firestore.GetOptions options = const firestore.GetOptions(),
  ]) async => _snapshot();

  @override
  Stream<firestore.QuerySnapshotPlatform> snapshots({
    bool includeMetadataChanges = false,
    required firestore.ListenSource listenSource,
  }) => Stream.multi((controller) {
    _db.backend.subscriptions.add(path);
    final subscription = _db.backend._documentChanges.stream
        .where((changedPath) => changedPath.startsWith('$path/'))
        .listen(
          (_) => controller.add(_snapshot()),
          onError: controller.addError,
          onDone: controller.close,
        );
    controller.add(_snapshot());
    controller.onCancel = subscription.cancel;
  });
}

class _MemoryFunctions extends functions.FirebaseFunctionsPlatform {
  _MemoryFunctions(this.backend, [String region = 'us-east1'])
    : super(null, region);

  final CampaignRefreshFirebase backend;

  @override
  functions.FirebaseFunctionsPlatform delegateFor({
    FirebaseApp? app,
    required String region,
  }) => _MemoryFunctions(backend, region);

  @override
  functions.HttpsCallablePlatform httpsCallable(
    String? origin,
    String name,
    functions.HttpsCallableOptions options,
  ) => _MemoryCallable(this, origin, name, options);
}

class _MemoryCallable extends functions.HttpsCallablePlatform {
  _MemoryCallable(
    _MemoryFunctions functions,
    String? origin,
    String name,
    functions.HttpsCallableOptions options,
  ) : super(functions, origin, name, options, null);

  @override
  Future<dynamic> call([dynamic parameters]) async {
    final backend = (this.functions as _MemoryFunctions).backend;
    backend.calls.add(name!);
    final data = parameters == null
        ? <String, dynamic>{}
        : Map<String, dynamic>.from(parameters as Map);
    backend.callArguments.add({'name': name, 'data': _copyMap(data)});
    final handler = backend.onCall;
    if (handler == null) {
      throw UnsupportedError('Unexpected Firebase callable: $name');
    }
    return handler(name!, data);
  }
}
