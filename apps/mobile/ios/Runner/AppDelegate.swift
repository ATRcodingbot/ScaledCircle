import Flutter
import CoreLocation
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "ActiveJobTrackingBridge") {
      ActiveJobTrackingBridge(messenger: registrar.messenger()).register()
    }
    ActiveJobLocationManager.shared.restoreIfNeeded()
  }
}

private final class ActiveTrackingStore {
  static let shared = ActiveTrackingStore()
  private let defaults = UserDefaults.standard
  private let queue = DispatchQueue(label: "com.scaledcircle.tracking-store")
  private var pointsURL: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("scaled_circle_tracking_points.jsonl")
  }

  func start(_ config: [String: String]) {
    queue.sync {
      try? FileManager.default.createDirectory(at: pointsURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      // Preserve queued evidence whenever the backend returns the same
      // long-lived session, including retrying a reopened segment.
      let resume = sessionId == config["sessionId"]
      if resume {
        defaults.set(true, forKey: "tracking.active")
        defaults.set(Int(config["cutoffAtMs"] ?? "0") ?? 0, forKey: "tracking.cutoffAtMs")
        defaults.removeObject(forKey: "tracking.stopReason")
        defaults.removeObject(forKey: "tracking.stoppedAtMs")
        return
      }
      try? Data().write(to: pointsURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      excludeTrackingDataFromBackup()
      let keys = ["active", "sessionId", "campaignId", "zoneId", "scalerId", "zoneName", "startedAtMs", "nextSequence", "acknowledgedSequence", "lastLocation", "lastError"]
      keys.forEach { defaults.removeObject(forKey: "tracking.\($0)") }
      defaults.set(true, forKey: "tracking.active")
      config.forEach { defaults.set($0.value, forKey: "tracking.\($0.key)") }
      defaults.set(Int(config["cutoffAtMs"] ?? "0") ?? 0, forKey: "tracking.cutoffAtMs")
      defaults.set(Int(Date().timeIntervalSince1970 * 1000), forKey: "tracking.startedAtMs")
      defaults.set(1, forKey: "tracking.nextSequence")
      defaults.set(0, forKey: "tracking.acknowledgedSequence")
    }
  }

  var isActive: Bool { defaults.bool(forKey: "tracking.active") }
  var sessionId: String? { defaults.string(forKey: "tracking.sessionId") }
  var zoneName: String { defaults.string(forKey: "tracking.zoneName") ?? "active job" }
  var cutoffAtMs: Int { defaults.integer(forKey: "tracking.cutoffAtMs") }
  var cutoffReached: Bool {
    cutoffAtMs > 0 && Int(Date().timeIntervalSince1970 * 1000) >= cutoffAtMs
  }

  func append(_ location: CLLocation, forcedFlags: [String] = []) -> [String: Any] {
    queue.sync {
      var flags = forcedFlags
      if !CLLocationCoordinate2DIsValid(location.coordinate) { flags.append("invalid_coordinates") }
      if location.horizontalAccuracy < 0 || location.horizontalAccuracy > 100 { flags.append("low_accuracy") }
      if location.speed > 15 { flags.append("impossible_speed") }
      if let previous = lastPoint(),
         let latitude = previous["latitude"] as? Double,
         let longitude = previous["longitude"] as? Double,
         let timestamp = previous["timestampMs"] as? Double {
        let elapsed = location.timestamp.timeIntervalSince1970 - timestamp / 1000
        if elapsed > 0 {
          let prior = CLLocation(latitude: latitude, longitude: longitude)
          if location.distance(from: prior) / elapsed > 15 { flags.append("impossible_jump") }
        }
      }
      let sequence = max(1, defaults.integer(forKey: "tracking.nextSequence"))
      let rejected = Set(["invalid_coordinates", "low_accuracy", "impossible_speed", "impossible_jump"])
      var point: [String: Any] = [
        "sequence": sequence,
        "sessionId": sessionId ?? "",
        "campaignId": defaults.string(forKey: "tracking.campaignId") ?? "",
        "zoneId": defaults.string(forKey: "tracking.zoneId") ?? "",
        "scalerId": defaults.string(forKey: "tracking.scalerId") ?? "",
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "timestampMs": Int(location.timestamp.timeIntervalSince1970 * 1000),
        "horizontalAccuracy": location.horizontalAccuracy,
        "accepted": flags.allSatisfy { !rejected.contains($0) },
        "flags": flags,
      ]
      if location.speed >= 0 { point["speed"] = location.speed }
      if location.course >= 0 { point["heading"] = location.course }
      if let data = try? JSONSerialization.data(withJSONObject: point), var line = String(data: data, encoding: .utf8) {
        line += "\n"
        if !FileManager.default.fileExists(atPath: pointsURL.path) { FileManager.default.createFile(atPath: pointsURL.path, contents: nil) }
        if let handle = try? FileHandle(forWritingTo: pointsURL) { try? handle.seekToEnd(); try? handle.write(contentsOf: Data(line.utf8)); try? handle.close() }
      }
      defaults.set(sequence + 1, forKey: "tracking.nextSequence")
      defaults.set(point, forKey: "tracking.lastLocation")
      return point
    }
  }

  func stop(reason: String) {
    defaults.set(false, forKey: "tracking.active")
    defaults.set(reason, forKey: "tracking.stopReason")
    defaults.set(Int(Date().timeIntervalSince1970 * 1000), forKey: "tracking.stoppedAtMs")
  }

  func state() -> [String: Any?] {
    let next = max(1, defaults.integer(forKey: "tracking.nextSequence"))
    let ack = defaults.integer(forKey: "tracking.acknowledgedSequence")
    return [
      "active": isActive, "sessionId": sessionId,
      "campaignId": defaults.string(forKey: "tracking.campaignId"), "zoneId": defaults.string(forKey: "tracking.zoneId"),
      "startedAtMs": defaults.object(forKey: "tracking.startedAtMs"), "pointCount": next - 1,
      "pendingPointCount": max(0, next - 1 - ack), "lastLocation": defaults.dictionary(forKey: "tracking.lastLocation"),
      "lastError": defaults.string(forKey: "tracking.lastError"),
    ]
  }

  func chunks(maximumPoints: Int) -> [[String: Any]] {
    guard let session = sessionId else { return [] }
    let ack = defaults.integer(forKey: "tracking.acknowledgedSequence")
    let points = readPoints().filter { ($0["sequence"] as? Int ?? 0) > ack }
    return stride(from: 0, to: points.count, by: max(1, min(100, maximumPoints))).map { index in
      let endIndex = min(points.count, index + max(1, min(100, maximumPoints)))
      let slice = Array(points[index..<endIndex])
      let start = slice.first?["sequence"] as? Int ?? 0
      let end = slice.last?["sequence"] as? Int ?? 0
      return ["id": "\(session)_\(start)_\(end)", "startSequence": start, "endSequence": end, "points": slice]
    }
  }
  func acknowledge(_ sequence: Int) { if sequence > defaults.integer(forKey: "tracking.acknowledgedSequence") { defaults.set(sequence, forKey: "tracking.acknowledgedSequence") } }
  func purgeAcknowledgedEvidence(expectedSessionId: String) -> Bool {
    queue.sync {
      guard sessionId == expectedSessionId else { return false }
      let finalSequence = max(0, defaults.integer(forKey: "tracking.nextSequence") - 1)
      guard defaults.integer(forKey: "tracking.acknowledgedSequence") >= finalSequence else { return false }
      try? FileManager.default.removeItem(at: pointsURL)
      defaults.dictionaryRepresentation().keys
        .filter { $0.hasPrefix("tracking.") }
        .forEach { defaults.removeObject(forKey: $0) }
      return true
    }
  }
  private func excludeTrackingDataFromBackup() {
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var url = pointsURL
    try? url.setResourceValues(values)
  }
  private func readPoints() -> [[String: Any]] {
    guard let text = try? String(contentsOf: pointsURL, encoding: .utf8) else { return [] }
    return text.split(separator: "\n").compactMap { line in
      guard let data = line.data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
      return object
    }
  }
  private func lastPoint() -> [String: Any]? { defaults.dictionary(forKey: "tracking.lastLocation") }
}

private final class ActiveJobLocationManager: NSObject, CLLocationManagerDelegate {
  static let shared = ActiveJobLocationManager()
  private let manager = CLLocationManager()
  private let store = ActiveTrackingStore.shared
  private var oneShot: (([String: Any]?) -> Void)?
  private var oneShotFlags: [String] = []
  private var cutoffTimer: DispatchWorkItem?

  override init() {
    super.init()
    manager.delegate = self
    manager.activityType = .fitness
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.distanceFilter = 12
    manager.pausesLocationUpdatesAutomatically = true
    manager.allowsBackgroundLocationUpdates = true
    manager.showsBackgroundLocationIndicator = true
  }

  func restoreIfNeeded() {
    if store.isActive && store.cutoffReached { stopForCutoff(); return }
    if store.isActive { manager.startUpdatingLocation(); scheduleCutoff() }
  }
  func start(config: [String: String]) throws {
    guard CLLocationManager.locationServicesEnabled() else { throw TrackingError.locationDisabled }
    let authorization = manager.authorizationStatus
    guard authorization == .authorizedWhenInUse || authorization == .authorizedAlways else { throw TrackingError.permissionDenied }
    guard !store.isActive else { throw TrackingError.alreadyActive }
    store.start(config)
    guard !store.cutoffReached else {
      store.stop(reason: "work_window_cutoff")
      throw TrackingError.workWindowClosed
    }
    manager.startUpdatingLocation()
    scheduleCutoff()
  }
  func capture(flags: [String] = [], completion: @escaping ([String: Any]?) -> Void) {
    oneShot = completion; oneShotFlags = flags; manager.requestLocation()
  }
  func stop(reason: String, captureFinal: Bool, completion: @escaping () -> Void) {
    let finish = { self.cutoffTimer?.cancel(); self.manager.stopUpdatingLocation(); self.store.stop(reason: reason); completion() }
    if captureFinal { capture(flags: ["final_point"]) { _ in finish() } } else { finish() }
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if store.cutoffReached { stopForCutoff(); return }
    locations.sorted { $0.timestamp < $1.timestamp }.forEach { location in
      let point = store.append(location, forcedFlags: oneShot == nil ? [] : oneShotFlags)
      if let callback = oneShot { oneShot = nil; oneShotFlags = []; callback(point) }
    }
  }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { if let callback = oneShot { oneShot = nil; callback(nil) } }
  private func scheduleCutoff() {
    cutoffTimer?.cancel()
    let delay = max(0, Double(store.cutoffAtMs) / 1000 - Date().timeIntervalSince1970)
    let work = DispatchWorkItem { [weak self] in self?.stopForCutoff() }
    cutoffTimer = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }
  private func stopForCutoff() {
    cutoffTimer?.cancel()
    manager.stopUpdatingLocation()
    store.stop(reason: "work_window_cutoff")
  }
  enum TrackingError: Error { case locationDisabled, permissionDenied, alreadyActive, workWindowClosed }
}

private final class ActiveJobTrackingBridge: NSObject, FlutterPlugin {
  private let channel: FlutterMethodChannel
  init(messenger: FlutterBinaryMessenger) { channel = FlutterMethodChannel(name: "com.scaledcircle/active_job_tracking", binaryMessenger: messenger) }
  func register() { channel.setMethodCallHandler(handle) }
  static func register(with registrar: FlutterPluginRegistrar) {}
  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let store = ActiveTrackingStore.shared
    let arguments = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "getState": result(store.state())
    case "start":
      let keys = ["sessionId", "campaignId", "zoneId", "scalerId", "zoneName"]
      let config = Dictionary(uniqueKeysWithValues: keys.map { ($0, arguments[$0] as? String ?? "") })
      guard config.values.allSatisfy({ !$0.isEmpty }) else { result(FlutterError(code: "invalid_config", message: "Tracking session configuration is incomplete.", details: nil)); return }
      let cutoffAtMs = (arguments["cutoffAtMs"] as? NSNumber)?.intValue ?? 0
      guard cutoffAtMs > Int(Date().timeIntervalSince1970 * 1000) else { result(FlutterError(code: "work_window_closed", message: "This job is outside its allowed work window.", details: nil)); return }
      let nativeConfig = config.merging([
        "cutoffAtMs": String(cutoffAtMs),
        "resume": (arguments["resume"] as? Bool == true) ? "true" : "false",
      ]) { _, new in new }
      do { try ActiveJobLocationManager.shared.start(config: nativeConfig); ActiveJobLocationManager.shared.capture(flags: ["start_point"]) { _ in result(nil) } }
      catch ActiveJobLocationManager.TrackingError.locationDisabled { result(FlutterError(code: "location_disabled", message: "Turn on Location Services before starting this job.", details: nil)) }
      catch ActiveJobLocationManager.TrackingError.permissionDenied { result(FlutterError(code: "permission_denied", message: "Location permission is required during an active job.", details: nil)) }
      catch ActiveJobLocationManager.TrackingError.workWindowClosed { result(FlutterError(code: "work_window_closed", message: "This job is outside its allowed work window.", details: nil)) }
      catch { result(FlutterError(code: "already_active", message: "A tracking session is already active.", details: nil)) }
    case "pendingChunks": result(store.chunks(maximumPoints: arguments["maximumPoints"] as? Int ?? 50))
    case "acknowledgeChunk": store.acknowledge(arguments["endSequence"] as? Int ?? 0); result(nil)
    case "purgeAcknowledgedEvidence":
      result(store.purgeAcknowledgedEvidence(expectedSessionId: arguments["sessionId"] as? String ?? ""))
    case "captureCheckpointLocation": ActiveJobLocationManager.shared.capture(flags: ["checkpoint"]) { result($0) }
    case "stop": ActiveJobLocationManager.shared.stop(reason: arguments["reason"] as? String ?? "stopped", captureFinal: arguments["captureFinalPoint"] as? Bool ?? false) { result(nil) }
    default: result(FlutterMethodNotImplemented)
    }
  }
}
