import ExpoModulesCore
import Foundation
import UIKit

/// iOS owns file transfers after scheduling. The receipt queue remains the retry journal.
final class ReceiptBackgroundUploads: NSObject, URLSessionDataDelegate {
  static let shared = ReceiptBackgroundUploads()
  static let identifier = "no.tolnes.kvitto.receipt-uploads"
  private var scope: String? = UserDefaults.standard.string(forKey: "receipt-upload-scope")
  private var waiting: [String: [Promise]] = [:]
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
    guard waiting[key]?.count == 1 else { return }
    session.getAllTasks { tasks in
      DispatchQueue.main.async {
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
        if tasks.contains(where: {
          $0.taskDescription == key && ($0.state == .running || $0.state == .suspended)
        }) { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.allHTTPHeaderFields = headers
        let task = self.session.uploadTask(with: request, fromFile: file)
        task.taskDescription = key
        task.resume()
      }
    }
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
    guard let key = task.taskDescription else { return }
    let promises = waiting.removeValue(forKey: key) ?? []
    let body = responseBodies.removeValue(forKey: task.taskIdentifier) ?? Data()
    if let error {
      for promise in promises { promise.reject("UPLOAD_FAILED", error.localizedDescription) }
      return
    }
    let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
    if (200..<300).contains(status), let scope, key.hasPrefix(scope + ":") { UserDefaults.standard.set(true, forKey: "receipt-upload:\(key)") }
    for promise in promises { promise.resolve(["status": status, "body": String(data: body, encoding: .utf8) ?? ""]) }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    let completion = completionHandler
    completionHandler = nil
    completion?()
  }
}
