import ExpoModulesCore
import VisionKit

/// Owns one scanner presentation. Cancellation returns no pages and never saves a receipt.
final class ReceiptDocumentScanner: NSObject, VNDocumentCameraViewControllerDelegate {
  private let maxPages: Int
  private let promise: Promise
  private let completion: () -> Void

  init(maxPages: Int, promise: Promise, completion: @escaping () -> Void) {
    self.maxPages = maxPages
    self.promise = promise
    self.completion = completion
  }

  func present(from presenter: UIViewController) {
    let controller = VNDocumentCameraViewController()
    controller.delegate = self
    controller.modalPresentationStyle = .fullScreen
    presenter.present(controller, animated: true)
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) {
      self.promise.resolve(nil as [String]?)
      self.completion()
    }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    controller.dismiss(animated: true) {
      self.promise.reject("SCANNER_FAILED", error.localizedDescription)
      self.completion()
    }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    var files: [URL] = []
    do {
      guard scan.pageCount > 0, scan.pageCount <= maxPages else {
        throw RenderError.unavailable("Velg mellom 1 og \(maxPages) sider.")
      }
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent("kvitto-scans", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      for index in 0..<scan.pageCount {
        guard let data = scan.imageOfPage(at: index).jpegData(compressionQuality: 0.95) else {
          throw RenderError.unavailable("Kunne ikke lagre den skannede siden.")
        }
        let file = directory.appendingPathComponent("\(UUID().uuidString).jpg")
        files.append(file)
        try data.write(to: file, options: .atomic)
      }
      let uris = files.map(\.absoluteString)
      controller.dismiss(animated: true) {
        self.promise.resolve(uris)
        self.completion()
      }
    } catch {
      for file in files { try? FileManager.default.removeItem(at: file) }
      controller.dismiss(animated: true) {
        self.promise.reject("SCANNER_FAILED", error.localizedDescription)
        self.completion()
      }
    }
  }
}
