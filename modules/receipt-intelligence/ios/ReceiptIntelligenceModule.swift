import ExpoModulesCore
import PDFKit
import UIKit
import TipKit
import WidgetKit

/// Renders PDF receipts to images on the device. Reading happens on the server.
public class ReceiptIntelligenceModule: Module {
  private var preview: ReceiptPreview?
  public func definition() -> ModuleDefinition {
    Name("ReceiptIntelligence")
    AsyncFunction("hasPurchaseWidget") { (promise: Promise) in
      WidgetCenter.shared.getCurrentConfigurations { result in
        promise.resolve((try? result.get().contains { $0.kind == "PurchaseWidget" }) ?? false)
      }
    }
    Function("supportsReceiptTips") { if #available(iOS 17.0, *) { return true }; return false }
    Function("completeReceiptTip") { (kind: String) in
      if #available(iOS 17.0, *) {
        if kind == "matching" { ProductMatchTip().invalidate(reason: .actionPerformed) }
        else { SpendingWidgetTip().invalidate(reason: .actionPerformed) }
      }
    }
    View(ReceiptTipView.self) {
      Prop("kind") { (view: ReceiptTipView, kind: String) in view.kind = kind }
      Events("onHeightChange")
    }


    AsyncFunction("uploadReceiptImage") { (key: String, uri: String, address: String, headers: [String: String], promise: Promise) in
      ReceiptBackgroundUploads.shared.upload(key: key, uri: uri, address: address, headers: headers, promise: promise)
    }.runOnQueue(.main)
    Function("retainUploadScope") { (scope: String?) in DispatchQueue.main.async { ReceiptBackgroundUploads.shared.retainScope(scope) } }
    Function("forgetUploads") { (keys: [String]) in DispatchQueue.main.async { ReceiptBackgroundUploads.shared.forget(keys) } }


    AsyncFunction("indexReceipts") { (receipts: [SearchReceipt], promise: Promise) in
      ReceiptSearch.shared.replace(receipts, promise: promise)
    }

    AsyncFunction("previewReceipts") { (urls: [String], token: String, promise: Promise) in
      Task { @MainActor in
        guard self.preview == nil, let presenter = self.appContext?.utilities?.currentViewController() else {
          promise.reject("PREVIEW_UNAVAILABLE", "Forhåndsvisningen er allerede åpen.")
          return
        }
        let preview = ReceiptPreview { self.preview = nil }
        self.preview = preview
        do { try await preview.present(urls: urls, token: token, from: presenter); promise.resolve(nil) }
        catch { self.preview = nil; promise.reject("PREVIEW_FAILED", error.localizedDescription) }
      }
    }.runOnQueue(.main)

    /// Render each page of a PDF receipt to a JPEG file and return the file URIs in page order.
    AsyncFunction("renderPdf") { (uri: String, maxPages: Int) throws -> [String] in
      guard let url = URL(string: uri), url.isFileURL else { throw RenderError.unavailable("PDF-filen må finnes på enheten.") }
      let accessing = url.startAccessingSecurityScopedResource()
      defer { if accessing { url.stopAccessingSecurityScopedResource() } }
      guard let document = PDFDocument(url: url) else { throw RenderError.unavailable("Kunne ikke åpne PDF-filen.") }
      guard document.pageCount > 0 else { throw RenderError.unavailable("PDF-filen har ingen sider.") }
      guard document.pageCount <= maxPages else { throw RenderError.unavailable("PDF-filen har for mange sider (maks \(maxPages)).") }
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent("kvitto-pdf", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var output: [String] = []
      for index in 0..<document.pageCount {
        guard let page = document.page(at: index) else { continue }
        let bounds = page.bounds(for: .mediaBox)
        // Receipts are text-dense: aim for roughly 2400 px on the long side, like camera captures.
        let scale = min(4, max(1, 2400 / max(bounds.width, bounds.height)))
        let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
          UIColor.white.setFill()
          context.fill(CGRect(origin: .zero, size: size))
          context.cgContext.translateBy(x: 0, y: size.height)
          context.cgContext.scaleBy(x: scale, y: -scale)
          page.draw(with: .mediaBox, to: context.cgContext)
        }
        guard let data = image.jpegData(compressionQuality: 0.85) else { throw RenderError.unavailable("Kunne ikke lage bilde av side \(index + 1).") }
        let file = directory.appendingPathComponent("\(UUID().uuidString)-\(index).jpg")
        try data.write(to: file)
        output.append(file.absoluteString)
      }
      return output
    }
  }
}

enum RenderError: LocalizedError {
  case unavailable(String)
  var errorDescription: String? {
    switch self { case .unavailable(let message): return message }
  }
}
