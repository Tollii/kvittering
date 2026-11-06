import ExpoModulesCore
import Foundation
import UIKit

/// iOS owns file transfers after scheduling. The receipt queue remains the retry journal.
final class ReceiptBackgroundUploads: NSObject, URLSessionDataDelegate {
  static let shared = ReceiptBackgroundUploads()
  static let identifier = "no.tolnes.kvitto.receipt-uploads"
  private var scope: String? = UserDefaults.standard.string(forKey: "receipt-upload-scope")
  /// Calls that may find a task idle and still join it before it is replaced.
  private static let freeIdleJoins = 1
  /// One image's transfer as calls see it. Its promises settle together.
  private struct Transfer {
    var promises: [Promise] = []
    /// The task lookup in progress. Calls meanwhile share its outcome.
    var lookup: Int?
    /// The task a call last measured, and the bytes it had moved by then.
    var seen: (task: Int, bytes: Int64)?
    /// Calls in a row that found the same task had moved nothing.
    var idleCalls = 0
  }
  private var transfers: [String: Transfer] = [:]
  private var lookups = 0
  /// Tasks cancelled for a replacement; their completion settles nothing.
  private var replaced: Set<Int> = []
  private var responseBodies: [Int: Data] = [:]
  var completionHandler: (() -> Void)?
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    configuration.waitsForConnectivity = true
    configuration.timeoutIntervalForResource = 3600
    configuration.httpMaximumConnectionsPerHost = 3
    return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
  }()

  func reconnect() { _ = session }

  func upload(key: String, uri: String, address: String, headers: [String: String], promise: Promise) {
    guard let scope, key.hasPrefix(scope + ":"), let file = URL(string: uri), file.isFileURL,
          let url = URL(string: address), url.scheme == "https" else {
      promise.reject("UPLOAD_INPUT", "Ugyldig opplasting.")
      return
    }
    if UserDefaults.standard.bool(forKey: "receipt-upload:\(key)") {
      promise.resolve(["status": 200, "body": ""])
      return
    }
    var transfer = transfers[key, default: Transfer()]
    transfer.promises.append(promise)
    let looking = transfer.lookup != nil
    if !looking {
      lookups += 1
      transfer.lookup = lookups
    }
    transfers[key] = transfer
    guard !looking, let lookup = transfer.lookup else { return }
    session.getAllTasks { tasks in
      DispatchQueue.main.async {
        // A completion settled everyone first, or a newer lookup owns the key.
        guard self.transfers[key]?.lookup == lookup else { return }
        self.transfers[key]?.lookup = nil
        guard let scope = self.scope, key.hasPrefix(scope + ":") else {
          self.settle(key) { $0.reject("UPLOAD_CANCELLED", "Kontoen er endret.") }
          return
        }
        // Completion can arrive while getAllTasks is in progress.
        if UserDefaults.standard.bool(forKey: "receipt-upload:\(key)") {
          self.settle(key) { $0.resolve(["status": 200, "body": ""]) }
          return
        }
        if let task = tasks.first(where: {
          $0.taskDescription == key && ($0.state == .running || $0.state == .suspended)
        }) {
          // A suspended task never runs again on its own.
          if task.state == .suspended { task.resume() }
          if self.keepsMoving(task, key: key) { return }
          self.replaced.insert(task.taskIdentifier)
          task.cancel()
          // The queue spends a retry and backs off while the new task runs.
          self.settle(key) { $0.reject("UPLOAD_STALLED", "Bildet ble ikke sendt. Prøv igjen.") }
        }
        self.start(key: key, url: url, headers: headers, file: file)
      }
    }
  }

  /**
   Whether a repeated call should join the task in flight, which costs nothing
   while it moves. A task that moved nothing since the last call gets
   `freeIdleJoins` more waits; after that the caller replaces it and fails, so a
   transfer that never moves uses up the queue's retries and shows an error
   instead of retrying forever.
   */
  private func keepsMoving(_ task: URLSessionTask, key: String) -> Bool {
    var transfer = transfers[key, default: Transfer()]
    let bytes = task.countOfBytesSent + task.countOfBytesReceived
    if let seen = transfer.seen, seen.task == task.taskIdentifier, bytes <= seen.bytes {
      transfer.idleCalls += 1
    } else {
      transfer.idleCalls = 0
    }
    transfer.seen = (task.taskIdentifier, bytes)
    transfers[key] = transfer
    return transfer.idleCalls <= Self.freeIdleJoins
  }

  private func start(key: String, url: URL, headers: [String: String], file: URL) {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.allHTTPHeaderFields = headers
    let task = session.uploadTask(with: request, fromFile: file)
    task.taskDescription = key
    var transfer = transfers[key, default: Transfer()]
    transfer.seen = (task.taskIdentifier, 0)
    transfer.idleCalls = 0
    transfers[key] = transfer
    task.resume()
  }

  /// Settle every call waiting on the key, and forget its transfer.
  private func settle(_ key: String, _ outcome: (Promise) -> Void) {
    for promise in transfers.removeValue(forKey: key)?.promises ?? [] { outcome(promise) }
  }

  func retainScope(_ scope: String?) {
    self.scope = scope
    UserDefaults.standard.set(scope, forKey: "receipt-upload-scope")
    session.getAllTasks { tasks in
      DispatchQueue.main.async {
        for task in tasks {
          guard let current = self.scope, (task.taskDescription ?? "").hasPrefix(current + ":") else { task.cancel(); continue }
        }
      }
    }
    for key in UserDefaults.standard.dictionaryRepresentation().keys where key.hasPrefix("receipt-upload:") {
      if scope == nil || !key.hasPrefix("receipt-upload:\(scope!):") { UserDefaults.standard.removeObject(forKey: key) }
    }
  }

  func forget(_ keys: [String]) {
    for key in keys { UserDefaults.standard.removeObject(forKey: "receipt-upload:\(key)") }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    var body = responseBodies[dataTask.taskIdentifier] ?? Data()
    if body.count < 4096 { body.append(data.prefix(4096 - body.count)) }
    responseBodies[dataTask.taskIdentifier] = body
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let body = responseBodies.removeValue(forKey: task.taskIdentifier) ?? Data()
    guard let key = task.taskDescription else { return }
    let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
    // A replaced task can finish before its cancel lands; its upload still counts.
    if error == nil, (200..<300).contains(status), let scope, key.hasPrefix(scope + ":") {
      UserDefaults.standard.set(true, forKey: "receipt-upload:\(key)")
    }
    // The replaced task's callers were already answered; its successor owns the key.
    if replaced.remove(task.taskIdentifier) != nil { return }
    if let error {
      settle(key) { $0.reject("UPLOAD_FAILED", error.localizedDescription) }
      return
    }
    settle(key) { $0.resolve(["status": status, "body": String(data: body, encoding: .utf8) ?? ""]) }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    let completion = completionHandler
    completionHandler = nil
    completion?()
  }
}
