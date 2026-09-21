import ExpoModulesCore
import PDFKit
import UIKit
import VisionKit

/// Renders PDF receipts to images on the device. Reading happens on the server.
public class ReceiptIntelligenceModule: Module {
  private var scanner: ReceiptDocumentScanner?
  public func definition() -> ModuleDefinition {
    Name("ReceiptIntelligence")

    Function("isDocumentScannerSupported") { VNDocumentCameraViewController.isSupported }

    AsyncFunction("scanDocument") { (maxPages: Int, promise: Promise) in
      guard self.scanner == nil else {
        promise.reject("SCANNER_BUSY", "Skanneren er allerede åpen.")
        return
      }
      guard VNDocumentCameraViewController.isSupported,
            let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("SCANNER_UNAVAILABLE", "Dokumentskanneren er ikke tilgjengelig på denne enheten.")
        return
      }
      let scanner = ReceiptDocumentScanner(maxPages: maxPages, promise: promise) { self.scanner = nil }
      self.scanner = scanner
      scanner.present(from: presenter)
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
