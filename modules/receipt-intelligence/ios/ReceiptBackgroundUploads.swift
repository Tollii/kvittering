import ExpoModulesCore
import Foundation
import UIKit

/// iOS owns file transfers after scheduling. The receipt queue remains the retry journal.
final class ReceiptBackgroundUploads: NSObject, URLSessionDataDelegate {
  static let shared = ReceiptBackgroundUploads()
  static let identifier = "no.tolnes.kvitto.receipt-uploads"
  private var scope: String? = UserDefaults.standard.string(forKey: "receipt-upload-scope")
  private var waiting: [String: [Promise]] = [:]
  /// Keys whose task lookup is in progress. Calls meanwhile wait for its outcome.
  private var checking: Set<String> = []
  /// Bytes each key's task had moved when a call last joined it.
  private var joinedAt: [String: Int64] = [:]
  /// Keys whose task moved nothing between two calls. The next such call replaces it.
  private var stalled: Set<String> = []
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
    waiting[key, default: []].append(promise)
    guard checking.insert(key).inserted else { return }
    session.getAllTasks { tasks in
      DispatchQueue.main.async {
        self.checking.remove(key)
        guard self.waiting[key] != nil else { return }
        guard let scope = self.scope, key.hasPrefix(scope + ":") else {
          for pending in self.waiting.removeValue(forKey: key) ?? [] { pending.reject("UPLOAD_CANCELLED", "Kontoen er endret.") }
          return
        }
        // Completion can arrive while getAllTasks is in progress.
        if UserDefaults.standard.bool(forKey: "receipt-upload:\(key)") {
          for pending in self.waiting.removeValue(forKey: key) ?? [] {
            pending.resolve(["status": 200, "body": ""])
          }
          return
        }
        if let task = tasks.first(where: {
          $0.taskDescription == key && !self.replaced.contains($0.taskIdentifier)
            && ($0.state == .running || $0.state == .suspended)
        }) {
          if self.join(task, key: key) { return }
          // The queue spends a retry and backs off while the new task runs.
          for pending in self.waiting.removeValue(forKey: key) ?? [] {
            pending.reject("UPLOAD_STALLED", "Bildet ble ikke sendt. Prøv igjen.")
          }
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.allHTTPHeaderFields = headers
        let task = self.session.uploadTask(with: request, fromFile: file)
        task.taskDescription = key
        self.joinedAt[key] = 0
        task.resume()
      }
    }
  }

  /**
   A repeated call joins the task in flight, which costs nothing while it moves.
   A task that moves nothing between two calls gets one more wait. After that it
   is cancelled for a new one, and the call fails, so a transfer that never moves
   uses up the queue's retries and shows an error instead of retrying forever.
   */
  private func join(_ task: URLSessionTask, key: String) -> Bool {
    // A suspended task never runs again on its own.
    if task.state == .suspended { task.resume() }
    let moved = task.countOfBytesSent + task.countOfBytesReceived
    if let previous = joinedAt[key], moved <= previous {
      if stalled.insert(key).inserted { return true }
      stalled.remove(key)
      replaced.insert(task.taskIdentifier)
      task.cancel()
      return false
    }
    joinedAt[key] = moved
    stalled.remove(key)
    return true
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
    if replaced.remove(task.taskIdentifier) != nil { return }
    let promises = waiting.removeValue(forKey: key) ?? []
    joinedAt.removeValue(forKey: key)
    stalled.remove(key)
    if let error {
      for promise in promises { promise.reject("UPLOAD_FAILED", error.localizedDescription) }
      return
    }
    for promise in promises { promise.resolve(["status": status, "body": String(data: body, encoding: .utf8) ?? ""]) }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    let completion = completionHandler
    completionHandler = nil
    completion?()
  }
}
