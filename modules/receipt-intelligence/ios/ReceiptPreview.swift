import QuickLook
import UIKit

/// Downloads protected originals into a temporary directory owned by one preview.
@MainActor
final class ReceiptPreview: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  private var files: [URL] = []
  private let directory = FileManager.default.temporaryDirectory.appendingPathComponent("receipt-preview-\(UUID().uuidString)")
  private let completion: () -> Void

  init(completion: @escaping () -> Void) { self.completion = completion }

  func present(urls: [String], token: String, from presenter: UIViewController) async throws {
    guard !urls.isEmpty, urls.count <= 8 else { throw RenderError.unavailable("Ugyldig antall bilder.") }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    do {
      for (position, address) in urls.enumerated() {
        guard let url = URL(string: address), url.scheme == "https" else { throw RenderError.unavailable("Ugyldig bildeadresse.") }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (temporary, response) = try await URLSession.shared.download(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
          try? FileManager.default.removeItem(at: temporary)
          throw RenderError.unavailable("Bildet kunne ikke hentes.")
        }
        let file = directory.appendingPathComponent("Kvittering-\(position + 1).jpg")
        try FileManager.default.moveItem(at: temporary, to: file)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: file.path)
        files.append(file)
      }
      let controller = QLPreviewController()
      controller.dataSource = self
      controller.delegate = self
      presenter.present(controller, animated: true)
    } catch {
      cleanUp()
      throw error
    }
  }

  /// Copies only app-owned cached images; legacy HTTPS previews remain supported.
  func presentLocal(urls: [String], from presenter: UIViewController) throws {
    guard !urls.isEmpty, urls.count <= 8,
      let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    else { throw RenderError.unavailable("Ugyldig antall bilder.") }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    do {
      for (position, address) in urls.enumerated() {
        guard let url = URL(string: address), url.isFileURL,
          url.resolvingSymlinksInPath().path.hasPrefix(cache.resolvingSymlinksInPath().path + "/kvitto-receipt-images")
        else { throw RenderError.unavailable("Ugyldig bildeadresse.") }
        let file = directory.appendingPathComponent("Kvittering-\(position + 1).jpg")
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        try FileManager.default.copyItem(at: url, to: file)
        files.append(file)
      }
      let controller = QLPreviewController()
      controller.dataSource = self
      controller.delegate = self
      presenter.present(controller, animated: true)
    } catch { cleanUp(); throw error }
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { files.count }
  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { files[index] as NSURL }
  nonisolated func previewControllerDidDismiss(_ controller: QLPreviewController) {
    Task { @MainActor in
      self.cleanUp()
      self.completion()
    }
  }
  private func cleanUp() { try? FileManager.default.removeItem(at: directory) }
}
